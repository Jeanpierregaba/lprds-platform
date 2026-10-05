import { getLocale, getTranslations } from 'next-intl/server'

import { marketingPath } from '@/i18n/slugs'
import Image from 'next/image'
import { MapPin, Phone, Mail, Clock } from 'lucide-react'
import { BRAND, buildBrandCopy, MARKETING_NAV } from '@/lib/marketing/data'
import { FacebookIcon, InstagramIcon, LinkedinIcon, TiktokIcon } from './brand-icons'
import { Link } from '@/i18n/navigation'

const SOCIALS = [
  { href: BRAND.social.facebook, label: 'Facebook', Icon: FacebookIcon },
  { href: BRAND.social.instagram, label: 'Instagram', Icon: InstagramIcon },
  { href: BRAND.social.linkedin, label: 'LinkedIn', Icon: LinkedinIcon },
  { href: BRAND.social.tiktok, label: 'TikTok', Icon: TiktokIcon },
]

export async function SiteFooter() {
  const t = await getTranslations('marketing')
  const locale = await getLocale()
  const tNav = await getTranslations('marketing.nav')
  const tFooter = await getTranslations('marketing.footer')
  const brand = buildBrandCopy(t)

  return (
    <footer className="bg-secondary text-primary-foreground">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:gap-12 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Link href="/" className="inline-block">
              <Image src="/images/marketing/logo.png" alt={BRAND.name} width={200} height={90} className="h-16 w-auto sm:h-20" />
            </Link>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-primary-foreground/75">
              {tFooter('intro', { year: BRAND.since })}
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
            <h3 className="font-bold text-lg text-primary">{tFooter('navigation')}</h3>
            <ul className="mt-5 space-y-3">
              {MARKETING_NAV.map((l) => (
                <li key={l.href}>
                  <Link href={marketingPath(l.href, locale)} className="text-sm text-primary-foreground/75 transition-colors hover:text-primary">
                    {tNav(l.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-lg text-primary">{tFooter('contact')}</h3>
            <ul className="mt-5 space-y-4 text-sm text-primary-foreground/75">
              <li className="flex gap-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{brand.address}</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="size-4 shrink-0 text-primary" />
                <a href={BRAND.phoneHref} className="hover:text-primary">{BRAND.phone}</a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="size-4 shrink-0 text-primary" />
                <a href={`mailto:${BRAND.email}`} className="break-all hover:text-primary">{BRAND.email}</a>
              </li>
              <li className="flex gap-3 pt-1">
                <Clock className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="space-y-1">
                  {brand.hours.map((h) => (
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
          <p>{tFooter('rights', { year: new Date().getFullYear(), name: BRAND.name })}</p>
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-6">
            <Link href={marketingPath('/mentions-legales', locale)} className="hover:text-primary">{tFooter('legal')}</Link>
            <Link href={marketingPath('/confidentialite', locale)} className="hover:text-primary">{tFooter('privacy')}</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
