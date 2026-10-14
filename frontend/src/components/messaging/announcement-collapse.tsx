'use client'

import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

/**
 * Repli animé du contenu d'une diffusion.
 *
 * ⚠️ On anime `height: auto`, pas une hauteur en pixels : le contenu d'une
 * diffusion n'a aucune taille connue à l'avance (texte libre, grille de médias,
 * bloc de signature). Framer Motion mesure l'élément et interpole jusqu'à sa
 * hauteur réelle — une valeur figée aurait coupé le contenu des unes et laissé
 * du vide sous les autres.
 *
 * `overflow-hidden` pendant toute la transition : sans lui, le contenu déborde
 * de la carte le temps du repli, par-dessus la diffusion suivante.
 *
 * ⚠️ **Honore `prefers-reduced-motion`** : un déploiement de plusieurs centaines
 * de pixels est exactement le mouvement que ce réglage système vise. On ne le
 * supprime pas (l'élément doit toujours apparaître et disparaître), on le rend
 * instantané.
 *
 * `initial={false}` sur `AnimatePresence` : au premier rendu, une diffusion
 * déjà ouverte — non lue, ou en attente de signature côté parent — ne doit pas
 * se dérouler toute seule au chargement de la page. Elle est simplement là.
 */
export function AnnouncementCollapse({
  open,
  id,
  children,
}: {
  open: boolean
  id: string
  children: ReactNode
}) {
  const reduced = useReducedMotion()

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="body"
          id={id}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={
            reduced
              ? { duration: 0 }
              : {
                  height: { duration: 0.24, ease: [0.4, 0, 0.2, 1] },
                  // L'opacité va plus vite que la hauteur à l'ouverture et
                  // plus lentement à la fermeture : le texte ne doit pas
                  // s'afficher sur une carte encore à moitié dépliée.
                  opacity: { duration: 0.16 },
                }
          }
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
