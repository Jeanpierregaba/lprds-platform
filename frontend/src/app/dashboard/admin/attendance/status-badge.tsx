import { Badge } from '@/components/ui/badge'
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
  present: '',
  late: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  absent: '',
  not_expected: '',
  exempt: '',
}

export function StatusBadge({ status }: { status: DailyStatusValue }) {
  const variant = status === 'present' ? 'default' : status === 'absent' ? 'destructive' : 'outline'
  return (
    <Badge variant={variant} className={cn(STATUS_CLASSNAMES[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
