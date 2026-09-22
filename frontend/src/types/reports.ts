export type ReportType = 'quotidien' | 'bi_mensuel' | 'annuel'
export type ReportStatus = 'draft' | 'submitted' | 'rejected' | 'validated'

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  quotidien: 'Quotidien',
  bi_mensuel: 'Bi-mensuel',
  annuel: 'Annuel',
}

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: 'Brouillon',
  submitted: 'Soumis',
  rejected: 'Rejeté',
  validated: 'Validé',
}

/** Pastilles pleines des statuts (sans `variant`, le défaut convient) :
 *  brouillon = blanc, soumis = jaune, rejeté = rouge, validé = vert. */
export const REPORT_STATUS_BADGE_CLASS: Record<ReportStatus, string> = {
  draft: 'border-border bg-card text-muted-foreground',
  submitted: 'border-transparent bg-primary text-primary-foreground',
  rejected: 'border-transparent bg-destructive text-white',
  validated: 'border-transparent bg-secondary text-secondary-foreground',
}

// Les 6 domaines partagent les mêmes clés entre bi_mensuel (texte libre) et
// annuel (notation + observation) — même convention de nommage côté backend.
export const DOMAIN_LABELS = {
  oral_written_language: 'Développement et structuration du langage oral et écrit',
  physical_activities: "Agir, s'exprimer, comprendre à travers les activités physiques",
  artistic_activities: "Agir, s'exprimer, comprendre à travers les activités artistiques",
  math_foundations: 'L’acquisition des premiers outils mathématiques',
  world_exploration: 'Explorer le monde',
  english: 'Anglais',
} as const

export interface UserBrief {
  id:         string
  first_name: string
  last_name:  string
  nickname?:  string | null
}

export interface ChildBrief {
  id:          string
  matricule:   string
  last_name:   string
  first_names: string
}

export interface ReportAttachment {
  id:           string
  filename:     string
  content_type: string
  size_bytes:   number
  uploaded_by:  UserBrief
  created_at:   string
  url:          string
}

export interface DepartmentReportTypeSetting {
  id:            string
  department_id: string
  report_type:   ReportType
  created_at:    string
}

export interface ReportVocabulary {
  health_status:      Record<string, string>
  meal_amount:        Record<string, string>
  mood:               Record<string, string>
  behavior_tag:       Record<string, string>
  class_behavior:     Record<string, string>
  peer_relation:      Record<string, string>
  emotion_management: Record<string, string>
  acquisition_level:  Record<string, string>
}

// ── Contenu structuré ────────────────────────────────────────────
export interface DailyReportContent {
  arrival_time?:   string | null
  departure_time?: string | null
  health_status:   string
  temperature_arrival?:  number | null
  temperature_departure?: number | null
  health_notes?:   string | null
  breakfast: string
  lunch:     string
  snack:     string
  nap: boolean
  nap_duration_minutes?: number | null
  bath: boolean
  poop: boolean
  moods: string[]
  // Liste d'activités (saisie une par une côté formulaire). Les rapports
  // créés avant cette évolution stockent une simple chaîne : normalisée en
  // liste à la lecture (cf. fromDailyContent).
  activities: string[]
  behaviors: string[]
  highlight?: string | null
}

export interface BiMensuelReportContent {
  oral_written_language: string
  physical_activities:   string
  artistic_activities:   string
  math_foundations:      string
  world_exploration:     string
  english:                string
  class_behaviors:     string[]
  peer_relations:      string[]
  emotion_management:  string[]
  teacher_observations: string
}

export interface DomainAssessment {
  rating:      string
  observation: string
}

export interface AnnualReportContent {
  oral_written_language: DomainAssessment
  physical_activities:   DomainAssessment
  artistic_activities:   DomainAssessment
  math_foundations:      DomainAssessment
  world_exploration:     DomainAssessment
  english:                DomainAssessment
}

// ── Rapports ────────────────────────────────────────────────────
export interface ReportListItem {
  id:           string
  child:        ChildBrief
  report_type:  ReportType
  period_start: string
  period_end:   string
  period_label: string
  status:       ReportStatus
  created_by:   UserBrief
  submitted_at: string | null
  validated_at: string | null
  created_at:   string
  updated_at:   string
}

export interface ReportListResponse {
  total: number
  items: ReportListItem[]
}

export interface MissingReportItem {
  child:        ChildBrief
  section_name: string | null
  has_draft:    boolean
}

export interface MissingReportResponse {
  report_type:  ReportType
  date:         string
  period_start: string
  period_label: string
  total: number
  items: MissingReportItem[]
}

export interface Report extends ReportListItem {
  establishment_id: string
  department_id:    string
  group_id:         string | null
  summary:          string | null
  content:          Record<string, unknown>
  validated_by:     UserBrief | null
  rejected_reason:  string | null
  attachments:      ReportAttachment[]
}

export interface ReportCreatePayload {
  child_id:        string
  report_type:     ReportType
  reference_date?: string
  summary?:        string
  content:         Record<string, unknown>
}

export interface ReportUpdatePayload {
  summary?: string
  content?: Record<string, unknown>
}

// ── Portail parent ────────────────────────────────────────────────
export interface ParentReportListItem {
  id:           string
  child:        ChildBrief
  report_type:  ReportType
  period_label: string
  validated_at: string | null
  is_read:      boolean
}

export interface ParentReportListResponse {
  total: number
  items: ParentReportListItem[]
}

export interface ParentReportDetail {
  id:            string
  child:         ChildBrief
  report_type:   ReportType
  period_start:  string
  period_end:    string
  period_label:  string
  summary:       string | null
  content:       Record<string, unknown>
  validated_at:  string | null
  is_read:       boolean
  attachments:   ReportAttachment[]
}
