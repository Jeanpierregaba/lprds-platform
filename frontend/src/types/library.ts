export interface SectionBrief {
  id:   string
  name: string
}

export interface Book {
  id:                 string
  establishment_id:   string
  title:              string
  author:             string
  description:        string | null
  /**
   * Version anglaise de la description — `null` sur les portails parent et
   * éducateur, qui reçoivent `description` DÉJÀ dans la langue du lecteur.
   * N'a de sens que sur l'écran de gestion, pour corriger l'anglais à côté du
   * français sans les confondre.
   */
  description_en:     string | null
  total_quantity:     number
  available_quantity: number
  is_active:          boolean
  sections:           SectionBrief[]
  created_at:         string
  updated_at:         string
}

export interface BookListResponse {
  total: number
  items: Book[]
}

export interface BookCreatePayload {
  title:          string
  author:         string
  description?:    string | null
  description_en?: string | null
  total_quantity:  number
  section_ids:    string[]
}

export interface BookUpdatePayload {
  title?:          string
  author?:         string
  description?:    string | null
  description_en?: string | null
  total_quantity?: number
  section_ids?:    string[]
  is_active?:      boolean
}

export type LendingStatus = 'active' | 'overdue' | 'returned'

/** Libellés dans les catalogues (`enums.lendingStatus`). */
export const LENDING_STATUSES = ['active', 'overdue', 'returned'] as const

export interface Lending {
  id:               string
  establishment_id: string
  book_id:          string
  book_title:       string
  author:           string
  child_id:         string
  child_name:       string
  child_matricule:  string
  lent_by_id:       string
  lent_by_name:     string
  borrowed_at:      string
  due_date:         string
  returned_at:      string | null
  status:           LendingStatus
  overdue_days:     number | null
}

export interface LendingListResponse {
  total: number
  items: Lending[]
}

export interface LendingCreatePayload {
  book_id:     string
  child_id:    string
  borrowed_at?: string
  due_date?:    string
}

export interface LibrarySettings {
  reminders_enabled:    boolean
  reminder_days_before: number
  default_loan_days:    number
}

export interface LibrarySettingsUpdatePayload {
  reminders_enabled?:    boolean
  reminder_days_before?: number
  default_loan_days?:    number
}

export interface ReminderResult {
  reminded_parents:  number
  reminded_lendings: number
}
