import { apiClient } from './client'
import type {
  LoginPayload, TokenResponse, User,
  PasswordResetPayload, PasswordResetConfirmPayload, PasswordChangePayload,
} from '@/types/auth'

export const authApi = {
    login: (data: LoginPayload) =>
        apiClient.post<TokenResponse>('/api/v1/auth/login', data),
    
      me: (token?: string) =>
        apiClient.get<User>('/api/v1/auth/me', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }),  

  refresh: (refreshToken: string) =>
    apiClient.post<TokenResponse>('/api/v1/auth/refresh', { refresh_token: refreshToken }),

  requestReset: (data: PasswordResetPayload) =>
    apiClient.post('/api/v1/auth/password-reset', data),

  confirmReset: (data: PasswordResetConfirmPayload) =>
    apiClient.post('/api/v1/auth/password-reset/confirm', data),

  changePassword: (data: PasswordChangePayload) =>
    apiClient.post('/api/v1/auth/password-change', data),

  logout: (refreshToken: string) =>
    apiClient.post('/api/v1/auth/logout', { refresh_token: refreshToken }),
}