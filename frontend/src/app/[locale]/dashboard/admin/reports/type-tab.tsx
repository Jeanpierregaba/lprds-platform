'use client'

import { useTranslations } from 'next-intl'
import { useLabel } from '@/lib/i18n/labels'
import { useQuery } from '@tanstack/react-query'
import { Award, CalendarRange, Sun } from 'lucide-react'

import { Tabs } from '@/components/ui/tabs'
import { reportsApi } from '@/lib/api/reports.api'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { REPORT_STATUSES, type ReportStatus, type ReportType } from '@/types/reports'
import { StatusList } from './status-list'
import { useReportListParams, type StatusTab } from './list-params'
import { MissingList } from './missing-list'

/** Couleur de la pastille par statut — invariant, contrairement au libellé,
 *  qui dépend désormais de la langue et se résout donc dans le composant. */
const STATUS_TAB_STYLE: { value: StatusTab; active: 'navy' | 'primary' | 'destructive' | 'secondary' | 'orange' }[] = [
  { value: 'draft', active: 'navy' },
  { value: 'submitted', active: 'primary' },
  { value: 'rejected', active: 'destructive' },
  { value: 'validated', active: 'secondary' },
  { value: 'missing', active: 'orange' },
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
  const tTabs = useTranslations('reports.tabs')
  const reportStatusLabel = useLabel('reportStatus')
  // Dans l'URL, comme l'onglet de type : un retour de validation doit
  // retrouver la pastille d'où l'on est parti, pas « Soumis » par défaut.
  const { params, setFilter } = useReportListParams()
  const status = params.status
  // La date de « Non soumis » vit elle aussi dans l'URL : c'est un filtre, et
  // c'était le dernier état de cet écran qu'un retour arrière perdait.
  const missingDate = params.date || todayIso()

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
    <Tabs value={status} onValueChange={(v) => v && setFilter({ status: v as StatusTab })}>
      <PillsTabsList>
        {STATUS_TAB_STYLE.map((tab) => (
          <PillsTrigger key={tab.value} value={tab.value} active={tab.active}>
            {tab.value === 'missing' ? tTabs('missing') : reportStatusLabel(tab.value)}
            <Count value={countFor(tab.value)} />
          </PillsTrigger>
        ))}
      </PillsTabsList>

      {REPORT_STATUSES.map((s) => (
        <TabPanel key={s} value={s}>
          {status === s && <StatusList reportType={reportType} status={s} />}
        </TabPanel>
      ))}
      <TabPanel value="missing">
        {status === 'missing' && (
          <MissingList
            date={missingDate}
            onDateChange={(date) => setFilter({ date })}
            search={params.q}
            onSearchChange={(q) => setFilter({ q })}
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
