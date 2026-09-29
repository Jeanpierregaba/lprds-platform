import { cn } from '@/lib/utils/cn'
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
  not_expected: 'border-transparent bg-sky text-white',
  exempt: 'border-transparent bg-teal text-white',
}

const STATUS_HINTS: Record<DailyStatusValue, string> = {
  present: 'Arrivé dans les temps',
  late: 'Arrivé après l\u2019horaire attendu',
  absent: 'Jour ouvré sans arrivée scannée',
  not_expected: 'Week-end : aucune présence attendue',
  exempt: 'Personnel exempté de pointage',
}

export function StatusBadge({ status }: { status: DailyStatusValue }) {
  return (
    <span
      title={STATUS_HINTS[status] ?? status}
      className={cn(
        'inline-block shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold',
        STATUS_CLASSNAMES[status] ?? 'border-transparent bg-muted text-muted-foreground',
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
