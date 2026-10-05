'use client'

import { useTranslations } from 'next-intl'
import { Check, Globe } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLocaleSwitch } from '@/i18n/use-locale-switch'
import { LOCALES } from '@/i18n/routing'
import { cn } from '@/lib/utils/cn'

/**
 * Sélecteur de langue — en-tête du site vitrine comme de tous les espaces
 * connectés. La mécanique vit dans `useLocaleSwitch` ; ce fichier n'est que
 * l'apparence.
 *
 * ⚠️ C'était un commutateur segmenté montrant « FR | EN » en permanence. Trois
 * raisons de l'avoir refait :
 *
 * 1. **« EN » ne dit rien à qui ne lit pas déjà la langue.** Un parent
 *    anglophone devant une interface française cherche son drapeau, pas un
 *    sigle de deux lettres ; le menu affiche désormais « English » en entier,
 *    écrit dans sa propre langue (jamais « Anglais » — un nom de langue se
 *    donne dans la langue qu'il désigne, c'est la convention de tous les
 *    sélecteurs du Web, et la seule qui soit lisible par l'intéressé).
 * 2. **Il ne portait aucune étiquette visible.** Deux sigles côte à côte, sans
 *    icône : rien n'indiquait qu'il s'agissait de la langue plutôt que d'un
 *    filtre ou d'une unité. Le globe le dit sans un mot et sans traduction.
 * 3. **Il ne tenait pas à côté de ses voisins.** Un rectangle bordé entre des
 *    pastilles rondes dans la vitrine, et à côté d'un bouton fantôme dans le
 *    tableau de bord : le poids visuel désignait un contrôle principal, alors
 *    que c'est un utilitaire.
 *
 * La forme en menu a un second mérite : elle tient sans rien changer si une
 * troisième langue arrive, là où un commutateur segmenté se serre à chaque
 * ajout.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations('common.locale')
  const { active, switchTo, isPending } = useLocaleSwitch()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('label')}
        title={t('label')}
        disabled={isPending}
        className={cn(
          'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3',
          'text-sm font-medium text-muted-foreground transition-colors',
          'hover:bg-muted hover:text-foreground',
          // Le menu ouvert doit rester visiblement « enfoncé », sinon on perd
          // de vue quel contrôle on a déplié.
          'aria-expanded:bg-muted aria-expanded:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isPending && 'cursor-not-allowed opacity-60',
          className,
        )}
      >
        <Globe className="size-4" aria-hidden />
        {/* Le code reste affiché : il dit la langue EN COURS d'un coup d'œil,
            sans ouvrir le menu, et tient sur un en-tête mobile. */}
        <span className="uppercase">{active}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-44">
        {/*
          ⚠️ `DropdownMenuLabel` est le `Menu.GroupLabel` de Base UI : il EXIGE
          un `Menu.Group` au-dessus de lui, sinon le menu lève à l'ouverture
          (« MenuGroupContext is missing »). Rien ne le dit — ni le nom, qui
          évoque un simple titre, ni les types, qui compilent sans. Le défaut
          ne se voit donc ni au type-check ni au build : seulement en dépliant
          le menu pour de vrai.
        */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('label')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {LOCALES.map((locale) => {
            const isActive = locale === active
            return (
              <DropdownMenuItem
                key={locale}
                onClick={() => switchTo(locale)}
                aria-current={isActive ? 'true' : undefined}
                className="justify-between gap-6"
              >
                {/* Nom de la langue DANS cette langue — cf. en-tête du fichier. */}
                <span className={cn(isActive && 'font-medium')}>{t(locale)}</span>
                {isActive
                  ? <Check className="size-4 text-primary" aria-hidden />
                  : <span className="text-xs uppercase text-muted-foreground">{locale}</span>}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
