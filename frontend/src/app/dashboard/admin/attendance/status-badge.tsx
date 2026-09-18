import { cn } from '@/lib/utils'
import type { DailyStatusValue } from '@/types/attendance'

const STATUS_LABELS: Record<DailyStatusValue, string> = {
  present: 'Présent',
  late: 'En retard',
  absent: 'Absent',
  not_expected: 'Non attendu',
  exempt: 'Exempté',
}

const STATUS_CLASSNAMES: Record<DailyStatusValue, string> = {
  present: 'border-transparent bg-pale-green text-white',
  late: 'border-transparent bg-warning text-warning-foreground',
  absent: 'border-transparent bg-destructive text-white',
  not_expected: 'bg-muted text-muted-foreground',
  exempt: 'bg-muted text-muted-foreground',
}

export function StatusBadge({ status }: { status: DailyStatusValue }) {
  return (
    <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-semibold', STATUS_CLASSNAMES[status])}>
      {STATUS_LABELS[status]}
    </span>
  )
}
