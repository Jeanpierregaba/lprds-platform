"""
Catalogue français — langue de référence.

Convention de clés : `<domaine>.<sujet>_<précision>`, en minuscules.
Les domaines suivent les modules (`errors.children.*`, `emails.welcome_parent.*`,
`exports.attendance.*`), sauf `errors.common.*` qui regroupe les messages
partagés par plusieurs modules — notamment l'isolation multi-établissement, qui
répond volontairement 404 partout plutôt que 403 (cf. claude.md).

⚠️ Ce catalogue est amorcé avec les messages transverses. La reprise des 186
`HTTPException.detail` module par module se fait en phase 4 de l'i18n.
"""

MESSAGES: dict[str, str] = {
    # ── Erreurs transverses ────────────────────────────────────────
    "errors.common.not_found": "Ressource introuvable",
    "errors.common.forbidden": "Accès non autorisé",
    "errors.common.insufficient_permissions": "Permissions insuffisantes",
    "errors.common.invalid_data": "Données invalides",
    "errors.common.conflict": "Opération impossible dans l'état actuel",
    "errors.common.service_unavailable": "Service momentanément indisponible",
    # ── Authentification ──────────────────────────────────────────
    "errors.auth.invalid_credentials": "Email ou mot de passe incorrect",
    "errors.auth.inactive_account": "Ce compte est désactivé",
    "errors.auth.password_change_required": "Vous devez d'abord changer votre mot de passe",
    "errors.auth.email_already_used": "Cette adresse email est déjà utilisée",
    "errors.auth.invalid_locale": "Langue non prise en charge",
    "errors.auth.rate_limited": (
        "Trop de tentatives de connexion. Réessayez dans {seconds} secondes."
    ),
    "errors.auth.email_delivery_failed": (
        "L'email n'a pas pu être envoyé, le compte n'a pas été créé. Réessayez."
    ),
}
