import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/* ⚠️ `min-h-5` et non `h-5`.
 *
 * La base impose `whitespace-nowrap` : une pastille tient donc sur une ligne,
 * et une hauteur fixe ne posait aucun problème. Mais `overflow-hidden` est là
 * aussi — alors dès qu'un appelant autorise le retour à la ligne
 * (`whitespace-normal`, ce que font les rapports et les menus), le texte
 * passait bien à la ligne et se faisait COUPER à vingt pixels. L'appelant
 * voyait ses classes appliquées et le défaut venait de la base : sur un
 * téléphone, les comportements d'un rapport s'affichaient tronqués et
 * chevauchés.
 *
 * `min-h-5` ne change rien aux pastilles d'une seule ligne — c'est la même
 * hauteur — et laisse grandir celles qui en ont besoin.
 */
const badgeVariants = cva(
  "group/badge inline-flex min-h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
