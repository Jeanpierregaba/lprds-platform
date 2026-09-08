import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Phone, Mail, Clock } from 'lucide-react'
import { BRAND } from '@/lib/marketing/data'
import { FacebookIcon, InstagramIcon, LinkedinIcon, TiktokIcon } from './brand-icons'

const SOCIALS = [
  { href: BRAND.social.facebook, label: 'Facebook', Icon: FacebookIcon },
  { href: BRAND.social.instagram, label: 'Instagram', Icon: InstagramIcon },
  { href: BRAND.social.linkedin, label: 'LinkedIn', Icon: LinkedinIcon },
  { href: BRAND.social.tiktok, label: 'TikTok', Icon: TiktokIcon },
]

const NAV_LINKS = [
  { name: 'Accueil', href: '/' },
  { name: 'À Propos', href: '/a-propos' },
  { name: 'Nos Sections', href: '/nos-sections' },
  { name: 'Galerie', href: '/galerie' },
  { name: 'Actualités', href: '/actualites' },
  { name: 'Contact', href: '/contact' },
]

export function SiteFooter() {
  return (
    <footer className="bg-secondary text-primary-foreground">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Link href="/" className="inline-block">
              <Image src="/images/marketing/logo.png" alt={BRAND.name} width={200} height={90} className="h-30 w-auto" />
            </Link>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-primary-foreground/75">
              Depuis {BRAND.since}, nous accompagnons les enfants de 3 mois à 8 ans dans leur épanouissement
              quotidien. Un environnement sécurisé, bienveillant et stimulant pour grandir en toute sérénité.
            </p>
            <div className="mt-6 flex gap-3">
              {SOCIALS.map(({ href, label, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex size-10 items-center justify-center rounded-full bg-primary-foreground/10 transition-colors hover:bg-secondary hover:text-primary"
                >
                  <Icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-bold text-lg text-primary">Navigation</h3>
            <ul className="mt-5 space-y-3">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-primary-foreground/75 transition-colors hover:text-primary">
                    {l.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-lg text-primary">Contact</h3>
            <ul className="mt-5 space-y-4 text-sm text-primary-foreground/75">
              <li className="flex gap-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{BRAND.address}</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="size-4 shrink-0 text-primary" />
                <a href={BRAND.phoneHref} className="hover:text-primary">{BRAND.phone}</a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="size-4 shrink-0 text-primary" />
                <a href={`mailto:${BRAND.email}`} className="hover:text-primary">{BRAND.email}</a>
              </li>
              <li className="flex gap-3 pt-1">
                <Clock className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="space-y-1">
                  {BRAND.hours.map((h) => (
                    <div key={h.day}>
                      <span className="block">{h.day}</span>
                      <span className="text-primary-foreground/60">{h.hours}</span>
                    </div>
                  ))}
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-primary-foreground/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-6 py-6 text-xs text-primary-foreground/60 sm:flex-row sm:justify-between lg:px-8">
          <p>© {new Date().getFullYear()} {BRAND.name}. Tous droits réservés.</p>
          <div className="flex gap-6">
            <Link href="/mentions-legales" className="hover:text-primary">Mentions légales</Link>
            <Link href="/confidentialite" className="hover:text-primary">Politique de confidentialité</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
