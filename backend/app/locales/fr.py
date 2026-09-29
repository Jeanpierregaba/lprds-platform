"""
Catalogue français — langue de référence.

Convention de clés : `errors.<module>.<sujet>`, en minuscules. `errors.common.*`
regroupe ce qui est partagé par plusieurs modules — notamment l'isolation
multi-établissement, qui répond volontairement 404 partout plutôt que 403
(cf. claude.md).

Les paramètres entre accolades sont interpolés par `t()` : leur nom doit être
identique dans les deux langues, ce que vérifie `tests/e2e/test_i18n.py`.
"""

MESSAGES: dict[str, str] = {
    # ── common ────────────────────────────────────────────
    "errors.common.no_establishment": "Votre compte n'est rattaché à aucun établissement",
    "errors.common.insufficient_permissions": "Permissions insuffisantes",
    "errors.common.not_found": "Introuvable",
    "errors.common.unauthorized": "Non autorisé",
    "errors.common.empty_file": "Fichier vide",
    "errors.common.email_exists": "Un compte existe déjà avec cet email",
    "errors.common.child_not_found": "Enfant introuvable",
    "errors.common.staff_not_found": "Membre du personnel introuvable",
    "errors.common.establishment_not_found": "Établissement introuvable",
    "errors.common.department_not_found": "Département introuvable",
    "errors.common.parent_not_found": "Parent introuvable",
    "errors.common.date_future": "La date ne peut pas être dans le futur",
    "errors.common.child_inactive": "Cette fiche enfant est désactivée",
    "errors.common.email_unavailable_account": (
        "Compte non créé : le service d'email est indisponible. Vérifiez la configuration MAIL_* puis réessayez"
    ),
    "errors.common.email_unavailable_password": (
        "Mot de passe non modifié : le service d'email est indisponible. Vérifiez la configuration MAIL_* puis réessayez"
    ),
    "errors.common.matricule_failed": (
        "Impossible de générer un matricule unique après {attempts} tentatives"
    ),
    # ── auth ──────────────────────────────────────────────
    "errors.auth.invalid_credentials": "Email ou mot de passe incorrect",
    "errors.auth.account_disabled": "Compte désactivé. Contactez votre administrateur",
    "errors.auth.invalid_link": "Lien invalide ou expiré",
    "errors.auth.wrong_current_password": "Mot de passe actuel incorrect",
    "errors.auth.invalid_refresh": "Refresh token invalide ou expiré",
    "errors.auth.service_unavailable": "Service d'authentification temporairement indisponible",
    "errors.auth.invalid_token": "Token invalide ou expire",
    "errors.auth.wrong_token_type": "Type de token incorrect",
    "errors.auth.user_not_found": "Utilisateur introuvable",
    "errors.auth.user_not_found_or_inactive": "Utilisateur introuvable ou inactif",
    "errors.auth.cannot_create_role": "Vous n'êtes pas autorisé à créer un compte {role}",
    "errors.auth.rate_limited": "Trop de tentatives. Réessayez dans {seconds} secondes.",
    # ── attendance ────────────────────────────────────────
    "errors.attendance.no_department_schedule": "Aucun horaire configuré pour ce département",
    "errors.attendance.no_staff_schedule": (
        "Aucun horaire personnalisé configuré pour ce membre du personnel"
    ),
    "errors.attendance.no_settings": (
        "Aucun paramètre de présence configuré pour cet établissement"
    ),
    "errors.attendance.account_disabled": "Ce compte est désactivé",
    "errors.attendance.child_not_absent": "Cet enfant n'est pas absent pour cette date",
    "errors.attendance.invalid_qr": "Code QR invalide",
    "errors.attendance.bad_timezone": (
        "Fuseau horaire invalide configuré ({timezone}) — reconfigurez les paramètres de présence"
    ),
    "errors.attendance.arrival_after_departure": (
        "L'arrivée corrigée est après le dernier départ du jour"
    ),
    "errors.attendance.departure_before_arrival": (
        "Le départ corrigé est avant la première arrivée du jour"
    ),
    "errors.attendance.time_future": "L'heure corrigée ne peut pas être dans le futur",
    "errors.attendance.start_after_end": (
        "La date de début doit être antérieure à la date de fin"
    ),
    "errors.attendance.end_before_start": (
        "La date de fin doit être postérieure ou égale à la date de début"
    ),
    "errors.attendance.range_too_long": "La période d'export ne peut pas dépasser 366 jours",
    "errors.attendance.no_meal_for_children": "Pas de cantine pour les enfants",
    "errors.attendance.no_companion_for_staff": (
        "Un accompagnateur n'est pas applicable pour un membre du personnel"
    ),
    "errors.attendance.ids_exclusive": "child_id et staff_id sont exclusifs l'un de l'autre",
    "errors.attendance.child_id_required": "child_id requis pour une correction enfant",
    "errors.attendance.staff_id_required": "staff_id requis pour une correction personnel",
    "errors.attendance.duplicate_scan": "Événement déjà enregistré il y a moins d'une minute",
    "errors.attendance.event_not_found": "Événement introuvable",
    # ── blog ──────────────────────────────────────────────
    "errors.blog.article_not_found": "Actualité introuvable",
    "errors.blog.no_cover": "Aucune image à la une",
    "errors.blog.category_not_found": "Catégorie introuvable",
    "errors.blog.article_deleted": "Cette actualité a été supprimée (soft delete)",
    "errors.blog.already_published": "Cette actualité est déjà publiée",
    "errors.blog.file_too_large": "Fichier trop volumineux (max {max_mb} Mo)",
    "errors.blog.cover_must_be_image": "L'image à la une doit être une image (pas une vidéo)",
    "errors.blog.gallery_images_only": "La galerie n'accepte que des images : {content_type}",
    "errors.blog.no_svg": "Le format SVG n'est pas autorisé",
    "errors.blog.media_not_found": "Média introuvable",
    "errors.blog.photo_not_found": "Photo introuvable",
    "errors.blog.bad_file_type": (
        "Type de fichier non autorisé : {content_type}. Seules les images et vidéos sont acceptées."
    ),
    "errors.blog.category_exists": "Une catégorie porte déjà ce nom",
    "errors.blog.cover_required": "Une image à la une est requise avant publication",
    "errors.blog.tag_required": "Une étiquette est requise avant publication",
    "errors.blog.tag_exists": "Une étiquette porte déjà ce nom",
    "errors.blog.tag_not_found": "Étiquette introuvable",
    # ── children ──────────────────────────────────────────
    "errors.children.document_not_found": "Document introuvable",
    "errors.children.file_too_large_fixed": "Fichier trop volumineux (max 5 Mo)",
    "errors.children.file_too_large": "Fichier trop volumineux (max {max_mb} Mo)",
    "errors.children.admission_before_birth": (
        "La date d'admission ne peut pas précéder la date de naissance"
    ),
    "errors.children.birth_future": "La date de naissance ne peut pas être dans le futur",
    "errors.children.too_many_rows": "Trop de lignes (max {max_rows})",
    "errors.children.bad_file_type": (
        "Type de fichier non autorisé : {content_type}. Autorisés : {allowed}"
    ),
    "errors.children.bad_format": "format invalide — 'xlsx' ou 'csv'",
    # ── establishments ────────────────────────────────────
    "errors.establishments.admin_not_found": (
        "Administrateur introuvable pour cet établissement"
    ),
    "errors.establishments.max_admins": (
        "Cet établissement a déjà {max_admins} administrateurs (maximum atteint)"
    ),
    "errors.establishments.last_admin": (
        "Impossible de retirer le dernier administrateur. Ajoutez un autre administrateur au préalable"
    ),
    "errors.establishments.code_locked": (
        "Le code ne peut plus être modifié : des matricules enfants ont déjà été émis avec le code actuel"
    ),
    "errors.establishments.code_taken": "Le code établissement « {code} » est déjà utilisé",
    # ── gallery ───────────────────────────────────────────
    "errors.gallery.messaging_admin_only": (
        "La galerie de messagerie est réservée à l'administration"
    ),
    # ── library ───────────────────────────────────────────
    "errors.library.no_copy_available": "Aucun exemplaire disponible pour ce livre",
    "errors.library.already_deactivated": "Ce livre est déjà désactivé",
    "errors.library.book_deactivated": (
        "Ce livre est désactivé : impossible d'enregistrer un prêt"
    ),
    "errors.library.already_returned": "Ce prêt a déjà été retourné",
    "errors.library.unknown_sections": (
        "Certaines sections n'existent pas dans cet établissement"
    ),
    "errors.library.active_lendings": (
        "Impossible de désactiver un livre dont des prêts sont en cours"
    ),
    "errors.library.borrow_date_future": "La date de prêt ne peut pas être dans le futur",
    "errors.library.due_before_borrow": "La date de retour est antérieure à la date de prêt",
    "errors.library.book_not_found": "Livre introuvable",
    "errors.library.lending_not_found": "Prêt introuvable",
    # ── menus ─────────────────────────────────────────────
    "errors.menus.no_menu": "Aucun menu publié pour cette semaine et ce département",
    "errors.menus.wrong_department": "Ce menu ne concerne pas votre département",
    "errors.menus.past_week": (
        "Impossible de créer/modifier/supprimer le menu d'une semaine déjà passée"
    ),
    "errors.menus.history_restricted": (
        "Seuls l'admin et le staff restaurateur délégué peuvent consulter l'historique des menus"
    ),
    "errors.menus.already_exists": (
        "Un menu existe déjà pour cette semaine et ce département — utilisez PATCH pour le modifier"
    ),
    "errors.menus.not_monday": "week_start doit être un lundi",
    # ── messaging ─────────────────────────────────────────
    "errors.messaging.no_file": "Aucun fichier fourni",
    "errors.messaging.conversation_not_found": "Conversation introuvable",
    "errors.messaging.announcement_not_found": "Diffusion introuvable",
    "errors.messaging.edit_window_over": "Délai d'édition dépassé (15 minutes)",
    "errors.messaging.file_too_large": "Fichier trop volumineux (max {max_mb} Mo)",
    "errors.messaging.announcement_media_limit": (
        "Limite de {max_media} médias par diffusion atteinte ({existing} déjà joint(s))"
    ),
    "errors.messaging.message_media_limit": (
        "Limite de {max_media} médias par message atteinte ({existing} déjà joint(s))"
    ),
    "errors.messaging.message_not_found": "Message introuvable",
    "errors.messaging.message_deleted": "Message supprimé",
    "errors.messaging.attachment_not_found": "Pièce jointe introuvable",
    "errors.messaging.admin_or_parent_only": "Réservé à l'administration et aux parents",
    "errors.messaging.body_or_media": (
        "Un message doit contenir un texte de 5000 caractères maximum ou un média"
    ),
    "errors.messaging.keep_body_or_media": (
        "Un message doit garder au moins un média ou un texte"
    ),
    # ── notifications ─────────────────────────────────────
    "errors.notifications.subscription_not_found": "Abonnement introuvable",
    "errors.notifications.no_establishment": "Aucun établissement associé à ce compte",
    "errors.notifications.no_vapid_key": "Clé VAPID non configurée",
    "errors.notifications.no_vapid_keys": (
        "Clés VAPID non configurées — impossible d'envoyer de push"
    ),
    # ── organization ──────────────────────────────────────
    "errors.organization.child_not_in_group": "Cet enfant n'appartient pas à ce groupe",
    "errors.organization.educatrice_busy": (
        "Cette éducatrice est déjà responsable d'un groupe dans cette section. Une éducatrice ne peut mener qu'un groupe par section"
    ),
    "errors.organization.child_not_found": "Enfant introuvable dans cet établissement",
    "errors.organization.children_not_found": "Enfant(s) introuvable(s) : {ids}",
    "errors.organization.child_wrong_section": (
        "L'enfant doit appartenir à la même section que le groupe. Seuls les enfants de la section peuvent y être assignés"
    ),
    "errors.organization.section_exists": (
        "La section « {name} » existe déjà dans ce département"
    ),
    "errors.organization.department_exists": (
        "Le département « {name} » existe déjà dans cet établissement"
    ),
    "errors.organization.group_exists": "Le groupe « {name} » existe déjà dans cette section",
    "errors.organization.educator_type_required": (
        "Seul un membre du personnel de type « educateur » peut mener un groupe"
    ),
    "errors.organization.label_not_found": "{label} introuvable dans cet établissement",
    "errors.organization.educatrice_not_found": "Éducatrice introuvable dans cet établissement",
    # ── parents ───────────────────────────────────────────
    "errors.parents.children_not_found": (
        "Enfant(s) introuvable(s) dans cet établissement : {ids}"
    ),
    # ── rbac ──────────────────────────────────────────────
    "errors.rbac.permissions_missing": (
        "Catalogue de permissions incomplet en base : {missing}. Lancez 'alembic upgrade head'"
    ),
    "errors.rbac.staff_not_found": "Membre du staff introuvable dans cet établissement",
    "errors.rbac.role_not_found": "Rôle introuvable",
    "errors.rbac.role_exists": "Un rôle « {name} » existe déjà dans cet établissement",
    # ── reports ───────────────────────────────────────────
    "errors.reports.child_no_group": "Cet enfant n'est affecté à aucun groupe",
    "errors.reports.invalid_content": (
        "Contenu invalide pour un rapport {report_type} : {messages}"
    ),
    "errors.reports.file_too_large": "Fichier trop volumineux (max {max_mb} Mo)",
    "errors.reports.child_no_department": (
        "L'enfant doit être rattaché à un département pour recevoir des rapports"
    ),
    "errors.reports.reference_date_future": (
        "La date de référence ne peut pas être dans le futur"
    ),
    "errors.reports.type_not_enabled": (
        "Le type de rapport « {report_type} » n'est pas activé pour ce département"
    ),
    "errors.reports.pdf_annual_only": (
        "Le téléchargement PDF n'est disponible que pour le rapport annuel"
    ),
    "errors.reports.attachment_not_found": "Pièce jointe introuvable",
    "errors.reports.not_found": "Rapport introuvable",
    "errors.reports.only_draft_editable": (
        "Seul un rapport en brouillon ou rejeté peut être modifié"
    ),
    "errors.reports.only_draft_submittable": (
        "Seul un rapport en brouillon ou rejeté peut être soumis"
    ),
    "errors.reports.only_draft_deletable": (
        "Seul un rapport encore en brouillon (jamais soumis) peut être supprimé"
    ),
    "errors.reports.only_submitted_rejectable": "Seul un rapport soumis peut être rejeté",
    "errors.reports.only_submitted_validatable": "Seul un rapport soumis peut être validé",
    "errors.reports.bad_file_type": (
        "Type de fichier non autorisé : {content_type}. Seules les images et vidéos sont acceptées."
    ),
    "errors.reports.period_exists": "Un rapport {report_type} existe déjà pour cette période",
    "errors.reports.cannot_edit": "Vous n'êtes pas autorisé à modifier ce rapport",
    "errors.reports.own_group_only": (
        "Vous ne pouvez remplir des rapports que pour les enfants de votre groupe"
    ),
    "errors.common.unknown_type": "inconnu",
    "errors.messaging.bad_file_type": (
        "Type de fichier non autorisé : {content_type}. Autorisés : {allowed} ou toute image (hors SVG)."
    ),
    "errors.messaging.bad_file_type_video": (
        "Type de fichier non autorisé : {content_type}. Autorisés : {allowed} ou toute image (hors SVG) ou toute vidéo."
    ),
}
