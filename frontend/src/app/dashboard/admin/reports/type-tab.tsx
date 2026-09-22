'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Award, CalendarRange, Sun } from 'lucide-react'

import { Tabs } from '@/components/ui/tabs'
import { reportsApi } from '@/lib/api/reports.api'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { REPORT_STATUS_LABELS, type ReportStatus, type ReportType } from '@/types/reports'
import { StatusList } from './status-list'
import { MissingList } from './missing-list'

type StatusTab = ReportStatus | 'missing'

const STATUS_TABS: { value: StatusTab; label: string; active: 'navy' | 'primary' | 'destructive' | 'secondary' | 'orange' }[] = [
  { value: 'draft', label: REPORT_STATUS_LABELS.draft, active: 'navy' },
  { value: 'submitted', label: REPORT_STATUS_LABELS.submitted, active: 'primary' },
  { value: 'rejected', label: REPORT_STATUS_LABELS.rejected, active: 'destructive' },
  { value: 'validated', label: REPORT_STATUS_LABELS.validated, active: 'secondary' },
  { value: 'missing', label: 'Non soumis', active: 'orange' },
]

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function Count({ value }: { value: number | undefined }) {
  if (value === undefined) return null
  return <span className="ml-1.5 rounded-full bg-white/25 px-1.5 py-0.5 text-[11px] font-semibold leading-none">{value}</span>
}

/** Un type de rapport : 5 pills de statut (brouillon, soumis, rejeté, validé,
 * non-soumis) avec compteurs. */
export function TypeTab({ reportType }: { reportType: ReportType }) {
  const [status, setStatus] = useState<StatusTab>('submitted')
  const [missingDate, setMissingDate] = useState(todayIso())
  const [missingSearch, setMissingSearch] = useState('')

  const counts = useQuery({
    queryKey: ['reports', 'status-counts', { reportType }],
    queryFn: async () => {
      const entries = await Promise.all(
        (['draft', 'submitted', 'rejected', 'validated'] as ReportStatus[]).map(async (s) => {
          const res = await reportsApi.list({ report_type: reportType, status: s, limit: 1 })
          return [s, res.data.total] as const
        })
      )
      return Object.fromEntries(entries) as Record<ReportStatus, number>
    },
  })

  const missingQuery = useQuery({
    queryKey: ['reports', 'missing', { reportType, date: missingDate }],
    queryFn: () => reportsApi.listMissing({ report_type: reportType, date: missingDate }).then((r) => r.data),
  })

  const countFor = (tab: StatusTab): number | undefined =>
    tab === 'missing' ? missingQuery.data?.total : counts.data?.[tab]

  return (
    <Tabs value={status} onValueChange={(v) => v && setStatus(v as StatusTab)}>
      <PillsTabsList>
        {STATUS_TABS.map((tab) => (
          <PillsTrigger key={tab.value} value={tab.value} active={tab.active}>
            {tab.label}
            <Count value={countFor(tab.value)} />
          </PillsTrigger>
        ))}
      </PillsTabsList>

      {(Object.keys(REPORT_STATUS_LABELS) as ReportStatus[]).map((s) => (
        <TabPanel key={s} value={s}>
          {status === s && <StatusList reportType={reportType} status={s} />}
        </TabPanel>
      ))}
      <TabPanel value="missing">
        {status === 'missing' && (
          <MissingList
            date={missingDate}
            onDateChange={setMissingDate}
            search={missingSearch}
            onSearchChange={setMissingSearch}
            data={missingQuery.data}
            isLoading={missingQuery.isLoading}
          />
        )}
      </TabPanel>
    </Tabs>
  )
}

export const TYPE_TAB_META = [
  { value: 'quotidien' as ReportType, icon: Sun, active: 'sky' as const },
  { value: 'bi_mensuel' as ReportType, icon: CalendarRange, active: 'teal' as const },
  { value: 'annuel' as ReportType, icon: Award, active: 'primary' as const },
]
