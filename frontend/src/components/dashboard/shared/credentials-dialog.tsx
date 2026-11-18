'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Check, Copy, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { APP_NAME } from '@/lib/brand'
import { localePath } from '@/i18n/metadata'

/**
 * Le message d'accès, prêt à coller dans WhatsApp — et son bouton « Copier ».
 *
 * Demandé par l'établissement : transmettre les identifiants AUTREMENT que par
 * email. Ce n'est pas un confort — l'email est le canal qui échoue (adresse
 * qu'un fournisseur écarte, boîte abandonnée, message jamais retrouvé), et un
 * compte dont les accès n'arrivent pas est un compte inutilisable.
 *
 * ⚠️ **Le mot de passe vient de l'ÉCRAN, jamais du serveur.** Sur les trois
 * chemins concernés c'est l'admin qui l'a saisi : il est déjà dans l'état du
 * formulaire, donc aucun secret ne circule en retour d'API et la règle « aucun
 * mot de passe dans une réponse HTTP » reste entière. C'est aussi pourquoi la
 * relance d'invitation demande désormais un mot de passe pour proposer la
 * copie : celui qu'elle génère, personne ne peut le relire.
 *
 * ⚠️ **Rien n'est persisté** : pas de `localStorage`, pas de cache de requête.
 * Le message vit dans cet état de composant et disparaît à la fermeture. Un
 * mot de passe retrouvé trois semaines plus tard dans le stockage d'un
 * navigateur partagé serait une fuite, pas une commodité.
 *
 * Le texte est affiché dans un champ sélectionnable EN PLUS du bouton : le
 * presse-papiers exige un contexte sécurisé et une permission, et il peut
 * refuser. Sans le texte sous les yeux, un refus laisserait l'admin sans
 * recours.
 */
export function CredentialsDialog({
  open, onOpenChange, name, email, password,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * ⚠️ Le nom **AFFICHÉ** — `displayName()`, jamais `first_name`. Les six
   * points d'appel passaient l'état civil, si bien que le message saluait
   * « Bonjour Anaïs » un parent que tout l'établissement appelle
   * « Papa Anaïs ». Le message est lu par le destinataire, pas par
   * l'administration : c'est l'écran du projet où le surnom compte le plus.
   */
  name: string
  email: string
  password: string
}) {
  const t = useTranslations('common.credentials')
  const locale = useLocale()
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const champ = useRef<HTMLTextAreaElement>(null)

  // Le lien doit porter le préfixe de langue du message : un destinataire
  // anglophone renvoyé sur `/auth/login` lirait un écran français.
  const link =
    typeof window === 'undefined'
      ? ''
      : `${window.location.origin}${localePath('/auth/login', locale)}`

  // La dernière ligne du message invite à activer les NOTIFICATIONS, et non
  // plus à changer son mot de passe : plus aucun changement n'est imposé au
  // premier login (cf. § Authentification), alors que le push exige un
  // abonnement par appareil que personne ne pense à accorder — c'est donc le
  // seul geste qui reste utile à demander dans ce message.
  const message = t('message', { name, platform: APP_NAME, link, email, password })

  // « Copié » retombe tout seul : un état figé laisse croire que le second
  // clic n'a rien fait.
  useEffect(() => {
    if (!copied) return
    const minuteur = setTimeout(() => setCopied(false), 2500)
    return () => clearTimeout(minuteur)
  }, [copied])

  useEffect(() => {
    if (!open) { setCopied(false); setFailed(false) }
  }, [open])

  // ⚠️ La hauteur s'ajuste au CONTENU. Un `rows` fixe est un pari sur le
  // nombre de lignes RENDUES, et ce nombre dépend du nom de la plateforme, de
  // la longueur du lien et du repli de chaque ligne — le pari était perdu :
  // mesuré à l'écran, 239 px de texte dans 200 px de boîte, donc la dernière
  // ligne (celle qui demande quelque chose au destinataire) était coupée. Un
  // texte affiché pour être relu et sélectionné à la main ne doit pas exiger
  // qu'on devine qu'il défile.
  //
  // ⚠️ L'ajustement se fait dans la **ref de rappel**, jamais dans un effet de
  // montage : `DialogContent` monte son contenu dans un SECOND commit (ouverture
  // animée), si bien que l'effet du parent passe quand `champ.current` est
  // encore nul — et ses dépendances ne rebougeant plus, il ne repasse jamais.
  // Première version écrite ainsi : vérifiée dans un vrai navigateur, l'attribut
  // `style` restait absent et la ligne restait coupée à l'identique.
  //
  // ⚠️ On mesure à l'OUVERTURE, et plus jamais ensuite. Un auditeur de
  // redimensionnement a été essayé puis retiré : à chaque fois, la mesure
  // tombait sur une disposition que le navigateur n'avait pas encore
  // recalculée pour la nouvelle largeur, et ramenait la boîte à sa hauteur de
  // repli (202 px pour 239 px de texte) — donc PIRE que de ne rien faire.
  // Différer d'une image n'y change rien. Une fenêtre redimensionnée pendant
  // que le dialogue est ouvert laisse donc simplement la boîte DÉFILER
  // (`overflow-y-auto`), ce qui est le comportement d'origine.
  const ajuste = (el: HTMLTextAreaElement | null) => {
    champ.current = el
    if (!el) return
    el.style.height = 'auto'
    // ⚠️ `scrollHeight` ignore la BORDURE, que `height` inclut en `border-box` :
    // poser `scrollHeight` tel quel laissait 237 px utiles pour 239 px de texte,
    // soit la dernière ligne rognée de deux pixels — mesuré à l'écran.
    const bordure = el.offsetHeight - el.clientHeight
    el.style.height = `${el.scrollHeight + bordure}px`
  }

  // Le repli des lignes dépend de la LARGEUR : une mesure prise en grand ne
  // vaut plus après une rotation de téléphone (mesuré : 239 px retenus pour
  // 258 px de texte, dernière ligne coupée de nouveau).
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setFailed(false)
      return
    } catch {
      // ⚠️ `navigator.clipboard` peut être REFUSÉ sans que rien ne soit cassé :
      // hors contexte sécurisé, dans une vue intégrée, ou sur une permission
      // déniée (constaté à l'écran, `clipboard-write: denied`). On sélectionne
      // alors le texte et on tente la commande historique, qui ne demande
      // aucune permission tant qu'on est dans un geste de l'utilisateur.
      champ.current?.select()
      try {
        if (document.execCommand('copy')) {
          setCopied(true)
          setFailed(false)
          return
        }
      } catch {
        // Rien à ajouter : le texte reste sélectionné et le message le dit.
      }
      setFailed(true)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <textarea
          ref={ajuste}
          readOnly
          value={message}
          rows={9}  /* plancher avant mesure — la hauteur réelle vient de `ajuste` */
          aria-label={t('title')}
          onFocus={(e) => e.currentTarget.select()}
          className="max-h-[40dvh] w-full resize-none overflow-y-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed"
        />

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
          {t('warning')}
        </p>

        {failed && <p className="text-xs text-destructive">{t('copyFailed')}</p>}

        <DialogFooter>
          <Button type="button" onClick={copier}>
            {copied
              ? <><Check className="mr-1.5 size-4" /> {t('copied')}</>
              : <><Copy className="mr-1.5 size-4" /> {t('copy')}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
