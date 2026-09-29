export interface UserBrief {
  id:         string
  first_name: string
  last_name:  string
  nickname?:  string | null
}

export interface DayMenu {
  collation: string | null
  dejeuner:  string | null
  dessert:   string | null
  gouter:    string | null
}

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const
export type Weekday = (typeof WEEKDAYS)[number]

/** Libellés dans les catalogues (`enums.weekdays`). */
export const MEAL_SLOTS = ['collation', 'dejeuner', 'dessert', 'gouter'] as const
export type MealSlot = (typeof MEAL_SLOTS)[number]

/** Libellés dans les catalogues (`enums.mealSlots`). */
export type WeekContent = Record<Weekday, DayMenu>

export interface Menu extends WeekContent {
  id:               string
  establishment_id: string
  department_id:    string
  department_name:  string | null
  week_start:       string
  week_end:         string
  created_by:       UserBrief
  updated_by:       UserBrief | null
  created_at:       string
  updated_at:       string
}

export interface MenuListItem {
  id:              string
  department_id:   string
  department_name: string | null
  week_start: string
  week_end:   string
  updated_at: string
}

export interface MenuListResponse {
  total: number
  items: MenuListItem[]
}

/** Semaine en cours : UN menu par département visible (vide si aucun publié). */
export interface CurrentMenusResponse {
  items: Menu[]
}

export interface VisibleDepartment {
  id:   string
  name: string
}

export interface VisibleDepartmentsResponse {
  total: number
  items: VisibleDepartment[]
}

export type MenuWritePayload = WeekContent

export interface MenuCreatePayload extends WeekContent {
  week_start: string
  department_id: string
}

export const EMPTY_DAY_MENU: DayMenu = { collation: null, dejeuner: null, dessert: null, gouter: null }

export function emptyWeek(): WeekContent {
  return {
    monday: { ...EMPTY_DAY_MENU },
    tuesday: { ...EMPTY_DAY_MENU },
    wednesday: { ...EMPTY_DAY_MENU },
    thursday: { ...EMPTY_DAY_MENU },
    friday: { ...EMPTY_DAY_MENU },
  }
}
