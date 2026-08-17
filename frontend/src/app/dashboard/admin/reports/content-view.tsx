import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DOMAIN_LABELS, type ReportType, type ReportVocabulary } from '@/types/reports'
import type {
  AnnualReportContent, BiMensuelReportContent, DailyReportContent, DomainAssessment,
} from '@/types/reports'

const DOMAIN_KEYS = Object.keys(DOMAIN_LABELS) as (keyof typeof DOMAIN_LABELS)[]

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value || '—'}</p>
    </div>
  )
}

function Tags({ codes, vocabulary }: { codes: string[]; vocabulary: Record<string, string> }) {
  if (codes.length === 0) return <p className="text-sm text-muted-foreground">—</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {codes.map((c) => <Badge key={c} variant="outline" className="font-normal">{vocabulary[c] ?? c}</Badge>)}
    </div>
  )
}

export function ContentView({
  reportType, content, vocabulary,
}: { reportType: ReportType; content: Record<string, unknown>; vocabulary: ReportVocabulary }) {
  if (reportType === 'quotidien') {
    const c = content as unknown as DailyReportContent
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Heure d'arrivée" value={c.arrival_time} />
          <Field label="Heure de départ" value={c.departure_time} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="État de santé" value={vocabulary.health_status[c.health_status]} />
          <Field label="Température arrivée" value={c.temperature_arrival != null ? `${c.temperature_arrival}°C` : undefined} />
          <Field label="Température départ" value={c.temperature_departure != null ? `${c.temperature_departure}°C` : undefined} />
        </div>
        {c.health_notes && <Field label="Notes de santé" value={c.health_notes} />}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Petit-déjeuner" value={vocabulary.meal_amount[c.breakfast]} />
          <Field label="Déjeuner" value={vocabulary.meal_amount[c.lunch]} />
          <Field label="Goûter" value={vocabulary.meal_amount[c.snack]} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Sieste" value={c.nap ? `Oui (${c.nap_duration_minutes ?? '?'} min)` : 'Non'} />
          <Field label="Bain" value={c.bath ? 'Oui' : 'Non'} />
          <Field label="Selles" value={c.poop ? 'Oui' : 'Non'} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Humeurs</p>
          <Tags codes={c.moods} vocabulary={vocabulary.mood} />
        </div>
        <Field label="Activités" value={c.activities} />
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Comportements</p>
          <Tags codes={c.behaviors} vocabulary={vocabulary.behavior_tag} />
        </div>
        {c.highlight && <Field label="Fait marquant" value={c.highlight} />}
      </div>
    )
  }

  if (reportType === 'bi_mensuel') {
    const c = content as unknown as BiMensuelReportContent
    return (
      <div className="space-y-4">
        {DOMAIN_KEYS.map((key) => (
          <Field key={key} label={DOMAIN_LABELS[key]} value={c[key]} />
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
              <CardTitle className="text-sm">{DOMAIN_LABELS[key]}</CardTitle>
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
