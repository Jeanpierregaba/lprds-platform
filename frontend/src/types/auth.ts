// Rôles identiques au backend
export type UserRole = 'superadmin' | 'admin' | 'staff' | 'parent'

export interface User {
  id:               string
  email:            string
  first_name:       string
  last_name:        string
  phone:            string | null
  role:             UserRole
  establishment_id: string | null
  is_active:        boolean
  /** Langue d'interface du compte ("fr" | "en") — pilote aussi les emails,
   *  PDF et notifications push envoyés hors session. */
  locale:           string
  created_at:       string
  last_login_at:    string | null
}

export interface TokenResponse {
    access_token:    string
    refresh_token:   string
    token_type:      string
}
  
export interface LoginPayload {
    email:    string
    password: string
}

export interface PasswordResetPayload {
    email: string
}
  
export interface PasswordResetConfirmPayload {
    token:        string
    new_password: string
}
  
export interface PasswordChangePayload {
    current_password: string
    new_password:     string
}

// Les libellés affichés vivent dans les catalogues (`enums.roles`) —
// cf. src/lib/i18n/labels.ts. Ici ne restent que les codes échangés avec le
// backend, qui ne changent jamais de langue.
export const USER_ROLES = ['superadmin', 'admin', 'staff', 'parent'] as const
  
// Redirection par rôle après login
  export const ROLE_HOME: Record<UserRole, string> = {
    superadmin: '/dashboard/super',
    admin:      '/dashboard/admin',
    staff:      '/dashboard/staff',
    parent:     '/dashboard/parent',
}