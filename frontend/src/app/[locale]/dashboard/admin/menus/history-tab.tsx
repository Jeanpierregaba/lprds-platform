'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableBody, TableRow } from '@/components/ui/table'
import { menusApi } from '@/lib/api/menus.api'
import { parseIsoDate } from '@/lib/utils/dates'
import { DataTable, DataTableHead, TableSkeletonRows, Td, Th } from '@/components/dashboard/shared/table'
import { ListPagination } from '@/components/dashboard/shared/pagination'

const PAGE_SIZE = 20

function formatDate(iso: string) {
  return parseIsoDate(iso).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' })
}

export function HistoryTab({ onSelectMenu }: { onSelectMenu: (weekStart: string, departmentId: string) => void }) {
  const t = useTranslations('menus')
  const ALL = '__all__'
  const [skip, setSkip] = useState(0)
  const [departmentId, setDepartmentId] = useState<string>(ALL)

  useEffect(() => setSkip(0), [departmentId])

  const { data: departments = [] } = useQuery({
    queryKey: ['menus', 'visible-departments'],
    queryFn: () => menusApi.getVisibleDepartments().then((r) => r.data.items),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['menus', 'history', { skip, departmentId }],
    queryFn: () => menusApi.list({
      skip, limit: PAGE_SIZE,
      department_id: departmentId === ALL ? undefined : departmentId,
    }).then((r) => r.data),
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []

  return (
    <div className="space-y-4 pt-2">
      <div className="flex w-full flex-col gap-1.5 sm:w-52">
        <Label htmlFor="history-department">{t('history.department')}</Label>
        <Select
          items={{ [ALL]: t('history.allDepartments'), ...Object.fromEntries(departments.map((d) => [d.id, d.name])) }}
          value={departmentId}
          onValueChange={(v) => v && setDepartmentId(v)}
        >
          <SelectTrigger id="history-department" className="h-9 w-full">
            <SelectValue placeholder={t('history.allDepartments')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('history.allDepartments')}</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable>
        <DataTableHead>
          <Th>{t('history.week')}</Th>
          <Th>{t('history.department')}</Th>
          <Th>{t('history.lastModified')}</Th>
          <Th className="w-10" />
        </DataTableHead>
        <TableBody>
          {isLoading ? (
            <TableSkeletonRows
              widths={['h-4 w-48', 'h-4 w-24', 'h-4 w-32', '']}
            />
          ) : items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={4} className="h-48 text-center">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                    <History className="size-5" />
                  </div>
                  <p className="font-medium text-foreground">{t('history.empty')}</p>
                </div>
              </Td>
            </TableRow>
          ) : (
            items.map((menu) => (
              <TableRow
                key={menu.id}
                className="cursor-pointer"
                onClick={() => onSelectMenu(menu.week_start, menu.department_id)}
                title={t('history.viewTitle')}
              >
                <Td className="font-medium">
                  {formatDate(menu.week_start)} — {formatDate(menu.week_end)}
                </Td>
                <Td className="text-muted-foreground">
                  {menu.department_name ?? '—'}
                </Td>
                <Td className="text-muted-foreground">{formatDateTime(menu.updated_at)}</Td>
                <Td>
                  <Button variant="ghost" size="sm" onClick={() => onSelectMenu(menu.week_start, menu.department_id)}>
                    {t('history.view')}
                  </Button>
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>

      <ListPagination
        label={t('history.count', { count: total })}
        skip={skip}
        pageSize={PAGE_SIZE}
        total={total}
        onSkipChange={setSkip}
      />
    </div>
  )
}
