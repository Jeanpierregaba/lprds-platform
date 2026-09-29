import { Badge } from '@/components/ui/badge'
import { useLabel } from '@/lib/i18n/labels'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { DOMAIN_KEYS, type ReportType, type ReportVocabulary } from '@/types/reports'
import { normalizeActivities } from '@/lib/reports/content-schemas'
import type {
  AnnualReportContent, BiMensuelReportContent, DailyReportContent, DomainAssessment,
} from '@/types/reports'

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-xs font-medium text-secondary/70">{label}</p>
      <p className="break-words text-sm [overflow-wrap:anywhere]">{value || '—'}</p>
    </div>
  )
}

function Tags({
  codes, vocabulary, badgeClassName,
}: {
  codes: string[]
  vocabulary: Record<string, string>
  badgeClassName?: string
}) {
  if (codes.length === 0) return <p className="text-sm text-muted-foreground">—</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {codes.map((c) => (
        <Badge
          key={c}
          variant="outline"
          className={cn('max-w-full whitespace-normal break-words text-left font-normal', badgeClassName)}
        >
          {vocabulary[c] ?? c}
        </Badge>
      ))}
    </div>
  )
}

/** Section bordurée de la lecture du quotidien : bandeau de titre vert forêt
 *  sur fond teinté, corps sur fond de carte. */
function Section({
  title, children, contentClassName,
}: {
  title: string
  children: React.ReactNode
  contentClassName?: string
}) {
  return (
    <Card className="gap-0 border-secondary/20 py-0">
      <CardHeader className="rounded-t-xl border-b border-secondary/10 bg-secondary/[0.06] px-5 py-3 sm:px-6">
        <CardTitle className="font-display text-base font-bold text-secondary">{title}</CardTitle>
      </CardHeader>
      <CardContent className={cn('px-5 py-4 sm:px-6', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  )
}

export function ContentView({
  reportType, content, vocabulary,
}: { reportType: ReportType; content: Record<string, unknown>; vocabulary: ReportVocabulary }) {
  const reportDomainsLabel = useLabel('reportDomains')
  if (reportType === 'quotidien') {
    const c = content as unknown as DailyReportContent
    const activities = normalizeActivities(c.activities)
    return (
      <div className="space-y-3">
        <Section title="Horaires" contentClassName="grid gap-4 sm:grid-cols-2">
          <Field label="Heure d'arrivée" value={c.arrival_time} />
          <Field label="Heure de départ" value={c.departure_time} />
        </Section>
        <Section title="Santé" contentClassName="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="État de santé" value={vocabulary.health_status[c.health_status]} />
            <Field label="Température arrivée" value={c.temperature_arrival != null ? `${c.temperature_arrival}°C` : undefined} />
            <Field label="Température départ" value={c.temperature_departure != null ? `${c.temperature_departure}°C` : undefined} />
          </div>
          {c.health_notes && <Field label="Notes de santé" value={c.health_notes} />}
        </Section>
        <Section title="Repas" contentClassName="grid gap-4 sm:grid-cols-3">
          <Field label="Petit-déjeuner" value={vocabulary.meal_amount[c.breakfast]} />
          <Field label="Déjeuner" value={vocabulary.meal_amount[c.lunch]} />
          <Field label="Goûter" value={vocabulary.meal_amount[c.snack]} />
        </Section>
        <Section title="Sieste & Hygiène" contentClassName="grid gap-4 sm:grid-cols-3">
          <Field label="Sieste" value={c.nap ? `Oui (${c.nap_duration_minutes ?? '?'} min)` : 'Non'} />
          <Field label="Bain" value={c.bath ? 'Oui' : 'Non'} />
          <Field label="Selles" value={c.poop ? 'Oui' : 'Non'} />
        </Section>
        <Section title="Humeurs">
          <Tags codes={c.moods} vocabulary={vocabulary.mood} badgeClassName="border-secondary/30 bg-secondary/[0.04]" />
        </Section>
        <Section title="Activités">
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {activities.map((activity, i) => (
                <Badge
                  key={`${activity}-${i}`}
                  variant="outline"
                  className="max-w-full whitespace-normal break-words border-primary/50 bg-primary/10 text-left font-normal"
                >
                  {i + 1}-{activity}
                </Badge>
              ))}
            </div>
          )}
        </Section>
        <Section title="Comportements">
          <Tags codes={c.behaviors} vocabulary={vocabulary.behavior_tag} badgeClassName="border-secondary/30 bg-secondary/[0.04]" />
        </Section>
        {c.highlight && (
          <Section title="Fait marquant">
            <p className="text-sm">{c.highlight}</p>
          </Section>
        )}
      </div>
    )
  }

  if (reportType === 'bi_mensuel') {
    const c = content as unknown as BiMensuelReportContent
    return (
      <div className="space-y-4">
        {DOMAIN_KEYS.map((key) => (
          <Field key={key} label={reportDomainsLabel(key)} value={c[key]} />
        ))}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Comportement &amp; attitude en classe</p>
          <Tags codes={c.class_behaviors} vocabulary={vocabulary.class_behavior} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Relation avec les autres</p>
          <Tags codes={c.peer_relations} vocabulary={vocabulary.peer_relation} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Gestion des émotions</p>
          <Tags codes={c.emotion_management} vocabulary={vocabulary.emotion_management} />
        </div>
        <Field label="Observations de l'enseignante" value={c.teacher_observations} />
      </div>
    )
  }

  const c = content as unknown as AnnualReportContent
  return (
    <div className="space-y-3">
      {DOMAIN_KEYS.map((key) => {
        const domain = c[key] as DomainAssessment | undefined
        return (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{reportDomainsLabel(key)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Badge variant="outline" className="font-normal">
                {domain ? vocabulary.acquisition_level[domain.rating] : '—'}
              </Badge>
              <p className="text-sm">{domain?.observation || '—'}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
