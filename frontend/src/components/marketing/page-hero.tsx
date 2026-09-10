import Image from 'next/image'
import type { LucideIcon } from 'lucide-react'

interface PageHeroProps {
  title: string
  subtitle: string
  badge: string
  Icon: LucideIcon
  image: string
}

/** Bannière d'en-tête des pages intérieures (tout sauf l'accueil). */
export function PageHero({ title, subtitle, badge, Icon, image }: PageHeroProps) {
  return (
    <section className="relative flex min-h-[52svh] items-center justify-center overflow-hidden pt-24 sm:min-h-[65vh] lg:pt-28">
      <Image src={image} alt="" fill priority className="object-cover" sizes="100vw" />
      <div className="absolute inset-0 bg-gradient-to-b via-black/50 to-black/60" />
      <div className="relative z-10 mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 sm:py-20">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
          <Icon className="size-4" />
          {badge}
        </div>
        <h1 className="mt-6 font-display text-3xl leading-[1.05] text-white sm:text-5xl">{title}</h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-white/85 sm:text-lg">{subtitle}</p>
      </div>
    </section>
  )
}
