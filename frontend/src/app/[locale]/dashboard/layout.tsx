'use client'

import { Loader2 } from 'lucide-react'
import Image from 'next/image'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { MessagingNotifier } from '@/components/messaging/messaging-notifier'
import { MessagingSocketProvider } from '@/lib/messaging/socket-context'
import { useIsAuthenticated, useIsHydrated, useUser } from '@/lib/stores/auth.store'
import heroImg from '@/assets/hero-img.png'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const isHydrated = useIsHydrated()
  const isAuthenticated = useIsAuthenticated()
  const user = useUser()

  // Défense en profondeur en plus du middleware — évite un flash de contenu
  // protégé avant que la session (persistée en cookie) ne soit réhydratée.
  if (!isHydrated || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Temps réel messagerie global (toasts à la réception sur toutes les pages).
  // Réservé aux rôles éligibles au WebSocket — le serveur rejette les autres
  // (staff/superadmin), autant ne pas ouvrir de connexion vouée à être fermée.
  const realtimeContent = (
    <>
      {user && (user.role === 'admin' || user.role === 'parent') && <MessagingNotifier />}
      {children}
    </>
  )

  return (
    // ⚠️ `h-dvh`, pas `min-h-screen`. L'image de fond est posée en `fill` dans
    // `main` et la zone de contenu a son PROPRE défilement (`.dashboard-view`,
    // `h-full overflow-y-auto`) : ce montage ne tient que si la coque est
    // BORNÉE à la hauteur de la fenêtre. Avec un simple minimum, elle grandit
    // avec le contenu, le défilement repasse au document entier, et l'image —
    // dimensionnée sur `main` — grandit puis se recadre avec lui. Mesuré :
    // déplier une diffusion la faisait passer de 1210 à 1322 px, d'où le fond
    // qui « bouge » sans que personne n'ait touché à l'image.
    // `dvh` et non `vh` : sur mobile, la barre d'adresse qui se rétracte change
    // la hauteur utile, et `vh` l'ignore (bas de page coupé).
    <div className="flex h-dvh w-full bg-accent print:block print:h-auto print:min-h-0 print:bg-white">
      {/* `print:hidden` : à l'impression (trombinoscope d'une section), seul le
          contenu compte — la navigation et l'image de fond ne feraient que
          consommer de l'encre et voler une demi-page. */}
      <div className="print:hidden contents">
        <Sidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="print:hidden contents">
          <Header />
        </div>
        <main className="relative w-full flex-1 overflow-hidden print:overflow-visible">
          <Image
            src={heroImg}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover print:hidden"
            aria-hidden
          />
          <div className="absolute inset-0 bg-neutral-900/40 print:hidden" aria-hidden="true" />
          <div className="dashboard-view relative w-full h-full overflow-y-auto p-4 sm:p-6 print:h-auto print:overflow-visible print:p-0">
            {user && (user.role === 'admin' || user.role === 'parent') ? (
              <MessagingSocketProvider>
                {realtimeContent}
              </MessagingSocketProvider>
            ) : (
              children
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
