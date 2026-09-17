'use client'

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { UseFormReturn } from 'react-hook-form'

import { attendanceApi } from '@/lib/api/attendance.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import type { DailyContentForm } from './content-schemas'

function toTimeInput(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Pré-remplit visiblement les heures d'arrivée/départ d'un rapport quotidien
 * depuis les scans de pointage du jour — le backend fait déjà ce remplissage
 * à la création, mais le formulaire restait vide jusqu'à la soumission.
 *
 * Seuls les champs encore vides sont renseignés (jamais d'écrasement d'une
 * saisie manuelle), une seule fois par couple enfant/date. Le backend reste
 * l'arbitre à la soumission (ne remplit que ce qui est encore vide).
 */
export function useAttendancePrefill({
  active,
  childId,
  referenceDate,
  form,
  departmentId,
}: {
  active: boolean
  childId: string | undefined
  referenceDate: string | undefined
  form: UseFormReturn<DailyContentForm>
  departmentId?: string | undefined
}) {
  const user = useUser()
  const { permissions } = useMyPermissions()
  const hasAttendanceRead = user?.role === 'admin' || permissions.has('attendance:read')
  const canFetch =
    active && !!childId && !!referenceDate && (hasAttendanceRead || user?.role === 'staff')

  const { data } = useQuery({
    queryKey: ['attendance', 'daily-prefill', childId, referenceDate, departmentId, hasAttendanceRead],
    queryFn: () =>
      (hasAttendanceRead
        ? attendanceApi.getChildrenDaily({ date: referenceDate!, department_id: departmentId })
        : attendanceApi.getMyGroupDaily({ date: referenceDate! })
      ).then((r) => r.data),
    enabled: canFetch,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  })

  const key = active && childId && referenceDate ? `${childId}|${referenceDate}` : null
  const appliedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!key || !data || appliedRef.current === key) return
    const item = data.items.find((i) => i.child.id === childId)
    const arrival = toTimeInput(item?.arrival_time)
    const departure = toTimeInput(item?.departure_time)
    if (arrival && !form.getValues('arrival_time')) form.setValue('arrival_time', arrival)
    if (departure && !form.getValues('departure_time')) form.setValue('departure_time', departure)
    appliedRef.current = key
  }, [key, data, form, childId])
}
