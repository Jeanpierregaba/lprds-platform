import { LayoutDashboard, Building2, Settings, Network, ShieldCheck, UserRound, Baby, Users, ClipboardCheck, MessageCircle, FileText, UtensilsCrossed, Images, Newspaper, BookOpen } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { UserRole } from '@/types/auth'
import type { PermissionCode } from '@/types/rbac'

export interface NavItem {
  /** Clé du catalogue `nav.*` — jamais un libellé en dur : ces entrées
   *  traversent le rendu serveur, où aucun traducteur n'est disponible. */
  labelKey: string
  href:  string
  icon:  LucideIcon
}

// Extraits en constantes (plutôt qu'indexés depuis NAV_ITEMS.staff) : la
// sidebar staff doit pouvoir les entourer des modules composés dynamiquement
// sans passer par un accès par index sur tableau (noUncheckedIndexedAccess).
export const STAFF_DASHBOARD_ITEM: NavItem = { labelKey: 'dashboard', href: '/dashboard/staff', icon: LayoutDashboard }
export const STAFF_SETTINGS_ITEM: NavItem = { labelKey: 'settings', href: '/dashboard/staff/settings', icon: Settings }

export const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  superadmin: [
    { labelKey: 'dashboard', href: '/dashboard/super', icon: LayoutDashboard },
    { labelKey: 'establishments', href: '/dashboard/super/establishments', icon: Building2 },
    { labelKey: 'settings', href: '/dashboard/super/settings', icon: Settings },
  ],
  admin: [
    { labelKey: 'dashboard', href: '/dashboard/admin', icon: LayoutDashboard },
    { labelKey: 'children', href: '/dashboard/admin/children', icon: Baby },
    { labelKey: 'parents', href: '/dashboard/admin/parents', icon: Users },
    { labelKey: 'staff', href: '/dashboard/admin/staff', icon: UserRound },
    { labelKey: 'attendance', href: '/dashboard/admin/attendance', icon: ClipboardCheck },
    { labelKey: 'messaging', href: '/dashboard/admin/messaging', icon: MessageCircle },
    { labelKey: 'reports', href: '/dashboard/admin/reports', icon: FileText },
    { labelKey: 'menus', href: '/dashboard/admin/menus', icon: UtensilsCrossed },
    { labelKey: 'library', href: '/dashboard/admin/library', icon: BookOpen },
    { labelKey: 'gallery', href: '/dashboard/admin/gallery', icon: Images },
    { labelKey: 'blog', href: '/dashboard/admin/blog', icon: Newspaper },
    { labelKey: 'organization', href: '/dashboard/admin/organization', icon: Network },
    { labelKey: 'roles', href: '/dashboard/admin/roles', icon: ShieldCheck },
    { labelKey: 'settings', href: '/dashboard/admin/settings', icon: Settings },
  ],
  // Statique et volontairement minimal — la sidebar staff est composée
  // dynamiquement (cf. STAFF_MODULE_ITEMS) selon les permissions RBAC
  // effectives du membre connecté, récupérées via GET /rbac/me.
  staff: [STAFF_DASHBOARD_ITEM, STAFF_SETTINGS_ITEM],
  parent: [
    { labelKey: 'dashboard', href: '/dashboard/parent', icon: LayoutDashboard },
    { labelKey: 'reports', href: '/dashboard/parent/reports', icon: FileText },
    { labelKey: 'messaging', href: '/dashboard/parent/messaging', icon: MessageCircle },
    { labelKey: 'gallery', href: '/dashboard/parent/gallery', icon: Images },
    { labelKey: 'menus', href: '/dashboard/parent/menus', icon: UtensilsCrossed },
    { labelKey: 'library', href: '/dashboard/parent/library', icon: BookOpen },
    { labelKey: 'settings', href: '/dashboard/parent/settings', icon: Settings },
  ],
}

/**
 * Socle éducatrice — hors RBAC, toujours affiché pour tout compte staff
 * (pas de permission à cocher par l'admin) : ces pages sont scopées à ses
 * propres données par construction (groupe mené, uploads envoyés), cf.
 * app/modules/children/router.py::list_my_group_children et équivalents
 * attendance/gallery. Distinct des modules "spéciaux" ci-dessous, qui
 * portent sur TOUT l'établissement et restent au choix de l'admin.
 */
export const STAFF_BASELINE_ITEMS: NavItem[] = [
  { labelKey: 'myGroup', href: '/dashboard/staff/my-group', icon: Baby },
  { labelKey: 'myAttendance', href: '/dashboard/staff/attendance', icon: ClipboardCheck },
  { labelKey: 'myMedia', href: '/dashboard/staff/gallery', icon: Images },
  { labelKey: 'library', href: '/dashboard/staff/library', icon: BookOpen },
]

/**
 * Modules admin réutilisés par le portail staff (cf. décision : pas de
 * duplication de routes, le backend scope déjà les données par permission —
 * ex. une éducatrice ne voit que les rapports de son propre groupe). Chaque
 * entrée n'apparaît dans la sidebar staff que si le membre porte AU MOINS UNE
 * des permissions listées — jamais Messagerie (hors RBAC, admin/parent
 * uniquement) ni Rôles & permissions (réservé à l'admin).
 */
export const STAFF_MODULE_ITEMS: (NavItem & {
  permissions: PermissionCode[]
  /** true = TOUTES les permissions requises (défaut : AU MOINS UNE). */
  requireAll?: boolean
})[] = [
  { labelKey: 'children', href: '/dashboard/admin/children', icon: Baby, permissions: ['children:read'] },
  { labelKey: 'parents', href: '/dashboard/admin/parents', icon: Users, permissions: ['parents:read'] },
  { labelKey: 'staff', href: '/dashboard/admin/staff', icon: UserRound, permissions: ['staff:read'] },
  {
    labelKey: 'attendance', href: '/dashboard/admin/attendance', icon: ClipboardCheck,
    permissions: ['attendance:read', 'attendance:scan', 'attendance:write'],
  },
  {
    labelKey: 'reports', href: '/dashboard/admin/reports', icon: FileText,
    permissions: ['reports:read', 'reports:write', 'reports:validate'],
  },
  {
    labelKey: 'menus', href: '/dashboard/admin/menus', icon: UtensilsCrossed,
    permissions: ['menus:read', 'menus:write'],
  },
  { labelKey: 'gallery', href: '/dashboard/admin/gallery', icon: Images, permissions: ['gallery:read'] },
  {
    labelKey: 'library', href: '/dashboard/admin/library', icon: BookOpen,
    permissions: ['library:read', 'library:write', 'library:lend'],
  },
  { labelKey: 'blog', href: '/dashboard/admin/blog', icon: Newspaper, permissions: ['blog:write'] },
  { labelKey: 'organization', href: '/dashboard/admin/organization', icon: Network, permissions: ['organization:read'] },
  // Paramètres des modules (onglets déplacés vers /dashboard/admin/settings) —
  // le staff délégué y garde accès en lien profond (?tab=), filtré ci-dessous.
  // PAS d'entrée « Paramètres rapports » : les types activés par département
  // sont réservés à l'admin (une éducatrice porte reports:write mais ne
  // configure pas les types actifs — cf. backend reports/router.py).
  {
    labelKey: 'attendanceSettings', href: '/dashboard/admin/settings?tab=presences', icon: Settings,
    permissions: ['attendance:write'],
  },
  // ⚠️ PAS d'entrée « Paramètres bibliothèque » : `GET/PUT /library/settings`
  // est réservé à l'admin (décision testée), non délégable. L'entrée existait
  // et visait exactement le profil que le serveur refuse — un bibliothécaire
  // y arrivait sur un formulaire qui affichait des valeurs par défaut
  // inventées, puis échouait à l'enregistrement.
]
