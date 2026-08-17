export interface Department {
  id:               string
  establishment_id: string
  name:             string
  description:      string | null
  is_active:        boolean
  created_at:       string
  updated_at:       string
}

export interface DepartmentCreatePayload {
  name: string
  description?: string
}

export interface DepartmentUpdatePayload {
  name?:        string
  description?: string
  is_active?:   boolean
}

export interface Section {
  id:               string
  establishment_id: string
  department_id:    string
  name:             string
  description:      string | null
  is_active:        boolean
  created_at:       string
  updated_at:       string
}

export interface SectionCreatePayload {
  department_id: string
  name:          string
  description?:  string
}

export interface SectionUpdatePayload {
  name?:        string
  description?: string
  is_active?:   boolean
}

export interface EducatriceBrief {
  id:         string
  matricule:  string | null
  nickname:   string | null
  first_name: string
  last_name:  string
}

export interface ChildBrief {
  id:          string
  matricule:   string
  last_name:   string
  first_names: string
}

export interface Group {
  id:               string
  establishment_id: string
  section_id:       string
  name:             string
  is_active:        boolean
  educatrice:       EducatriceBrief
  children:         ChildBrief[]
  created_at:       string
  updated_at:       string
}

export interface GroupCreatePayload {
  section_id:    string
  educatrice_id: string
  name?:         string
  child_ids?:    string[]
}

export interface GroupUpdatePayload {
  name?:          string
  educatrice_id?: string
  is_active?:     boolean
}
