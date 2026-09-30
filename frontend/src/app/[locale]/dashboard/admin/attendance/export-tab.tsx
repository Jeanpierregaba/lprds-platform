'use client'

import { useTranslations } from 'next-intl'

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
import { toIsoDate } from '@/lib/utils/dates'
import type { ExportFileFormat, ExportPersonType } from '@/types/attendance'

type PeriodType = 'day' | 'week' | 'month' | 'custom'

// Date calendaire locale (jamais toISOString/UTC : à 00h30 locale on daterait d'hier).
const iso = (d: Date) => toIsoDate(d)

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
  const t = useTranslations('attendance')
  const tCommon = useTranslations('common')
  const [period, setPeriod] = useState<PeriodType>('week')
  // Période initiale = semaine en cours (sinon le premier export part vide).
  const [dateFrom, setDateFrom] = useState(() => periodRange('week').from)
  const [dateTo, setDateTo] = useState(() => periodRange('week').to)
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
      toast.error(t('export.noPeriod'))
      return
    }
    if (dateTo < dateFrom) {
      toast.error(t('export.badRange'))
      return
    }
    // Même plafond que le backend (422 au-delà) : refusé avant l'appel.
    const days = Math.round(
      (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000
    ) + 1
    if (days > 366) {
      toast.error(t('export.tooLong'))
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
      // Le backend nomme désormais en `.xlsx` ; le repli local fait pareil
      // (jamais `.excel`, inconnu de l'OS au double-clic).
      const filename = match?.[1] ?? `presences_${dateFrom}_${dateTo}.${format === 'pdf' ? 'pdf' : 'xlsx'}`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      // Revocation différée : synchrone juste après click() course sur gros blobs.
      setTimeout(() => {
        URL.revokeObjectURL(url)
        a.remove()
      }, 5000)
      toast.success(`Export téléchargé (${filename}).`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="mt-2 space-y-4">
      <p className="text-sm text-white font-semibold">
        {t('export.intro')}
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('export.personTitle')}</CardTitle>
          <CardDescription>
            {t('export.personHint')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedPerson ? (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                <Badge variant="outline">{selectedPerson.kind === 'child' ? t('export.child') : t('export.staff')}</Badge>
                <span className="min-w-0 truncate text-sm font-medium">{selectedPerson.label}</span>
                {selectedPerson.sub && <span className="min-w-0 shrink-0 truncate text-xs text-muted-foreground">{selectedPerson.sub}</span>}
              <button
                type="button"
                onClick={() => setSelectedPerson(null)}
                className="ml-auto shrink-0 text-xs text-muted-foreground hover:text-foreground"
                aria-label={t('export.removePerson')}
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
                  placeholder={t('export.searchPlaceholder')}
                  aria-label={t('export.searchAria')}
                  value={personSearch}
                  onChange={(e) => setPersonSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setPersonSearch('') }}
                  className="pl-9"
                />
              </div>
              {searchActive && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                  {searching ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">{tCommon('states.searching')}</p>
                  ) : results.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">{t('export.noPerson')}</p>
                  ) : (
                    results.map((p) => (
                      <button
                        key={`${p.kind}-${p.id}`}
                        type="button"
                        onClick={() => pickPerson(p)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <Badge variant="outline">{p.kind === 'child' ? t('export.child') : t('export.staff')}</Badge>
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
            <CardTitle className="text-base">{t('export.periodTitle')}</CardTitle>
            <CardDescription>{t('export.periodHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('export.periodType')}</Label>
              <Select value={period} onValueChange={(v) => applyPeriod(v as PeriodType)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('export.choosePeriod')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">{t('export.day')}</SelectItem>
                  <SelectItem value="week">{t('export.week')}</SelectItem>
                  <SelectItem value="month">{t('export.month')}</SelectItem>
                  <SelectItem value="custom">{t('export.custom')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date_from">{t('export.from')}</Label>
                <Input
                  id="date_from" type="date" value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  disabled={period !== 'custom'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date_to">{t('export.to')}</Label>
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
            <CardTitle className="text-base">{t('export.contentTitle')}</CardTitle>
            <CardDescription>{t('export.scopeHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('export.people')}</Label>
              <Select value={personType} onValueChange={(v) => setPersonType(v as ExportPersonType)} disabled={!!selectedPerson}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('export.choosePeople')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">{t('export.both')}</SelectItem>
                  <SelectItem value="children">{t('export.childrenOnly')}</SelectItem>
                  <SelectItem value="staff">{t('export.staffOnly')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {personType !== 'staff' && (
              <>
                <div className="space-y-2">
                  <Label>{t('export.department')}</Label>
                  <Select value={departmentId} onValueChange={(v) => { setDepartmentId(v ?? ''); setSectionId('') }} disabled={!!selectedPerson}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('export.allDepartments')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{t('export.allDepartments')}</SelectItem>
                      {(departments ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('export.section')}</Label>
                  <Select value={sectionId} onValueChange={(v) => setSectionId(v ?? '')} disabled={!departmentId || !!selectedPerson}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={departmentId ? t('export.allSections') : t('export.pickDepartmentFirst')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{t('export.allSections')}</SelectItem>
                      {(sections ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>{t('export.format')}</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as ExportFileFormat)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('export.chooseFormat')} />
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
        <Button onClick={download} disabled={downloading || !dateFrom || !dateTo || dateTo < dateFrom}>
          {downloading ? (
            <><Loader2 className="mr-2 size-4 animate-spin" /> {t('export.generating')}</>
          ) : (
            <><CalendarRange className="mr-2 size-4" /> {t('export.submit')}</>
          )}
        </Button>
      </div>
    </div>
  )
}