export interface Permission {
  id:    string
  code:  string
  label: string
}

/**
 * Codes de permission RBAC — miroir de `PermissionCode` backend
 * (`app/modules/rbac/models.py`). Toute nouvelle permission backend doit être
 * ajoutée ici pour être cochable dans l'UI et utilisable dans le gating.
 */
export const PERMISSION_CODES = [
  'children:read',
  'children:write',
  'children:archive',
  'parents:read',
  'parents:write',
  'staff:read',
  'staff:write',
  'organization:read',
  'organization:write',
  'attendance:scan',
  'attendance:read',
  'attendance:write',
  'reports:read',
  'reports:write',
  'reports:validate',
  'gallery:read',
  'menus:read',
  'menus:write',
  'blog:write',
  'library:read',
  'library:write',
  'library:lend',
] as const

export type PermissionCode = (typeof PERMISSION_CODES)[number]

/** Regroupement par module pour le sélecteur de permissions (création de rôle). */
export const PERMISSION_GROUPS: { module: string; codes: PermissionCode[] }[] = [
  { module: 'Enfants', codes: ['children:read', 'children:write', 'children:archive'] },
  { module: 'Parents', codes: ['parents:read', 'parents:write'] },
  { module: 'Personnel', codes: ['staff:read', 'staff:write'] },
  { module: 'Organisation', codes: ['organization:read', 'organization:write'] },
  { module: 'Présences', codes: ['attendance:scan', 'attendance:read', 'attendance:write'] },
  { module: 'Rapports', codes: ['reports:read', 'reports:write', 'reports:validate'] },
  { module: 'Galerie', codes: ['gallery:read'] },
  { module: 'Menus', codes: ['menus:read', 'menus:write'] },
  { module: 'Blog', codes: ['blog:write'] },
  { module: 'Bibliothèque', codes: ['library:read', 'library:write', 'library:lend'] },
]

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
