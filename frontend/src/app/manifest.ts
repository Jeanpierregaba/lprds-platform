import type { MetadataRoute } from 'next'

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'LPRDS'
const SHORT_NAME = 'LPRDS'
const THEME_COLOR = '#F5AA2D'
const BACKGROUND_COLOR = '#FFFFFF'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: String(APP_NAME),
    short_name: SHORT_NAME,
    description:
      "LPRDS — plateforme de gestion des crèches, garderies et écoles maternelles : présences, messagerie, rapports, galerie, menus et actualités de l'établissement.",
    lang: 'fr',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    orientation: 'any',
    theme_color: THEME_COLOR,
    background_color: BACKGROUND_COLOR,
    categories: ['education', 'productivity', 'lifestyle'],
    launch_handler: { client_mode: 'navigate-existing' },
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Galerie',
        short_name: 'Galerie',
        url: '/galerie',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Actualités',
        short_name: 'Actualités',
        url: '/actualites',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  }
}