'use client'

import { Loader2 } from 'lucide-react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { useIsAuthenticated, useIsHydrated } from '@/lib/stores/auth.store'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const isHydrated = useIsHydrated()
  const isAuthenticated = useIsAuthenticated()

  // Défense en profondeur en plus du middleware — évite un flash de contenu
  // protégé avant que la session (persistée en cookie) ne soit réhydratée.
  if (!isHydrated || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="w-full flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
