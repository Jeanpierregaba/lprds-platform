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
  items: AttendanceEvent[]
}

export interface DailyStatus {
  status:          DailyStatusValue
  arrival_time:    string | null
  departure_time:  string | null
  late_minutes:    number | null
}

export interface ChildDailyStatus extends DailyStatus {
  child: PersonBrief
}

export interface StaffDailyStatus extends DailyStatus {
  staff:      PersonBrief
  meal_taken: boolean
  exempt:     boolean
}

export interface ChildDailyStatusListResponse {
  date:  string
  total: number
  items: ChildDailyStatus[]
}

export interface StaffDailyStatusListResponse {
  date:  string
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
}

export interface AttendanceGeneralSettings {
  id:                              string
  establishment_id:                string
  timezone:                        string
  staff_expected_arrival_time:     string
  staff_expected_departure_time:   string
}

export interface StaffExemption {
  staff_id: string
  exempt:   boolean
}

export interface StaffSchedule {
  staff_id:                 string
  expected_arrival_time:    string
  expected_departure_time:  string
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
}
