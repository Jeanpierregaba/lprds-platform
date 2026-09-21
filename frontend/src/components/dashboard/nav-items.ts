import { LayoutDashboard, Building2, Settings, Network, ShieldCheck, UserRound, Baby, Users, ClipboardCheck, MessageCircle, FileText, UtensilsCrossed, Images, Newspaper, BookOpen } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { UserRole } from '@/types/auth'
import type { PermissionCode } from '@/types/rbac'

export interface NavItem {
  label: string
  href:  string
  icon:  LucideIcon
}

// Extraits en constantes (plutôt qu'indexés depuis NAV_ITEMS.staff) : la
// sidebar staff doit pouvoir les entourer des modules composés dynamiquement
// sans passer par un accès par index sur tableau (noUncheckedIndexedAccess).
export const STAFF_DASHBOARD_ITEM: NavItem = { label: 'Tableau de bord', href: '/dashboard/staff', icon: LayoutDashboard }
export const STAFF_SETTINGS_ITEM: NavItem = { label: 'Paramètres', href: '/dashboard/staff/settings', icon: Settings }

export const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  superadmin: [
    { label: 'Tableau de bord', href: '/dashboard/super', icon: LayoutDashboard },
    { label: 'Établissements', href: '/dashboard/super/establishments', icon: Building2 },
    { label: 'Paramètres', href: '/dashboard/super/settings', icon: Settings },
  ],
  admin: [
    { label: 'Tableau de bord', href: '/dashboard/admin', icon: LayoutDashboard },
    { label: 'Enfants', href: '/dashboard/admin/children', icon: Baby },
    { label: 'Parents', href: '/dashboard/admin/parents', icon: Users },
    { label: 'Personnel', href: '/dashboard/admin/staff', icon: UserRound },
    { label: 'Présences', href: '/dashboard/admin/attendance', icon: ClipboardCheck },
    { label: 'Messagerie', href: '/dashboard/admin/messaging', icon: MessageCircle },
    { label: 'Rapports', href: '/dashboard/admin/reports', icon: FileText },
    { label: 'Menus', href: '/dashboard/admin/menus', icon: UtensilsCrossed },
    { label: 'Bibliothèque', href: '/dashboard/admin/library', icon: BookOpen },
    { label: 'Galerie', href: '/dashboard/admin/gallery', icon: Images },
    { label: 'Blog', href: '/dashboard/admin/blog', icon: Newspaper },
    { label: 'Organisation', href: '/dashboard/admin/organization', icon: Network },
    { label: 'Rôles & permissions', href: '/dashboard/admin/roles', icon: ShieldCheck },
    { label: 'Paramètres', href: '/dashboard/admin/settings', icon: Settings },
  ],
  // Statique et volontairement minimal — la sidebar staff est composée
  // dynamiquement (cf. STAFF_MODULE_ITEMS) selon les permissions RBAC
  // effectives du membre connecté, récupérées via GET /rbac/me.
  staff: [STAFF_DASHBOARD_ITEM, STAFF_SETTINGS_ITEM],
  parent: [
    { label: 'Tableau de bord', href: '/dashboard/parent', icon: LayoutDashboard },
    { label: 'Rapports', href: '/dashboard/parent/reports', icon: FileText },
    { label: 'Messagerie', href: '/dashboard/parent/messaging', icon: MessageCircle },
    { label: 'Galerie', href: '/dashboard/parent/gallery', icon: Images },
    { label: 'Menus', href: '/dashboard/parent/menus', icon: UtensilsCrossed },
    { label: 'Bibliothèque', href: '/dashboard/parent/library', icon: BookOpen },
    { label: 'Paramètres', href: '/dashboard/parent/settings', icon: Settings },
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
  { label: 'Mon Groupe', href: '/dashboard/staff/my-group', icon: Baby },
  { label: 'Présence', href: '/dashboard/staff/attendance', icon: ClipboardCheck },
  { label: 'Mes médias', href: '/dashboard/staff/gallery', icon: Images },
  { label: 'Bibliothèque', href: '/dashboard/staff/library', icon: BookOpen },
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
  { label: 'Enfants', href: '/dashboard/admin/children', icon: Baby, permissions: ['children:read'] },
  { label: 'Parents', href: '/dashboard/admin/parents', icon: Users, permissions: ['parents:read'] },
  { label: 'Personnel', href: '/dashboard/admin/staff', icon: UserRound, permissions: ['staff:read'] },
  {
    label: 'Présences', href: '/dashboard/admin/attendance', icon: ClipboardCheck,
    permissions: ['attendance:read', 'attendance:scan', 'attendance:write'],
  },
  {
    label: 'Rapports', href: '/dashboard/admin/reports', icon: FileText,
    permissions: ['reports:read', 'reports:write', 'reports:validate'],
  },
  {
    label: 'Menus', href: '/dashboard/admin/menus', icon: UtensilsCrossed,
    permissions: ['menus:read', 'menus:write'],
  },
  { label: 'Galerie', href: '/dashboard/admin/gallery', icon: Images, permissions: ['gallery:read'] },
  {
    label: 'Bibliothèque', href: '/dashboard/admin/library', icon: BookOpen,
    permissions: ['library:read', 'library:write', 'library:lend'],
  },
  { label: 'Blog', href: '/dashboard/admin/blog', icon: Newspaper, permissions: ['blog:write'] },
  { label: 'Organisation', href: '/dashboard/admin/organization', icon: Network, permissions: ['organization:read'] },
  // Paramètres des modules (onglets déplacés vers /dashboard/admin/settings) —
  // le staff délégué y garde accès en lien profond (?tab=), filtré ci-dessous.
  // PAS d'entrée « Paramètres rapports » : les types activés par département
  // sont réservés à l'admin (une éducatrice porte reports:write mais ne
  // configure pas les types actifs — cf. backend reports/router.py).
  {
    label: 'Paramètres présences', href: '/dashboard/admin/settings?tab=presences', icon: Settings,
    permissions: ['attendance:write'],
  },
  {
    label: 'Paramètres bibliothèque', href: '/dashboard/admin/settings?tab=bibliotheque', icon: Settings,
    permissions: ['library:read', 'library:write', 'library:lend'], requireAll: true,
  },
]
