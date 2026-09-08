export interface Guardian {
  id:          string
  last_name:   string
  first_names: string
  phone:       string
  email:       string | null
}

export interface GuardianPayload {
  last_name:   string
  first_names: string
  phone:       string
  email?:      string
}

export interface AuthorizedPerson {
  id:          string
  last_name:   string
  first_names: string
  phone:       string
}

export interface AuthorizedPersonPayload {
  last_name:   string
  first_names: string
  phone:       string
}

export interface UnitBrief {
  id:   string
  name: string
}

export interface ChildDocument {
  id:           string
  filename:     string
  content_type: string
  size_bytes:   number
  created_at:   string
  /** Chemin de téléchargement authentifié — jamais servi en statique. */
  url:          string
}

export interface Child {
  id:               string
  matricule:        string
  establishment_id: string

  last_name:         string
  first_names:       string
  birth_date:        string
  admission_date:    string
  residence_address: string
  department:        UnitBrief | null
  section:           UnitBrief | null

  behavioral_notes: string | null
  preferences:      string | null

  medical_notes:        string | null
  dietary_restrictions: string | null
  medications:           string | null
  doctor_name:          string | null
  doctor_phone:         string | null

  is_active:  boolean
  created_at: string
  updated_at: string

  guardians:          Guardian[]
  authorized_persons: AuthorizedPerson[]
  documents:          ChildDocument[]
}

export interface ChildListItem {
  id:             string
  matricule:      string
  last_name:      string
  first_names:    string
  birth_date:     string
  admission_date: string
  department:     UnitBrief | null
  section:        UnitBrief | null
  is_active:      boolean
}

export interface ChildListResponse {
  total: number
  items: ChildListItem[]
}

export interface ChildCreatePayload {
  last_name:         string
  first_names:       string
  birth_date:        string
  admission_date:    string
  residence_address: string
  department_id?:    string
  section_id?:       string

  behavioral_notes?: string
  preferences?:      string

  medical_notes?:        string
  dietary_restrictions?: string
  medications?:          string
  doctor_name?:          string
  doctor_phone?:         string

  guardians:          GuardianPayload[]
  authorized_persons: AuthorizedPersonPayload[]
}

export interface ChildUpdatePayload {
  last_name?:         string
  first_names?:       string
  birth_date?:        string
  admission_date?:    string
  residence_address?: string
  department_id?:     string | null
  section_id?:        string | null

  behavioral_notes?: string | null
  preferences?:      string | null

  medical_notes?:        string | null
  dietary_restrictions?: string | null
  medications?:          string | null
  doctor_name?:          string | null
  doctor_phone?:         string | null

  guardians?:          GuardianPayload[]
  authorized_persons?: AuthorizedPersonPayload[]
}

export const CHILDREN_EXPORT_FORMATS = ['xlsx', 'csv'] as const
export type ChildrenExportFormat = (typeof CHILDREN_EXPORT_FORMATS)[number]

export interface ChildImportRowResult {
  ligne:         number
  matricule:     string | null
  /** "créé" | "mis à jour" | "rejeté" */
  statut:        string
  avertissements: string[]
  erreur:         string | null
}

export interface ChildImportReportResponse {
  crees:     number
  mis_a_jour: number
  rejetees:   number
  lignes:     ChildImportRowResult[]
}
