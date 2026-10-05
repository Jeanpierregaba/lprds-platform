/**
 * Téléverser PLUSIEURS fichiers, l'un après l'autre.
 *
 * ⚠️ Les pages de CRÉATION du projet acceptaient déjà une sélection multiple ;
 * les pages de DÉTAIL, qui modifient pourtant le même objet, n'en acceptaient
 * qu'un. Une éducatrice ajoutant les photos d'une journée à un rapport déjà
 * enregistré rouvrait donc le sélecteur une fois par photo — et c'est le cas le
 * plus fréquent, puisque les photos arrivent après la rédaction (c'est la
 * raison même pour laquelle le `submitted` a été ouvert au staff).
 *
 * ⚠️ SÉQUENTIEL, jamais en parallèle. Les envois simultanés se partagent le
 * débit MONTANT, déjà trois à dix fois plus faible que le descendant sur un
 * abonnement mobile : les lancer ensemble ne va pas plus vite, retarde le
 * premier résultat et multiplie les délais d'attente. C'est le raisonnement
 * inverse d'une grille de vignettes, où le parallélisme sert l'affichage.
 *
 * ⚠️ Un échec n'arrête PAS les suivants : sur dix photos, la neuvième qui passe
 * mal ne doit pas faire perdre la dixième. Le bilan revient à l'appelant, qui
 * le DIT — un envoi partiel annoncé comme un succès serait pire que l'échec,
 * puisque personne ne saurait quoi reprendre.
 */
export async function uploadEachInTurn(
  files: File[],
  upload: (file: File) => Promise<unknown>,
): Promise<{ sent: number; failed: number; firstError: unknown }> {
  let sent = 0
  let failed = 0
  let firstError: unknown = null

  for (const file of files) {
    try {
      await upload(file)
      sent += 1
    } catch (err) {
      failed += 1
      if (firstError === null) firstError = err
    }
  }

  return { sent, failed, firstError }
}
