'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Search, UserCog, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { rbacApi } from '@/lib/api/rbac.api'
import { staffApi } from '@/lib/api/staff.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { STAFF_TYPE_LABELS } from '@/types/staff'

export function AssignmentTab() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: staffResults, isLoading: isSearching } = useQuery({
    queryKey: ['staff', { search: debouncedSearch }],
    queryFn: () => staffApi.list({ search: debouncedSearch || undefined, limit: 10 }).then((r) => r.data),
    enabled: debouncedSearch.length > 0,
  })

  const { data: roles } = useQuery({
    queryKey: ['roles', { includeInactive: false }],
    queryFn: () => rbacApi.listRoles(false).then((r) => r.data),
  })

  const { data: userRoles, isLoading: isLoadingUserRoles } = useQuery({
    queryKey: ['user-roles', selectedStaffId],
    queryFn: () => rbacApi.getUserRoles(selectedStaffId!).then((r) => r.data),
    enabled: !!selectedStaffId,
  })

  const invalidateUserRoles = () =>
    queryClient.invalidateQueries({ queryKey: ['user-roles', selectedStaffId] })

  const assignMutation = useMutation({
    mutationFn: (roleId: string) => rbacApi.assignRole(selectedStaffId!, roleId),
    onSuccess: () => {
      toast.success('Rôle attribué.')
      invalidateUserRoles()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const revokeMutation = useMutation({
    mutationFn: (roleId: string) => rbacApi.revokeRole(selectedStaffId!, roleId),
    onSuccess: () => {
      toast.success('Rôle révoqué.')
      invalidateUserRoles()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const selectedStaff = staffResults?.items.find((s) => s.id === selectedStaffId)
  const assignedRoleIds = new Set(userRoles?.roles.map((r) => r.id) ?? [])
  const availableRoles = roles?.filter((r) => !assignedRoleIds.has(r.id)) ?? []

  return (
    <div className="grid gap-4 pt-2 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rechercher un membre du personnel</CardTitle>
          <CardDescription>Par nom, surnom, email ou matricule.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              className="pl-8"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSelectedStaffId(null)
              }}
            />
          </div>

          {debouncedSearch && (
            <div className="divide-y divide-border rounded-md border border-border">
              {isSearching ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : staffResults?.items.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">Aucun résultat.</p>
              ) : (
                staffResults?.items.map((staff) => (
                  <button
                    key={staff.id}
                    type="button"
                    onClick={() => setSelectedStaffId(staff.id)}
                    className={`flex w-full items-center justify-between gap-2 p-3 text-left text-sm transition-colors hover:bg-muted ${
                      selectedStaffId === staff.id ? 'bg-muted' : ''
                    }`}
                  >
                    <div>
                      <div className="font-medium">{staff.first_name} {staff.last_name}</div>
                      <div className="text-xs text-muted-foreground">{staff.email}</div>
                    </div>
                    {staff.staff_type && (
                      <span className="inline-block shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                        {STAFF_TYPE_LABELS[staff.staff_type]}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rôles attribués</CardTitle>
          <CardDescription>
            {selectedStaff
              ? `${selectedStaff.first_name} ${selectedStaff.last_name}`
              : 'Sélectionnez un membre du personnel.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedStaffId ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <UserCog className="size-8" />
              <p className="text-sm">Aucun membre sélectionné.</p>
            </div>
          ) : isLoadingUserRoles ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-2/3" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {userRoles?.roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun rôle attribué.</p>
                ) : (
                  userRoles?.roles.map((role) => (
                    <div key={role.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <span className="text-sm font-medium">{role.name}</span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Révoquer ${role.name}`}
                        onClick={() => revokeMutation.mutate(role.id)}
                        disabled={revokeMutation.isPending}
                      >
                        <X className="size-4 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              {availableRoles.length > 0 && (
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted-foreground">Attribuer un rôle</p>
                  <div className="flex flex-wrap gap-2">
                    {availableRoles.map((role) => (
                      <Button
                        key={role.id}
                        variant="outline"
                        size="sm"
                        onClick={() => assignMutation.mutate(role.id)}
                        disabled={assignMutation.isPending}
                      >
                        {assignMutation.isPending
                          ? <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                          : null}
                        {role.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
