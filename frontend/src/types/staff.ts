export type StaffType =
  | 'administrateur'
  | 'educateur'
  | 'prestataire'
  | 'directrice'
  | 'redacteur'
  | 'secretaire'
  | 'restaurateur'

/** Libellés dans les catalogues (`enums.staffTypes`). */
export const STAFF_TYPES = [
  'administrateur', 'educateur', 'prestataire', 'directrice',
  'redacteur', 'secretaire', 'restaurateur',
] as const

export interface StaffListItem {
  id:         string
  matricule:  string | null
  email:      string
  first_name: string
  last_name:  string
  nickname:   string | null
  phone:      string | null
  staff_type: StaffType | null
  is_active:  boolean
}

export interface StaffListResponse {
  total: number
  items: StaffListItem[]
}

export interface Staff {
  id:               string
  matricule:        string | null
  email:            string
  first_name:       string
  last_name:        string
  nickname:         string | null
  phone:            string | null
  staff_type:       StaffType | null
  establishment_id: string | null
  is_active:        boolean
  must_change_pwd:  boolean
  created_at:       string
  last_login_at:    string | null
}

export interface StaffCreatePayload {
  first_name: string
  last_name:  string
  nickname:   string
  phone:      string
  email:      string
  password:   string
  staff_type: StaffType
}

export interface StaffUpdatePayload {
  first_name?: string
  last_name?:  string
  nickname?:   string
  phone?:      string
  email?:      string
  staff_type?: StaffType
  is_active?:  boolean
}
