import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'

import enMarketing from '../../messages/en/marketing.json'
import frMarketing from '../../messages/fr/marketing.json'
import enPwa from '../../messages/en/pwa.json'
import frPwa from '../../messages/fr/pwa.json'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isAppLocale, type AppLocale } from '@/i18n/routing'
import { prefersFrench } from '@/i18n/detect'
import { marketingPath } from '@/i18n/slugs'

const SHORT_NAME = 'LPRDS'
const THEME_COLOR = '#F5AA2D'
const BACKGROUND_COLOR = '#FFFFFF'

const CATALOGS = {
  fr: { marketing: frMarketing, pwa: frPwa },
  en: { marketing: enMarketing, pwa: enPwa },
} as const

/**
 * Langue du manifeste.
 *
 * Un Web App Manifest ne déclare qu'UNE langue, et il est servi hors du
 * segment `[locale]` — il n'a donc pas de préfixe d'URL d'où la déduire. On la
 * lit dans le cookie posé par le sélecteur de langue, à défaut dans
 * `Accept-Language` (même règle que partout : le français seulement s'il est
 * explicitement préféré).
 *
 * Conséquence assumée : l'OS récupère le manifeste AU MOMENT DE
 * L'INSTALLATION et le fige. Un utilisateur qui installe l'app en anglais
 * garde des raccourcis anglais même s'il repasse l'interface en français —
 * c'est le comportement attendu, et de toute façon le seul possible : rien ne
 * permet de re-négocier un manifeste déjà installé.
 */
async function resolveLocale(): Promise<AppLocale> {
  const headerList = await headers()

  const cookieHeader = headerList.get('cookie') ?? ''
  const fromCookie = new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`).exec(cookieHeader)?.[1]
  if (isAppLocale(fromCookie)) return fromCookie

  return prefersFrench(headerList.get('accept-language')) ? 'fr' : 'en'
}

/**
 * ⚠️ Route DYNAMIQUE : l'appel à `headers()` empêche Next de la figer au
 * build. C'est indispensable ici — un manifeste statique serait forcément
 * dans une seule langue pour tout le monde.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await resolveLocale()
  const { marketing, pwa } = CATALOGS[locale]

  // Le français garde les URL nues, l'anglais prend son préfixe — même règle
  // que le reste du site (`localePrefix: 'as-needed'`). Sans ce préfixe, un
  // raccourci installé en anglais rouvrirait la page en français.
  // `|| '/'` : sans lui, la racine donnerait `/en/` — un slash final qui
  // déclencherait une redirection à chaque lancement de l'app installée.
  // Les raccourcis pointent vers des pages publiques, qui ont un slug par
  // langue : un raccourci anglais sur `/en/galerie` serait redirigé à chaque
  // lancement depuis l'écran d'accueil.
  const path = (route: string) => {
    const slug = marketingPath(route, locale)
    return locale === DEFAULT_LOCALE ? slug : `/${locale}${slug === '/' ? '' : slug}` || '/'
  }

  return {
    id: '/',
    name: pwa.name,
    short_name: SHORT_NAME,
    description: pwa.description,
    lang: locale,
    dir: 'ltr',
    start_url: path('/'),
    // `scope` reste la racine quelle que soit la langue : le limiter à `/en`
    // sortirait les pages françaises de l'application installée.
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
        name: marketing.nav.gallery,
        short_name: marketing.nav.gallery,
        url: path('/galerie'),
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: marketing.nav.news,
        short_name: marketing.nav.news,
        url: path('/actualites'),
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  }
}
