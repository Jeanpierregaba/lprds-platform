"""
Catalogue anglais — même jeu de clés que `fr.py`.

Toute clé du français doit exister ici (vérifié par `tests/e2e/test_i18n.py`).
Une clé absente ne casse rien à l'exécution — le repli sur le français
s'applique — mais produit une phrase française isolée dans une interface
anglaise, ce qui est précisément ce que ce chantier cherche à éliminer.
"""

MESSAGES: dict[str, str] = {
    # ── Erreurs transverses ────────────────────────────────────────
    "errors.common.not_found": "Not found",
    "errors.common.forbidden": "Access denied",
    "errors.common.insufficient_permissions": "Insufficient permissions",
    "errors.common.invalid_data": "Invalid data",
    "errors.common.conflict": "This action is not possible in the current state",
    "errors.common.service_unavailable": "Service temporarily unavailable",
    # ── Authentification ──────────────────────────────────────────
    "errors.auth.invalid_credentials": "Incorrect email or password",
    "errors.auth.inactive_account": "This account has been deactivated",
    "errors.auth.password_change_required": "You must change your password first",
    "errors.auth.email_already_used": "This email address is already in use",
    "errors.auth.invalid_locale": "Unsupported language",
    "errors.auth.rate_limited": (
        "Too many sign-in attempts. Please try again in {seconds} seconds."
    ),
    "errors.auth.email_delivery_failed": (
        "The email could not be sent, so the account was not created. Please try again."
    ),
}
