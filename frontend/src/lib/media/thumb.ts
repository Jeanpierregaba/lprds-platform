/**
 * Variante « vignette » d'une URL de média.
 *
 * ⚠️ À utiliser partout où le média est affiché en PETIT : grille, liste,
 * miniature. Sans elle, une case de cent pixels télécharge l'ORIGINAL — une
 * photo de téléphone n'est recompressée au téléversement qu'au-dessus du
 * plafond du module (50 Mo pour les rapports), donc elle est servie telle
 * quelle. La galerie parent affiche 30 médias par page : à 4 Mo pièce, c'était
 * 120 Mo du forfait du parent pour une page de miniatures.
 *
 * Le serveur fabrique la vignette à la demande et la garde (cf.
 * `app/core/thumbnails.py`). Si elle est impossible — vidéo, PDF, image
 * illisible — il sert l'original : l'appelant n'a jamais à le savoir.
 */
export function thumbUrl(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}thumb=true`
}
