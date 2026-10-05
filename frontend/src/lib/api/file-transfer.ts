import type { AxiosRequestConfig } from 'axios'

/**
 * Configuration des requêtes qui transportent un FICHIER — dans les DEUX sens.
 *
 * ⚠️ **Pas de plafond de temps.** Le client global impose `timeout: 10_000`,
 * ce qui est juste pour un appel JSON — une API qui ne répond pas en dix
 * secondes est en panne — et faux pour un fichier, dont la durée dépend de sa
 * TAILLE et du DÉBIT, pas de la santé du serveur.
 *
 * Le défaut était invisible depuis un poste de bureau et systématique sur un
 * téléphone. Mesuré dans un vrai navigateur : une photo de 8 Mo sur un lien à
 * 3 Mbit/s est coupée à 10,0 s alors qu'elle arrive en 22,5 s sans plafond ;
 * six vignettes de 4 Mo sur un lien à 10 Mbit/s — la grille de la galerie — se
 * partagent la bande passante et échouent TOUTES les six. Côté écran, cela
 * donne l'icône « image indisponible », que les parents ont signalée.
 *
 * ⚠️ Cela vaut aussi pour les EXPORTS (présences, enfants) : le document est
 * fabriqué par le serveur avant d'être envoyé, et dix secondes ne suffisent pas
 * toujours pour une longue période.
 *
 * Zéro plutôt qu'une valeur généreuse : toute borne finie recrée exactement ce
 * défaut pour quelqu'un dont le lien est plus lent. Un vrai incident réseau
 * reste signalé par le navigateur (`onerror`), et l'utilisateur peut toujours
 * quitter la page.
 */
export const BLOB_REQUEST = {
  responseType: 'blob',
  timeout: 0,
} as const satisfies AxiosRequestConfig

/**
 * Envoi d'un fichier (multipart).
 *
 * ⚠️ Le plafond avait d'abord été levé pour les seuls TÉLÉCHARGEMENTS, alors
 * que le raisonnement vaut à l'identique dans l'autre sens — et que l'envoi est
 * le pire des deux cas : le débit montant d'un abonnement mobile est
 * couramment trois à dix fois plus faible que le descendant. Une photo de 4 Mo
 * qui descend en 6 secondes en met trente à remonter.
 *
 * Symptôme observé : « Impossible de joindre le serveur » — un dépassement de
 * délai ne produit aucune réponse, donc l'écran ne peut pas le distinguer d'une
 * panne réseau.
 */
export const UPLOAD_REQUEST = {
  timeout: 0,
} as const satisfies AxiosRequestConfig
