'use client'

import { useTranslations } from 'next-intl'

import { useQuery } from '@tanstack/react-query'
import { useLabelMap } from '@/lib/i18n/labels'
import { REPORT_TYPES } from '@/types/reports'

import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { directoryApi } from '@/lib/api/directory.api'
import { useDirectoryUnits } from '@/lib/hooks/use-directory'
import { GALLERY_SOURCES, type GalleryMediaParams } from '@/types/gallery'

export const ALL = '__all__'

export interface GalleryFilterState {
  source: string
  childId: string
  groupId: string
  departmentId: string
  staffId: string
  reportType: string
  dateFrom: string
  dateTo: string
}

export const EMPTY_FILTERS: GalleryFilterState = {
  source: ALL, childId: ALL, groupId: ALL, departmentId: ALL,
  staffId: ALL, reportType: ALL, dateFrom: '', dateTo: '',
}

export function toParams(f: GalleryFilterState): GalleryMediaParams {
  return {
    source: f.source === ALL ? undefined : (f.source as GalleryMediaParams['source']),
    child_id: f.childId === ALL ? undefined : f.childId,
    group_id: f.groupId === ALL ? undefined : f.groupId,
    department_id: f.departmentId === ALL ? undefined : f.departmentId,
    staff_id: f.staffId === ALL ? undefined : f.staffId,
    report_type: f.reportType === ALL ? undefined : (f.reportType as GalleryMediaParams['report_type']),
    date_from: f.dateFrom || undefined,
    date_to: f.dateTo || undefined,
  }
}

const isReportFilter = (f: GalleryFilterState) =>
  f.childId !== ALL || f.groupId !== ALL || f.departmentId !== ALL ||
  f.staffId !== ALL || f.reportType !== ALL

export { isReportFilter }

export function GalleryFilters({
  filters, onChange, hideSource,
}: {
  filters: GalleryFilterState
  onChange: (f: GalleryFilterState) => void
  /** Staff délégué : rapports uniquement (la messagerie reste hors RBAC) —
   * le sélecteur de source est masqué, la page force `source=report`. */
  hideSource?: boolean
}) {
  const t = useTranslations('gallery')
  const tCommon = useTranslations('common')
  const gallerySourcesLabels = useLabelMap('gallerySources', GALLERY_SOURCES)
  const reportTypesLabels = useLabelMap('reportTypes', REPORT_TYPES)
  // ⚠️ Les quatre listes viennent de l'ANNUAIRE. Elles appelaient les modules
  // Enfants, Organisation et Personnel, donc `gallery:read` ne suffisait pas à
  // remplir les filtres de la galerie : le staff délégué voyait « tous les
  // enfants » et rien d'autre. Et claude.md le disait déjà de la galerie —
  // « `gallery:read` n'implique pas `reports:read` », aucun couplage caché
  // entre modules : filtrer n'est pas consulter.
  const { data: children } = useQuery({
    queryKey: ['directory', 'children', { limit: 200 }],
    queryFn: () => directoryApi.listChildren({ limit: 200 }).then((r) => r.data.items),
  })
  const { data: staff } = useQuery({
    queryKey: ['directory', 'staff', { limit: 200 }],
    queryFn: () => directoryApi.listStaff({ limit: 200 }).then((r) => r.data.items),
  })
  const { departments, groups } = useDirectoryUnits()

  const set = <K extends keyof GalleryFilterState>(key: K, value: GalleryFilterState[K]) =>
    onChange({ ...filters, [key]: value })

  const childItems = { [ALL]: t('filters.allChildren'), ...Object.fromEntries((children ?? []).map((c) => [c.id, c.display_name])) }
  const deptItems = { [ALL]: t('filters.allDepartments'), ...Object.fromEntries(departments.map((d) => [d.id, d.name])) }
  const groupItems = { [ALL]: t('filters.allGroups'), ...Object.fromEntries(groups.map((g) => [g.id, g.name])) }
  const staffItems = { [ALL]: t('filters.allStaff'), ...Object.fromEntries((staff ?? []).map((s) => [s.id, s.display_name])) }

  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS)

  return (
    <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
      {!hideSource && (
      <Select items={{ [ALL]: t('filters.allSources'), ...gallerySourcesLabels }} value={filters.source} onValueChange={(v) => set('source', v ?? ALL)}>
        <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t('filters.allSources')} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('filters.allSources')}</SelectItem>
          {Object.entries(gallerySourcesLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
      )}

      <Select items={childItems} value={filters.childId} onValueChange={(v) => set('childId', v ?? ALL)}>
        <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder={t('filters.allChildren')} /></SelectTrigger>
        <SelectContent>
          {Object.entries(childItems).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select items={groupItems} value={filters.groupId} onValueChange={(v) => set('groupId', v ?? ALL)}>
        <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t('filters.allGroupsPlaceholder')} /></SelectTrigger>
        <SelectContent>
          {Object.entries(groupItems).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select items={deptItems} value={filters.departmentId} onValueChange={(v) => set('departmentId', v ?? ALL)}>
        <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder={t('filters.allDepartments')} /></SelectTrigger>
        <SelectContent>
          {Object.entries(deptItems).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select items={staffItems} value={filters.staffId} onValueChange={(v) => set('staffId', v ?? ALL)}>
        <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder={t('filters.allStaffPlaceholder')} /></SelectTrigger>
        <SelectContent>
          {Object.entries(staffItems).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select items={{ [ALL]: t('filters.allTypes'), ...reportTypesLabels }} value={filters.reportType} onValueChange={(v) => set('reportType', v ?? ALL)}>
        <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t('filters.allTypes')} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('filters.allTypes')}</SelectItem>
          {Object.entries(reportTypesLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>

      <div className="grid w-full grid-cols-1 gap-1.5 sm:w-auto sm:grid-cols-[auto_auto_auto] sm:items-center">
        <Input type="date" value={filters.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} className="w-full sm:w-36" aria-label={t('filters.dateFrom')} />
        <span className="hidden text-center text-muted-foreground sm:inline">–</span>
        <Input type="date" value={filters.dateTo} onChange={(e) => set('dateTo', e.target.value)} className="w-full sm:w-36" aria-label={t('filters.dateTo')} />
      </div>

      {hasActiveFilters && (
        <Button type="button" variant="ghost" size="sm" className="w-full sm:w-auto" onClick={() => onChange(EMPTY_FILTERS)}>
          {tCommon('actions.reset')}
        </Button>
      )}
    </div>
  )
}
