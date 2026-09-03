'use client'

import { Loader2 } from 'lucide-react'
import Image from 'next/image'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { useIsAuthenticated, useIsHydrated } from '@/lib/stores/auth.store'
import heroImg from '@/assets/hero-img.png'

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
    <div className="flex min-h-screen w-full bg-accent">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="relative w-full flex-1 overflow-hidden">
          <Image
            src={heroImg}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            aria-hidden
          />
          <div className="absolute inset-0 bg-neutral-900/40" aria-hidden="true" />
          <div className="dashboard-view relative w-full h-full overflow-y-auto p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
