import { z } from 'zod'

/** Signature minimale d'un traducteur next-intl (valeurs ICU comprises). */
type T = (key: string, values?: Record<string, string | number>) => string
import type { AnnualReportContent, BiMensuelReportContent, DailyReportContent } from '@/types/reports'

const numericStringInRange = (t: T, min: number, max: number) =>
  z.string().optional().or(z.literal('')).refine(
    (v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= min && Number(v) <= max),
    { message: t('validation.numberBetween', { min, max }) }
  )

export const makeDailyContentSchema = (t: T) => z.object({
  arrival_time: z.string().optional().or(z.literal('')),
  departure_time: z.string().optional().or(z.literal('')),
  health_status: z.string().min(1, t('validation.healthStatus')),
  temperature_arrival: numericStringInRange(t, 30, 43),
  temperature_departure: numericStringInRange(t, 30, 43),
  health_notes: z.string().optional().or(z.literal('')),
  breakfast: z.string().min(1, t('validation.required')),
  lunch: z.string().min(1, t('validation.required')),
  snack: z.string().min(1, t('validation.required')),
  nap: z.boolean(),
  nap_duration_minutes: numericStringInRange(t, 0, 600),
  bath: z.boolean(),
  poop: z.boolean(),
  moods: z.array(z.string()).min(1, t('validation.oneMood')),
  activities: z.array(z.string().min(1, t('validation.emptyActivity'))).min(1, t('validation.oneActivity')),
  behaviors: z.array(z.string()).min(1, t('validation.oneBehavior')),
  highlight: z.string().optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  if (data.nap && !data.nap_duration_minutes) {
    ctx.addIssue({ code: 'custom', path: ['nap_duration_minutes'], message: t('validation.napDurationRequired') })
  }
  if (!data.nap && data.nap_duration_minutes) {
    ctx.addIssue({ code: 'custom', path: ['nap_duration_minutes'], message: t('validation.napDurationForbidden') })
  }
})
export type DailyContentForm = z.infer<ReturnType<typeof makeDailyContentSchema>>

export function toDailyContent(form: DailyContentForm): DailyReportContent {
  return {
    arrival_time: form.arrival_time || undefined,
    departure_time: form.departure_time || undefined,
    health_status: form.health_status,
    temperature_arrival: form.temperature_arrival ? Number(form.temperature_arrival) : undefined,
    temperature_departure: form.temperature_departure ? Number(form.temperature_departure) : undefined,
    health_notes: form.health_notes || undefined,
    breakfast: form.breakfast,
    lunch: form.lunch,
    snack: form.snack,
    nap: form.nap,
    nap_duration_minutes: form.nap_duration_minutes ? Number(form.nap_duration_minutes) : undefined,
    bath: form.bath,
    poop: form.poop,
    moods: form.moods,
    activities: form.activities,
    behaviors: form.behaviors,
    highlight: form.highlight || undefined,
  }
}

/** Normalise les activités lues en base : liste attendue, avec repli sur les
 *  rapports historiques qui stockent encore une simple chaîne. */
export function normalizeActivities(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  if (typeof value === 'string' && value.trim()) return [value]
  return []
}

export function fromDailyContent(content: Partial<DailyReportContent>): DailyContentForm {
  return {
    arrival_time: content.arrival_time ?? '',
    departure_time: content.departure_time ?? '',
    health_status: content.health_status ?? '',
    temperature_arrival: content.temperature_arrival != null ? String(content.temperature_arrival) : '',
    temperature_departure: content.temperature_departure != null ? String(content.temperature_departure) : '',
    health_notes: content.health_notes ?? '',
    breakfast: content.breakfast ?? '',
    lunch: content.lunch ?? '',
    snack: content.snack ?? '',
    nap: content.nap ?? false,
    nap_duration_minutes: content.nap_duration_minutes != null ? String(content.nap_duration_minutes) : '',
    bath: content.bath ?? false,
    poop: content.poop ?? false,
    moods: content.moods ?? [],
    activities: normalizeActivities(content.activities),
    behaviors: content.behaviors ?? [],
    highlight: content.highlight ?? '',
  }
}

export const makeBimensuelContentSchema = (t: T) => z.object({
  oral_written_language: z.string().min(1, t('validation.required')),
  physical_activities: z.string().min(1, t('validation.required')),
  artistic_activities: z.string().min(1, t('validation.required')),
  math_foundations: z.string().min(1, t('validation.required')),
  world_exploration: z.string().min(1, t('validation.required')),
  english: z.string().min(1, t('validation.required')),
  class_behaviors: z.array(z.string()).min(1, t('validation.oneBehavior')),
  peer_relations: z.array(z.string()).min(1, t('validation.oneRelation')),
  emotion_management: z.array(z.string()).min(1, t('validation.oneObservation')),
  teacher_observations: z.string().min(1, t('validation.required')),
})
export type BiMensuelContentForm = z.infer<ReturnType<typeof makeBimensuelContentSchema>>

export function fromBiMensuelContent(content: Partial<BiMensuelReportContent>): BiMensuelContentForm {
  return {
    oral_written_language: content.oral_written_language ?? '',
    physical_activities: content.physical_activities ?? '',
    artistic_activities: content.artistic_activities ?? '',
    math_foundations: content.math_foundations ?? '',
    world_exploration: content.world_exploration ?? '',
    english: content.english ?? '',
    class_behaviors: content.class_behaviors ?? [],
    peer_relations: content.peer_relations ?? [],
    emotion_management: content.emotion_management ?? [],
    teacher_observations: content.teacher_observations ?? '',
  }
}

const makeDomainAssessmentSchema = (t: T) => z.object({
  rating: z.string().min(1, t('validation.ratingRequired')),
  observation: z.string().min(1, t('validation.observationRequired')),
})

export const makeAnnualContentSchema = (t: T) => z.object({
  oral_written_language: makeDomainAssessmentSchema(t),
  physical_activities: makeDomainAssessmentSchema(t),
  artistic_activities: makeDomainAssessmentSchema(t),
  math_foundations: makeDomainAssessmentSchema(t),
  world_exploration: makeDomainAssessmentSchema(t),
  english: makeDomainAssessmentSchema(t),
})
export type AnnualContentForm = z.infer<ReturnType<typeof makeAnnualContentSchema>>

const emptyDomain = { rating: '', observation: '' }

export function fromAnnualContent(content: Partial<AnnualReportContent>): AnnualContentForm {
  return {
    oral_written_language: content.oral_written_language ?? { ...emptyDomain },
    physical_activities: content.physical_activities ?? { ...emptyDomain },
    artistic_activities: content.artistic_activities ?? { ...emptyDomain },
    math_foundations: content.math_foundations ?? { ...emptyDomain },
    world_exploration: content.world_exploration ?? { ...emptyDomain },
    english: content.english ?? { ...emptyDomain },
  }
}

export const DAILY_DEFAULTS: DailyContentForm = {
  arrival_time: '', departure_time: '',
  health_status: '', temperature_arrival: '', temperature_departure: '', health_notes: '',
  breakfast: '', lunch: '', snack: '',
  nap: false, nap_duration_minutes: '',
  bath: false, poop: false,
  moods: [], activities: [], behaviors: [], highlight: '',
}

export const BIMENSUEL_DEFAULTS: BiMensuelContentForm = {
  oral_written_language: '', physical_activities: '', artistic_activities: '',
  math_foundations: '', world_exploration: '', english: '',
  class_behaviors: [], peer_relations: [], emotion_management: [],
  teacher_observations: '',
}

export const ANNUAL_DEFAULTS: AnnualContentForm = {
  oral_written_language: { ...emptyDomain },
  physical_activities: { ...emptyDomain },
  artistic_activities: { ...emptyDomain },
  math_foundations: { ...emptyDomain },
  world_exploration: { ...emptyDomain },
  english: { ...emptyDomain },
}
