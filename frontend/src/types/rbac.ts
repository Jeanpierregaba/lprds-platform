export interface Permission {
  id:    string
  code:  string
  label: string
}

export interface Role {
  id:               string
  establishment_id: string
  name:             string
  description:      string | null
  is_active:        boolean
  permissions:      Permission[]
  created_at:       string
  updated_at:       string
}

export interface RoleCreatePayload {
  name:        string
  description?: string
  permissions: string[]
}

export interface RoleUpdatePayload {
  name?:        string
  description?: string
  permissions?: string[]
  is_active?:   boolean
}

export interface UserRolesResponse {
  user_id:     string
  email:       string
  roles:       Role[]
  permissions: string[]
}
