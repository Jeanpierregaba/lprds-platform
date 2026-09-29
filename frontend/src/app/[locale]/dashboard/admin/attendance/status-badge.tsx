'use client'

import { useTranslations } from 'next-intl'

import { useLabel } from '@/lib/i18n/labels'
import { cn } from '@/lib/utils/cn'
import type { DailyStatusValue } from '@/types/attendance'

const STATUS_CLASSNAMES: Record<DailyStatusValue, string> = {
  present: 'border-transparent bg-pale-green text-white',
  late: 'border-transparent bg-warning text-warning-foreground',
  absent: 'border-transparent bg-destructive text-white',
  not_expected: 'border-transparent bg-sky text-white',
  exempt: 'border-transparent bg-teal text-white',
}

export function StatusBadge({ status }: { status: DailyStatusValue }) {
  const statusLabel = useLabel('attendanceStatus')
  const tHint = useTranslations('attendance.statusHint')

  return (
    <span
      title={tHint.has(status) ? tHint(status) : status}
      className={cn(
        'inline-block shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold',
        STATUS_CLASSNAMES[status] ?? 'border-transparent bg-muted text-muted-foreground',
      )}
    >
      {statusLabel(status)}
    </span>
  )
}
