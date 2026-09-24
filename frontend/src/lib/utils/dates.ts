export function mondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0 = dimanche .. 6 = samedi
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function toIsoDate(d: Date) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function parseIsoDate(iso: string) {
  const parts = iso.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  return new Date(year, month - 1, day)
}

/** Date locale du jour (calendrier du navigateur), jamais l'UTC de
 * `toISOString` — à 00h30 locale (UTC+1), `toISOString` date encore d'hier. */
export function todayLocalIso() {
  return toIsoDate(new Date())
}

/** Heure affichée dans le fuseau IANA de l'établissement (celui qui sert au
 * calcul des retards) — pas celui du navigateur, qui peut différer. */
export function formatTimeIn(iso: string | null, timeZone: string): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit', minute: '2-digit', timeZone,
    }).format(new Date(iso))
  } catch {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }
}
