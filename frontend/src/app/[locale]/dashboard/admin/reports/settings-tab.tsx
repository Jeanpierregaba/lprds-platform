'use client'

import { useTranslations } from 'next-intl'

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLabel } from '@/lib/i18n/labels'
import { toast } from 'sonner'

import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { organizationApi } from '@/lib/api/organization.api'
import { reportsApi } from '@/lib/api/reports.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { REPORT_TYPES, type ReportType } from '@/types/reports'

export function SettingsTab() {
  const t = useTranslations('reports')
  const reportTypesLabel = useLabel('reportTypes')
  const queryClient = useQueryClient()

  const { data: departments, isLoading: isLoadingDepartments } = useQuery({
    queryKey: ['departments', { includeInactive: false }],
    queryFn: () => organizationApi.listDepartments(false).then((r) => r.data),
  })

  const typeQueries = useQueries({
    queries: (departments ?? []).map((d) => ({
      queryKey: ['reports', 'department-types', d.id],
      queryFn: () => reportsApi.listDepartmentReportTypes(d.id).then((r) => r.data),
      enabled: !!departments,
    })),
  })

  const isLoadingTypes = typeQueries.some((q) => q.isLoading)
  const typesByDept = new Map(
    (departments ?? []).map((d, i) => [d.id, new Set((typeQueries[i]?.data ?? []).map((t) => t.report_type))])
  )

  const toggleMutation = useMutation({
    mutationFn: ({ departmentId, reportType, enabled }: { departmentId: string; reportType: ReportType; enabled: boolean }) =>
      enabled
        ? reportsApi.assignDepartmentReportType(departmentId, reportType)
        : reportsApi.unassignDepartmentReportType(departmentId, reportType),
    onSuccess: (_, { departmentId }) => {
      toast.success(t('settings.updated'))
      queryClient.invalidateQueries({ queryKey: ['reports', 'department-types', departmentId] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  return (
    <div className="mt-2 space-y-4">
      <p className="text-sm text-white font-semibold">{t('multipleTypesHint')}</p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('settings.department')}</TableHead>
                {REPORT_TYPES.map((rt) => (
                  <TableHead key={rt} className="text-center">{reportTypesLabel(rt)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingDepartments ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    {REPORT_TYPES.map((rt) => <TableCell key={rt}><Skeleton className="mx-auto h-4 w-4" /></TableCell>)}
                  </TableRow>
                ))
              ) : departments?.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={REPORT_TYPES.length + 1} className="h-32 text-center text-muted-foreground">{t('noDepartment')}</TableCell>
                </TableRow>
              ) : (
                departments?.map((dept) => {
                  const active = typesByDept.get(dept.id) ?? new Set()
                  return (
                    <TableRow key={dept.id}>
                      <TableCell className="font-medium">{dept.name}</TableCell>
                      {REPORT_TYPES.map((rt) => (
                        <TableCell key={rt} className="text-center">
                          <Checkbox
                            checked={active.has(rt)}
                            disabled={isLoadingTypes || toggleMutation.isPending}
                            onCheckedChange={(checked) =>
                              toggleMutation.mutate({ departmentId: dept.id, reportType: rt, enabled: !!checked })
                            }
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
