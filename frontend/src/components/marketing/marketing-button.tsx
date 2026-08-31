import Link from 'next/link'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * CTA du site vitrine — pill-shaped, échelle hero, distincte du <Button/>
 * compact du dashboard (h-9, rounded-md) : les deux surfaces n'ont pas la
 * même densité et partagent seulement les tokens de couleur.
 */
const marketingButtonVariants = cva(
  'group/mbtn inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-[0_4px_0_var(--color-primary-layer)] hover:translate-y-1 hover:shadow-none',
        secondary: 'bg-secondary text-secondary-foreground shadow-[0_4px_0_var(--color-secondary-layer)] hover:translate-y-1 hover:shadow-none',
        tertiary: 'bg-tertiary text-tertiary-foreground shadow-[0_4px_0_var(--color-tertiary-layer)] hover:translate-y-1 hover:shadow-none',
        outline: 'border-2 border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground',
        ghost: 'text-primary-foreground hover:bg-primary-foreground/15',
        whatsapp: 'bg-[#25D366] text-white shadow-[0_4px_0_#1fb959] hover:translate-y-1 hover:shadow-none',
      },
      size: {
        default: 'h-11 px-6 text-sm [&_svg:not([class*="size-"])]:size-4',
        lg: 'h-14 px-8 text-base [&_svg:not([class*="size-"])]:size-5',
        icon: 'size-11 [&_svg:not([class*="size-"])]:size-5',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  }
)

type MarketingButtonProps = VariantProps<typeof marketingButtonVariants> & {
  className?: string
  children: React.ReactNode
} & (
    | ({ href: string } & Omit<React.ComponentProps<typeof Link>, 'href' | 'className'>)
    | ({ href?: undefined } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'>)
  )

export function MarketingButton({ className, variant, size, children, href, ...props }: MarketingButtonProps) {
  const classes = cn(marketingButtonVariants({ variant, size, className }))
  if (href) {
    const isExternal = href.startsWith('http') || href.startsWith('tel:') || href.startsWith('mailto:')
    if (isExternal) {
      return (
        <a href={href} className={classes} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}>
          {children}
        </a>
      )
    }
    return (
      <Link href={href} className={classes} {...(props as Omit<React.ComponentProps<typeof Link>, 'href' | 'className'>)}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" className={classes} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  )
}
