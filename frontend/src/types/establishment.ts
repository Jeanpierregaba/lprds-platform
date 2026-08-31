import type { User } from './auth'

export interface Establishment {
  id:         string
  code:       string
  name:       string
  address:    string
  email:      string
  phone:      string
  is_active:  boolean
  created_at: string
  updated_at: string
}

export interface EstablishmentDetail extends Establishment {
  admins: User[]
}

export interface EstablishmentListResponse {
  total: number
  items: Establishment[]
}

export interface EstablishmentAdminCreatePayload {
  email:      string
  first_name: string
  last_name:  string
  phone?:     string
  password:   string
}

export interface EstablishmentCreatePayload {
  code:    string
  name:    string
  address: string
  email:   string
  phone:   string
  admin:   EstablishmentAdminCreatePayload
}

export interface EstablishmentUpdatePayload {
  code?:      string
  name?:      string
  address?:   string
  email?:     string
  phone?:     string
  is_active?: boolean
}

export interface EstablishmentListParams {
  search?:           string
  include_inactive?: boolean
  skip?:             number
  limit?:            number
}
