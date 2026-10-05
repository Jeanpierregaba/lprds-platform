/** Catalogue RBAC tel que renvoyé par l'API : des codes, jamais un libellé —
 *  ceux-ci vivent dans `messages/{locale}/rbac.json` sous `permissions.*`. */
export interface Permission {
  id:   string
  code: PermissionCode
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
/** `moduleKey` pointe vers `nav.modules.*` : le libellé dépend de la langue. */
export const PERMISSION_GROUPS: { moduleKey: string; codes: PermissionCode[] }[] = [
  { moduleKey: 'children', codes: ['children:read', 'children:write', 'children:archive'] },
  { moduleKey: 'parents', codes: ['parents:read', 'parents:write'] },
  { moduleKey: 'staff', codes: ['staff:read', 'staff:write'] },
  { moduleKey: 'organization', codes: ['organization:read', 'organization:write'] },
  { moduleKey: 'attendance', codes: ['attendance:scan', 'attendance:read', 'attendance:write'] },
  { moduleKey: 'reports', codes: ['reports:read', 'reports:write', 'reports:validate'] },
  { moduleKey: 'gallery', codes: ['gallery:read'] },
  { moduleKey: 'menus', codes: ['menus:read', 'menus:write'] },
  { moduleKey: 'blog', codes: ['blog:write'] },
  { moduleKey: 'library', codes: ['library:read', 'library:write', 'library:lend'] },
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
