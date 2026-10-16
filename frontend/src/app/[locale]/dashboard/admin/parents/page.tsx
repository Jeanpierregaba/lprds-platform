'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye, Loader2, Plus, UserCheck, Users, UserX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { TableBody, TableRow } from '@/components/ui/table'
import { parentsApi } from '@/lib/api/parents.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { cn } from '@/lib/utils/cn'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { InactiveSwitch, SearchInput, ViewToggle, type ViewMode } from '@/components/dashboard/shared/filters'
import { DataTable, DataTableHead, TableSkeletonRows, Td, Th } from '@/components/dashboard/shared/table'
import { CardsEmptyState, CardsGrid, CardsSkeleton, ClickableCard, StaggerItem, StatusPill } from '@/components/dashboard/shared/cards'
import { ListPagination } from '@/components/dashboard/shared/pagination'
import { ConfirmDialog } from '@/components/dashboard/shared/dialogs'
import type { ParentListItem } from '@/types/parents'
import { Link } from '@/i18n/navigation'
import { displayName } from '@/lib/utils/display-name'
import { useListParams, useUrlSearch } from '@/lib/hooks/use-list-params'
import { PARENTS_LIST_PATH } from '../list-paths'

const PAGE_SIZE = 20

/** Les filtres vivent dans l'URL : ouvrir une fiche puis revenir en arrière
 *  doit retrouver cet écran, pas une liste remise à zéro. Constante de module —
 *  son identité sert de dépendance au hook. */
const LIST_DEFAULTS = {
  q: '',
  inactive: false,
  skip: 0,
  view: 'cards' as ViewMode,
}

export default function ParentsListPage() {
  const t = useTranslations('parents')
  const tCommon = useTranslations('common')
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('parents:write')
  const { params, setParams, setFilter, detailHref } = useListParams(PARENTS_LIST_PATH, LIST_DEFAULTS)
  const { inactive: includeInactive, skip, view } = params
  const debouncedSearch = params.q
  const [search, setSearch] = useUrlSearch(params.q, (q) => setFilter({ q }))

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['parents', { search: debouncedSearch, includeInactive, skip }],
    queryFn: () =>
      parentsApi
        .list({ search: debouncedSearch || undefined, include_inactive: includeInactive, skip, limit: PAGE_SIZE })
        .then((r) => r.data),
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []

  return (
    <PageMotion className="space-y-6">
      <PageHeader
        title={t('list.title')}
        description={t('list.description')}
        actions={
          canWrite ? (
          <Button render={<Link href="/dashboard/admin/parents/new" />}>
            <Plus className="mr-1.5 size-4" />
            {t('list.new')}
          </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <SearchInput
          placeholder={t('list.search')}
          value={search}
          onChange={setSearch}
        />
        <InactiveSwitch
          id="include-inactive"
          checked={includeInactive}
          onCheckedChange={(checked) => setFilter({ inactive: checked })}
          label={t('list.includeInactive')}
        />

        <ViewToggle view={view} onChange={(next) => setParams({ view: next })} />
      </div>

      {view === 'cards' ? (
        <ParentsCardGrid
          items={items}
          isLoading={isLoading}
          hasSearch={!!debouncedSearch}
          detailHref={detailHref}
        />
      ) : (
      <DataTable>
        <DataTableHead>
          <Th>{t('list.columns.name')}</Th>
          <Th>{t('list.columns.email')}</Th>
          <Th>{t('list.columns.phone')}</Th>
          <Th>{t('list.columns.children')}</Th>
          <Th>{t('list.columns.status')}</Th>
        </DataTableHead>
        <TableBody>
          {isLoading ? (
            <TableSkeletonRows
              widths={['h-4 w-40', 'h-4 w-40', 'h-4 w-28', 'h-4 w-10', 'h-5 w-14 rounded-full']}
            />
          ) : items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={5} className="h-56 text-center">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                    <Users className="size-5" />
                  </div>
                  <p className="font-medium text-foreground">
                    {debouncedSearch ? t('list.emptySearch') : t('list.empty')}
                  </p>
                  <p className="max-w-sm text-sm">
                    {debouncedSearch
                      ? t('list.emptySearchHint')
                      : t('list.emptyHint')}
                  </p>
                  {!debouncedSearch && canWrite && (
                    <Button render={<Link href="/dashboard/admin/parents/new" />} size="sm" className="mt-1">
                      <Plus className="mr-1.5 size-4" />
                      {t('list.new')}
                    </Button>
                  )}
                </div>
              </Td>
            </TableRow>
          ) : (
            items.map((p) => (
              <TableRow key={p.id} className={cn(!p.is_active && 'opacity-70')}>
                <Td>
                  <Link href={detailHref(p.id)} className="block font-medium">
                    {displayName(p)}
                  </Link>
                </Td>
                <Td>
                  <Link href={detailHref(p.id)} className="block text-muted-foreground">
                    {p.email}
                  </Link>
                </Td>
                <Td>
                  <Link href={detailHref(p.id)} className="block text-muted-foreground">
                    {p.phone ?? '—'}
                  </Link>
                </Td>
                <Td>
                  <Link href={detailHref(p.id)} className="block text-muted-foreground">
                    {p.children_count}
                  </Link>
                </Td>
                <Td>
                  <Link href={detailHref(p.id)} className="block">
                    <StatusPill active={p.is_active} />
                  </Link>
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>
      )}

      <ListPagination
        label={<>{t('list.count', { count: total })} {isFetching && !isLoading && `· ${tCommon('states.refreshing')}`}</>}
        skip={skip}
        pageSize={PAGE_SIZE}
        total={total}
        onSkipChange={(next) => setParams({ skip: next })}
      />
    </PageMotion>
  )
}

function ParentsCardGrid({
  items, isLoading, hasSearch, detailHref,
}: { items: ParentListItem[]; isLoading: boolean; hasSearch: boolean; detailHref: (id: string) => string }) {
  const t = useTranslations('parents')
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('parents:write')

  if (isLoading) {
    return <CardsSkeleton />
  }

  if (items.length === 0) {
    return (
      <CardsEmptyState
        icon={Users}
        title={hasSearch ? t('list.emptySearch') : t('list.empty')}
      />
    )
  }

  return (
    <CardsGrid>
      {items.map((parent, i) => (
        <StaggerItem key={parent.id} index={i}>
          <ParentCard parent={parent} canWrite={canWrite} detailHref={detailHref(parent.id)} />
        </StaggerItem>
      ))}
    </CardsGrid>
  )
}

function ParentCard({
  parent, canWrite, detailHref,
}: {
  parent: ParentListItem
  canWrite: boolean
  detailHref: string
}) {
  const t = useTranslations('parents')
  const queryClient = useQueryClient()
  const [confirmToggle, setConfirmToggle] = useState(false)

  const toggleMutation = useMutation({
    mutationFn: () => parentsApi.update(parent.id, { is_active: !parent.is_active }),
    onSuccess: () => {
      toast.success(parent.is_active ? t('status.deactivated') : t('status.reactivated'))
      queryClient.invalidateQueries({ queryKey: ['parents'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  return (
    <>
      <ClickableCard
        href={detailHref}
        label={t('list.openAccount', { name: displayName(parent) })}
        inactive={!parent.is_active}
      >
      <CardContent className="space-y-1.5 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 break-words font-display text-xl font-semibold leading-tight">
            {displayName(parent)}
          </p>
          <StatusPill active={parent.is_active} shrink />
        </div>
        <p className="truncate text-sm text-muted-foreground" title={parent.email}>{parent.email}</p>
        <p className="text-sm">
          <span className="font-medium">{t('list.phoneLabel')}</span> {parent.phone ?? '—'}
        </p>
        <p className="text-sm">
          <span className="font-medium">{t('list.childrenLabel')}</span> {parent.children_count}
        </p>

        <div className="flex flex-wrap gap-2 pt-3">
          <Button variant="outline" size="sm" className="rounded-xl bg-accent" render={<Link href={detailHref} />}>
            <Eye className="mr-1.5 size-4" />
            {t('list.view')}
          </Button>
          {canWrite && (
            parent.is_active ? (
              <Button
                size="sm"
                className="rounded-xl bg-warning text-warning-foreground hover:brightness-95"
                onClick={(e) => { e.stopPropagation(); setConfirmToggle(true) }}
              >
                <UserX className="mr-1.5 size-4" />
                {t('status.deactivate')}
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="rounded-xl" onClick={(e) => { e.stopPropagation(); toggleMutation.mutate() }} disabled={toggleMutation.isPending}>
                {toggleMutation.isPending
                  ? <Loader2 className="mr-1.5 size-4 animate-spin" />
                  : <UserCheck className="mr-1.5 size-4" />}
                {t('status.reactivate')}
              </Button>
            )
          )}
        </div>
      </CardContent>
      </ClickableCard>

      <ConfirmDialog
        open={confirmToggle}
        onOpenChange={setConfirmToggle}
        title={t('status.confirmTitle')}
        description={t('status.confirmBody', { name: displayName(parent) })}
        confirmLabel={t('status.deactivate')}
        onConfirm={() => {
          setConfirmToggle(false)
          toggleMutation.mutate()
        }}
      />
    </>
  )
}
