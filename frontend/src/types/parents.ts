export interface ParentChildBrief {
  id: string
  matricule: string
  last_name: string
  first_names: string
}

export interface ParentListItem {
  id: string
  email: string
  first_name: string
  last_name: string
  nickname: string | null
  phone: string | null
  is_active: boolean
  children_count: number
}

export interface ParentListResponse {
  total: number
  items: ParentListItem[]
}

export interface Parent {
  id: string
  email: string
  first_name: string
  last_name: string
  nickname: string | null
  phone: string | null
  establishment_id: string | null
  is_active: boolean
  must_change_pwd: boolean
  created_at: string
  last_login_at: string | null
  assigned_children: ParentChildBrief[]
}

export interface ParentCreatePayload {
  first_name: string
  last_name: string
  nickname: string
  phone: string
  email: string
  password: string
  child_ids: string[]
}

export interface ParentUpdatePayload {
  first_name?: string
  last_name?: string
  nickname?: string
  phone?: string
  email?: string
  is_active?: boolean
  child_ids?: string[]
}
