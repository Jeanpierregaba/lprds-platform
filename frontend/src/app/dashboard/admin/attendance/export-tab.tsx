'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarRange, FileSpreadsheet, FileText, Loader2, Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { attendanceApi } from '@/lib/api/attendance.api'
import { childrenApi } from '@/lib/api/children.api'
import { staffApi } from '@/lib/api/staff.api'
import { organizationApi } from '@/lib/api/organization.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import type { ExportFileFormat, ExportPersonType } from '@/types/attendance'

type PeriodType = 'day' | 'week' | 'month' | 'custom'

const iso = (d: Date) => d.toISOString().slice(0, 10)

function periodRange(period: PeriodType): { from: string; to: string } {
  const now = new Date()
  switch (period) {
    case 'day':
      return { from: iso(now), to: iso(now) }
    case 'week': {
      const monday = new Date(now)
      const day = (now.getDay() + 6) % 7 // 0=lundi ... 6=dimanche
      monday.setDate(now.getDate() - day)
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      return { from: iso(monday), to: iso(sunday) }
    }
    case 'month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: iso(first), to: iso(last) }
    }
    default:
      return { from: iso(now), to: iso(now) }
  }
}

export function ExportTab() {
  const [period, setPeriod] = useState<PeriodType>('week')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [personType, setPersonType] = useState<ExportPersonType>('both')
  const [departmentId, setDepartmentId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [format, setFormat] = useState<ExportFileFormat>('pdf')
  const [downloading, setDownloading] = useState(false)

  // Personne précise (facultatif) : recherche + sélection, prime sur le reste.
  interface SelectedPerson { id: string; kind: 'child' | 'staff'; label: string; sub: string | null }
  const [personSearch, setPersonSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedPerson, setSelectedPerson] = useState<SelectedPerson | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(personSearch.trim()), 300)
    return () => clearTimeout(t)
  }, [personSearch])

  const searchActive = debouncedSearch.length >= 2 && !selectedPerson
  const { data: childHits, isLoading: childrenSearching } = useQuery({
    queryKey: ['attendance-export-search', 'children', debouncedSearch],
    queryFn: () => childrenApi.list({ search: debouncedSearch, limit: 8 }).then((r) => r.data),
    enabled: searchActive,
  })
  const { data: staffHits, isLoading: staffSearching } = useQuery({
    queryKey: ['attendance-export-search', 'staff', debouncedSearch],
    queryFn: () => staffApi.list({ search: debouncedSearch, limit: 8 }).then((r) => r.data),
    enabled: searchActive,
  })
  const searching = childrenSearching || staffSearching
  const results: SelectedPerson[] = searchActive
    ? [
        ...(childHits?.items ?? []).map((c) => ({
          id: c.id, kind: 'child' as const,
          label: `${c.first_names} ${c.last_name}`, sub: c.matricule,
        })),
        ...(staffHits?.items ?? []).map((s) => ({
          id: s.id, kind: 'staff' as const,
          label: s.nickname || `${s.first_name} ${s.last_name}`, sub: s.matricule,
        })),
      ]
    : []

  const pickPerson = (p: SelectedPerson) => {
    setSelectedPerson(p)
    setPersonSearch('')
    setDebouncedSearch('')
  }

  const applyPeriod = (p: PeriodType) => {
    setPeriod(p)
    if (p !== 'custom') {
      const range = periodRange(p)
      setDateFrom(range.from)
      setDateTo(range.to)
    }
  }

  const { data: departments } = useQuery({
    queryKey: ['departments', { includeInactive: false }],
    queryFn: () => organizationApi.listDepartments(false).then((r) => r.data),
  })

  const { data: sections } = useQuery({
    queryKey: ['sections', { departmentId }],
    queryFn: () =>
      departmentId
        ? organizationApi.listSections({ department_id: departmentId, include_inactive: false }).then((r) => r.data)
        : Promise.resolve([]),
    enabled: !!departmentId,
  })

  const download = async () => {
    if (!dateFrom || !dateTo) {
      toast.error('Sélectionnez une période.')
      return
    }
    if (dateTo < dateFrom) {
      toast.error('La date de fin doit être postérieure ou égale à la date de début.')
      return
    }
    setDownloading(true)
    try {
      const res = await attendanceApi.exportAttendance({
        format,
        person_type: selectedPerson ? (selectedPerson.kind === 'child' ? 'children' : 'staff') : personType,
        date_from: dateFrom,
        date_to: dateTo,
        department_id: selectedPerson ? undefined : departmentId || undefined,
        section_id: selectedPerson ? undefined : sectionId || undefined,
        child_id: selectedPerson?.kind === 'child' ? selectedPerson.id : undefined,
        staff_id: selectedPerson?.kind === 'staff' ? selectedPerson.id : undefined,
      })
      const blob = res.data as Blob
      const disposition = res.headers['content-disposition']
      const match = /filename="([^"]+)"/.exec(disposition ?? '')
      const filename = match?.[1] ?? `presences_${dateFrom}_${dateTo}.${format === 'pdf' ? 'pdf' : 'xlsx'}`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="mt-2 space-y-4">
      <p className="text-sm text-white font-semibold">
        Export agrégé des présences (statut par personne et par jour) en PDF ou Excel,
        pour les enfants et/ou le personnel. Période limitée à 366 jours.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personne précise (facultatif)</CardTitle>
          <CardDescription>
            Recherchez un enfant ou un membre du personnel pour n&apos;exporter que lui.
            Tant qu&apos;une personne est sélectionnée, les filtres ci-dessous sont ignorés.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedPerson ? (
            <div className="flex items-center gap-2 rounded-md border px-3 py-2">
              <Badge variant="outline">{selectedPerson.kind === 'child' ? 'Enfant' : 'Personnel'}</Badge>
              <span className="min-w-0 truncate text-sm font-medium">{selectedPerson.label}</span>
              {selectedPerson.sub && <span className="truncate text-xs text-muted-foreground">{selectedPerson.sub}</span>}
              <button
                type="button"
                onClick={() => setSelectedPerson(null)}
                className="ml-auto shrink-0 text-xs text-muted-foreground hover:text-foreground"
                aria-label="Retirer la personne sélectionnée"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Rechercher par nom, prénom ou surnom (2 lettres min)…"
                  aria-label="Rechercher une personne précise"
                  value={personSearch}
                  onChange={(e) => setPersonSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {searchActive && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                  {searching ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">Recherche…</p>
                  ) : results.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">Aucune personne trouvée.</p>
                  ) : (
                    results.map((p) => (
                      <button
                        key={`${p.kind}-${p.id}`}
                        type="button"
                        onClick={() => pickPerson(p)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <Badge variant="outline">{p.kind === 'child' ? 'Enfant' : 'Personnel'}</Badge>
                        <span className="min-w-0 truncate font-medium">{p.label}</span>
                        {p.sub && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{p.sub}</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Période</CardTitle>
            <CardDescription>Presets rapides ou période personnalisée.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Type de période</Label>
              <Select value={period} onValueChange={(v) => applyPeriod(v as PeriodType)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir une période" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Jour</SelectItem>
                  <SelectItem value="week">Semaine (lundi → dimanche)</SelectItem>
                  <SelectItem value="month">Mois</SelectItem>
                  <SelectItem value="custom">Personnalisée</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date_from">Du</Label>
                <Input
                  id="date_from" type="date" value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  disabled={period !== 'custom'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date_to">Au</Label>
                <Input
                  id="date_to" type="date" value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  disabled={period !== 'custom'}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contenu &amp; format</CardTitle>
            <CardDescription>Qui exporter et dans quel format.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Personnes</Label>
              <Select value={personType} onValueChange={(v) => setPersonType(v as ExportPersonType)} disabled={!!selectedPerson}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir qui exporter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Enfants + Personnel</SelectItem>
                  <SelectItem value="children">Enfants uniquement</SelectItem>
                  <SelectItem value="staff">Personnel uniquement</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {personType !== 'staff' && (
              <>
                <div className="space-y-2">
                  <Label>Département (enfants)</Label>
                  <Select value={departmentId} onValueChange={(v) => { setDepartmentId(v ?? ''); setSectionId('') }} disabled={!!selectedPerson}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Tous les départements" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Tous les départements</SelectItem>
                      {(departments ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Section (enfants)</Label>
                  <Select value={sectionId} onValueChange={(v) => setSectionId(v ?? '')} disabled={!departmentId || !!selectedPerson}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={departmentId ? 'Toutes les sections' : 'Choisissez un département d’abord'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Toutes les sections</SelectItem>
                      {(sections ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as ExportFileFormat)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir un format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">
                    <FileText className="mr-2 inline size-4" /> PDF
                  </SelectItem>
                  <SelectItem value="excel">
                    <FileSpreadsheet className="mr-2 inline size-4" /> Excel
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={download} disabled={downloading}>
          {downloading ? (
            <><Loader2 className="mr-2 size-4 animate-spin" /> Génération...</>
          ) : (
            <><CalendarRange className="mr-2 size-4" /> Exporter</>
          )}
        </Button>
      </div>
    </div>
  )
}