import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import Cookies from 'js-cookie'
import type { User, TokenResponse } from '@/types/auth'

// middleware.ts (Edge) lit la session depuis un cookie, pas localStorage —
// le storage Zustand doit donc être adossé aux cookies pour que les deux
// restent synchronisés.
const cookieStorage: StateStorage = {
  getItem: (name) => Cookies.get(name) ?? null,
  setItem: (name, value) =>
    Cookies.set(name, value, { expires: 30, sameSite: 'lax', path: '/' }),
  removeItem: (name) => Cookies.remove(name, { path: '/' }),
}

interface AuthState {
  user:          User | null
  accessToken:   string | null
  refreshToken:  string | null
  isHydrated:    boolean

  // Actions
  setSession:    (tokens: TokenResponse, user: User) => void
  clearSession:  () => void
  setUser:       (user: User) => void
  setHydrated:   () => void
}

export const useAuthStore = create<AuthState>()(
    persist(
      (set) => ({
        user:         null,
        accessToken:  null,
        refreshToken: null,
        isHydrated:   false,
  
        setSession: (tokens, user) => set({
          accessToken:  tokens.access_token,
          refreshToken: tokens.refresh_token,
          user,
        }),

        clearSession: () => set({
            user:         null,
            accessToken:  null,
            refreshToken: null,
          }),
    
          setUser:     (user) => set({ user }),
          setHydrated: ()     => set({ isHydrated: true }),
        }),

        
        {
          name:    'lprds-auth',
          storage: createJSONStorage(() => cookieStorage),
          // Ne persister que les tokens — pas isHydrated
          partialize: (state) => ({
            accessToken:  state.accessToken,
            refreshToken: state.refreshToken,
            user:         state.user,
          }),
          onRehydrateStorage: () => (state) => {
            state?.setHydrated()
          },
          
        }
    )
)

// Sélecteurs mémoïsés (évite les re-renders inutiles)
export const useUser          = () => useAuthStore((s) => s.user)
export const useAccessToken   = () => useAuthStore((s) => s.accessToken)
export const useIsAuthenticated = () => useAuthStore((s) => !!s.accessToken && !!s.user)
export const useIsHydrated    = () => useAuthStore((s) => s.isHydrated)

