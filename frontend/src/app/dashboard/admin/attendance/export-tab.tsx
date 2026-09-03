'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarRange, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { attendanceApi } from '@/lib/api/attendance.api'
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
        person_type: personType,
        date_from: dateFrom,
        date_to: dateTo,
        department_id: departmentId || undefined,
        section_id: sectionId || undefined,
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
            <div className="grid grid-cols-2 gap-4">
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
              <Select value={personType} onValueChange={(v) => setPersonType(v as ExportPersonType)}>
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
                  <Select value={departmentId} onValueChange={(v) => { setDepartmentId(v ?? ''); setSectionId('') }}>
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
                  <Select value={sectionId} onValueChange={(v) => setSectionId(v ?? '')} disabled={!departmentId}>
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