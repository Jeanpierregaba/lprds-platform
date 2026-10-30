export type PersonType = 'child' | 'staff'
export type EventType = 'arrival' | 'departure' | 'meal'
export type DailyStatusValue = 'present' | 'late' | 'absent' | 'not_expected' | 'exempt'

export interface PersonBrief {
  id:          string
  matricule:   string | null
  last_name:   string
  first_names?: string | null
  first_name?:  string | null
  nickname?:    string | null
}

export interface ScannerBrief {
  id:         string
  first_name: string
  last_name:  string
}

export interface AttendanceEvent {
  id:              string
  person_type:     PersonType
  event_type:      EventType
  scanned_at:      string
  scanned_by:      ScannerBrief
  companion_name:  string | null
  companion_phone: string | null
  child:           PersonBrief | null
  staff:           PersonBrief | null
}

export interface AttendanceEventListResponse {
  total: number
  timezone?: string
  items: AttendanceEvent[]
}

export interface DailyStatus {
  status:          DailyStatusValue
  arrival_time:    string | null
  departure_time:  string | null
  late_minutes:    number | null
  /** Dispensé de pointage ce jour-là — enfants comme personnel depuis que les
   *  exemptions portent une période et peuvent viser une section entière. */
  exempt:          boolean
}

export interface ChildDailyStatus extends DailyStatus {
  child: PersonBrief
}

export interface StaffDailyStatus extends DailyStatus {
  staff:      PersonBrief
  meal_taken: boolean
}

export interface ChildDailyStatusListResponse {
  date:     string
  timezone?: string
  total: number
  items: ChildDailyStatus[]
}

export interface StaffDailyStatusListResponse {
  date:     string
  timezone?: string
  total: number
  items: StaffDailyStatus[]
}

export interface QRCodeResponse {
  person_type: PersonType
  matricule:   string
  qr_payload:  string
  qr_image:    string
}

export interface VerifyQrResponse {
  person_type:  PersonType
  matricule:    string | null
  display_name: string
  has_arrived:  boolean
  has_departed: boolean
  has_meal:     boolean
}

export interface ManualEventPayload {
  person_type: PersonType
  child_id?:   string
  staff_id?:   string
  // Cantine : staff uniquement (le backend refuse 422 pour un enfant).
  event_type:  'arrival' | 'departure' | 'meal'
  date:        string
  time:        string
}

export interface UpdateEventPayload {
  scanned_at: string
}

export interface AttendanceSettingsPayload {
  expected_arrival_time:   string
  expected_departure_time: string
}

export interface DepartmentAttendanceSettings {
  id:                       string
  department_id:            string
  expected_arrival_time:    string
  expected_departure_time:  string
}

export interface AttendanceGeneralSettingsPayload {
  timezone:                       string
  staff_expected_arrival_time:    string
  staff_expected_departure_time:  string
  late_grace_minutes?:           number
}

export interface AttendanceGeneralSettings {
  id:                              string
  establishment_id:                string
  timezone:                        string
  staff_expected_arrival_time:     string
  staff_expected_departure_time:   string
  late_grace_minutes:              number
}

export type ExemptionScope = 'staff' | 'child' | 'section'

/** État DÉRIVÉ des dates côté serveur — jamais stocké. Rien n'est éteint en
 *  base à l'échéance : l'export recalcule le passé, et un drapeau basculé par
 *  une tâche de fond y réécrirait l'historique. */
export type ExemptionState = 'upcoming' | 'active' | 'expired' | 'revoked'

export interface Exemption {
  id:           string
  scope:        ExemptionScope
  staff_id:     string | null
  child_id:     string | null
  section_id:   string | null
  target_name:  string
  section_name: string | null
  starts_on:    string | null
  ends_on:      string | null
  reason:       string | null
  is_active:    boolean
  state:        ExemptionState
}

export interface ExemptionListResponse {
  total: number
  items: Exemption[]
}

export interface ExemptionCreatePayload {
  scope:       ExemptionScope
  staff_id?:   string
  child_id?:   string
  section_id?: string
  starts_on:   string | null
  ends_on:     string | null
  reason:      string | null
}

/** ⚠️ La période est REMPLACÉE en entier, jamais fusionnée — même contrat que
 *  `PATCH /menus/{week_start}`. La portée, elle, ne se modifie pas. */
export type ExemptionUpdatePayload = Omit<ExemptionCreatePayload, 'scope' | 'staff_id' | 'child_id' | 'section_id'>

export interface StaffSchedule {
  staff_id:                 string
  expected_arrival_time:    string
  expected_departure_time:  string
}

export interface AbsentNotifiedParent {
  parent_name:    string
  children_names: string[]
  email_sent:     boolean
  message_sent:   boolean
}

export interface AbsenceInquiryResponse {
  date:             string
  total_absent:     number
  notified:         AbsentNotifiedParent[]
  skipped_no_parent: string[]
  already_notified:  string[]
}

export type ExportFileFormat = 'pdf' | 'excel'
export type ExportPersonType = 'children' | 'staff' | 'both'

export interface AttendanceExportParams {
  format:        ExportFileFormat
  person_type:   ExportPersonType
  date_from:     string
  date_to:       string
  department_id?: string
  section_id?:    string
  /** Export d'UNE personne précise (exclusifs) — priment sur le périmètre. */
  child_id?:      string
  staff_id?:      string
}
