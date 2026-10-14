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
    # ── médias téléversés (rapports, messagerie, blog) ───
    "errors.media.not_media": (
        "Ce fichier n'est ni une image ni une vidéo. Vérifiez qu'il n'est pas "
        "endommagé, puis réessayez"
    ),
    "errors.media.video_not_allowed": "Les vidéos ne sont pas acceptées ici",
    "errors.media.video_too_large": (
        "Cette vidéo dépasse {max_mb} Mo. Les images sont allégées "
        "automatiquement, pas les vidéos : raccourcissez-la ou réduisez sa "
        "définition avant de l'envoyer"
    ),
    "errors.media.pdf_too_large": "Ce PDF dépasse {max_mb} Mo",
    "errors.media.animated_too_large": (
        "Cette animation dépasse {max_mb} Mo. L'alléger lui ferait perdre son "
        "mouvement : envoyez-en une plus légère, ou une image fixe"
    ),
    "errors.media.heic_unsupported": (
        "Les photos au format HEIC ne peuvent pas être converties sur ce "
        "serveur. Enregistrez-la en JPEG depuis votre téléphone, puis réessayez"
    ),
    "errors.media.too_heavy_to_keep_readable": (
        "Ce document est trop lourd pour tenir sous {max_mb} Mo sans devenir "
        "illisible. Photographiez-le à nouveau, ou enregistrez-le en PDF"
    ),
    "errors.media.unreadable_image": (
        "Cette image n'a pas pu être lue — elle est probablement endommagée"
    ),
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
    "errors.auth.invitation_resend_too_soon": (
        "Une invitation vient d'être envoyée à ce compte. Réessayez dans {seconds} secondes."
    ),
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
    "errors.children.photo_not_found": "Cet enfant n'a pas de photo",
    "errors.children.photo_forbidden": (
        "Seuls l'administration, les parents de l'enfant et l'éducatrice de son groupe peuvent gérer sa photo"
    ),
    "errors.children.photo_must_be_image": "La photo de profil doit être une image",
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
    "errors.messaging.already_signed": "Vous avez déjà signé cette diffusion",
    "errors.messaging.signature_not_required": (
        "Cette diffusion ne demande pas de signature"
    ),
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
    "errors.notifications.no_subscription": (
        "Aucun abonnement push pour ce compte sur cet appareil"
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
    "organization.unit.departments": "Département",
    "organization.unit.sections": "Section",
    "organization.unit.groups": "Groupe",
    "organization.unit.other": "Élément",
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
        "Un rapport validé ne peut plus être modifié : le parent l'a déjà reçu"
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
    "errors.reports.dates_admin_only": (
        "Seul un administrateur peut modifier les dates d'un rapport"
    ),
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
    # ── emails ──────────────────────────────────────────
    "emails.welcome_admin.subject": "Bienvenue sur LPRDS — Accès administrateur",
    "emails.welcome_staff.subject": "Bienvenue sur LPRDS — Votre espace personnel",
    "emails.welcome_parent.subject": "Bienvenue sur LPRDS — Espace famille",
    "emails.reset_password.subject": "Réinitialisation de votre mot de passe LPRDS",
    "emails.parent_password_reset.subject": "Votre mot de passe LPRDS a été réinitialisé",
    "emails.report_available.subject": "Nouveau rapport disponible — {child}",
    "emails.announcement.subject": "Nouvelle diffusion — {title}",
    "emails.absence_inquiry.subject_one": "Absence de {child} — {date}",
    "emails.absence_inquiry.subject_many": "Absences du {date}",
    "emails.library_reminder.subject": "Retour de livres à la bibliothèque",
    "reports.types.quotidien": "quotidien",
    "reports.types.bi_mensuel": "bi-mensuel",
    "reports.types.annuel": "annuel",
    # ── push ────────────────────────────────────────────
    "push.announcement.title": "Nouvelle diffusion",
    "push.message_from_school.title": "Nouveau message de l'établissement",
    "push.message.title": "Nouveau message",
    "push.message.body": "Un nouveau message de {sender}",
    "push.report.title": "Rapport validé",
    "push.report.body": (
        "Un nouveau rapport « {period} » est disponible pour {child}."
    ),
    "push.new_attachment": "Nouvelle pièce jointe",
    "push.test.title": "Notification d'essai",
    "push.test.body": (
        "Si vous lisez ceci, les notifications fonctionnent sur cet appareil."
    ),
    # ── dates (libellés longs : emails, messages, documents) ──
    "date.long": "{weekday} {day} {month} {year}",
    "date.weekday.0": "lundi",
    "date.weekday.1": "mardi",
    "date.weekday.2": "mercredi",
    "date.weekday.3": "jeudi",
    "date.weekday.4": "vendredi",
    "date.weekday.5": "samedi",
    "date.weekday.6": "dimanche",
    "date.month.1": "janvier",
    "date.month.2": "février",
    "date.month.3": "mars",
    "date.month.4": "avril",
    "date.month.5": "mai",
    "date.month.6": "juin",
    "date.month.7": "juillet",
    "date.month.8": "août",
    "date.month.9": "septembre",
    "date.month.10": "octobre",
    "date.month.11": "novembre",
    "date.month.12": "décembre",
    # ── validation (ValueError Pydantic → 422) ──────────
    "validation.timezone_unknown": (
        "Fuseau horaire inconnu : « {value} ». Utilisez un nom IANA, "
        "ex. « Africa/Porto-Novo »"
    ),
    "validation.departure_before_arrival": (
        "L'heure de départ doit être après l'heure d'arrivée"
    ),
    "validation.password_requirements": "Le mot de passe doit contenir : {missing}",
    "validation.password_uppercase": "une majuscule",
    "validation.password_digit": "un chiffre",
    "validation.birth_date_future": "La date de naissance ne peut pas être dans le futur",
    "validation.admission_before_birth": (
        "La date d'admission ne peut pas précéder la date de naissance"
    ),
    "validation.nap_duration_required": "La durée de la sieste est requise si sieste = oui",
    "validation.nap_duration_forbidden": (
        "Pas de durée de sieste à renseigner si sieste = non"
    ),
    "validation.activity_required": "Au moins une activité est requise",
    "validation.establishment_code": (
        "Le code doit contenir 2 à 10 caractères alphanumériques "
        "(lettres ou chiffres), sans espace ni accent"
    ),
    # ── messages injectés en conversation ───────────────
    "conversations.absence_inquiry": (
        "Bonjour, {children} a été noté absent le {date} (aucune arrivée "
        "enregistrée). Pouvez-vous nous indiquer le motif de cette absence ? "
        "Merci."
    ),
    "conversations.library_reminder.intro": (
        "Rappel de la bibliothèque : des livres empruntés doivent être rendus."
    ),
    "conversations.library_reminder.line": (
        "• {book} — {child} — retour prévu le {due_date}{overdue}"
    ),
    "conversations.library_reminder.overdue_one": " (retard : {days} jour)",
    "conversations.library_reminder.overdue_many": " (retard : {days} jours)",
    # ── import de fiches enfants (rapport ligne par ligne) ──
    "import.file.unsupported_format": (
        "format non pris en charge — .xlsx ou .csv uniquement"
    ),
    "import.file.xlsx_unreadable": "fichier Excel illisible ({reason})",
    "import.file.no_headers": "feuille vide ou sans en-têtes",
    "import.file.csv_no_headers": "CSV vide ou sans en-têtes",
    "import.file.no_rows": "aucune ligne de données",
    "import.file.bad_encoding": "encodage illisible (ni UTF-8 ni Windows-1252)",
    "import.row.empty": "ligne entièrement vide",
    "import.row.phone_missing": "téléphone manquant",
    "import.row.phone_unusable": "téléphone inexploitable ({phone}…)",
    "import.row.phone_secondary_ignored": (
        "numéro secondaire ignoré (téléphone > 20 car.)"
    ),
    "import.row.email_invalid": "email invalide ignoré ({email})",
    "import.row.guardian_incomplete": "tuteur_{slot} incomplet (nom + prénoms requis)",
    "import.row.guardian_phone_missing": "tuteur_{slot} : téléphone manquant",
    "import.row.guardian_warning": "tuteur_{slot} : {warning}",
    "import.row.guardian_duplicate_ignored": (
        "tuteur_{slot} en double ignoré ({name})"
    ),
    "import.row.guardian_duplicate_merged": (
        "tuteur_{slot} en double fusionné ({name} : {phones})"
    ),
    "import.row.authorized_incomplete": (
        "autorise_{slot} incomplet (nom + prénoms requis)"
    ),
    "import.row.authorized_phone_missing": "autorise_{slot} : téléphone manquant",
    "import.row.address_missing": "adresse manquante → mention par défaut",
    "import.row.address_fallback": "Adresse non renseignée",
    "import.row.section_unknown": "section inconnue ({section}) → sans section",
    "import.row.usual_name_note": "Nom usuel : {name}.",
    "import.row.status_unknown": "statut inconnu ({value}) — 'actif' ou 'inactif'",
    "import.row.date_invalid": "{field} invalide ({value}) — AAAA-MM-JJ ou JJ/MM/AAAA",
    # ── vocabulaire des rapports (formulaires + PDF) ────
    "reports.vocabulary.health_status.bien": "Bien",
    "reports.vocabulary.health_status.a_surveiller": "À surveiller",
    "reports.vocabulary.health_status.malade": "Malade",
    "reports.vocabulary.meal_amount.bien_mange": "Bien mangé",
    "reports.vocabulary.meal_amount.peu_mange": "Peu mangé",
    "reports.vocabulary.meal_amount.rien_mange": "Rien mangé",
    "reports.vocabulary.mood.joyeux": "😊 Joyeux",
    "reports.vocabulary.mood.calme": "😌 Calme",
    "reports.vocabulary.mood.agite": "😤 Agité",
    "reports.vocabulary.mood.triste": "😢 Triste",
    "reports.vocabulary.mood.fatigue": "😴 Fatigué",
    "reports.vocabulary.mood.grincheux": "😠 Grincheux",
    "reports.vocabulary.behavior_tag.pleasant_day": "A passé une agréable journée à la crèche.",
    "reports.vocabulary.behavior_tag.enthusiastic_participation": "A participé avec enthousiasme aux activités.",
    "reports.vocabulary.behavior_tag.interested_participation": "A participé avec intérêt aux activités.",
    "reports.vocabulary.behavior_tag.observed_before_participating": "A préféré observer avant de participer.",
    "reports.vocabulary.behavior_tag.attentive_focused": "S'est montré(e) attentif(ve) et concentré(e).",
    "reports.vocabulary.behavior_tag.distracted_moments": "A eu quelques moments de distraction.",
    "reports.vocabulary.behavior_tag.curious_interested": "A fait preuve de curiosité et d'intérêt.",
    "reports.vocabulary.behavior_tag.assimilated_learning": "A bien assimilé les apprentissages de la journée.",
    "reports.vocabulary.behavior_tag.careful_application": "A réalisé les activités avec soin et application.",
    "reports.vocabulary.behavior_tag.autonomous": "S'est montré(e) autonome dans les activités.",
    "reports.vocabulary.behavior_tag.needed_support": "A eu besoin d'être accompagné(e) dans certaines activités.",
    "reports.vocabulary.behavior_tag.good_interaction": "A bien interagi avec les autres enfants.",
    "reports.vocabulary.behavior_tag.followed_instructions": "A respecté les consignes.",
    "reports.vocabulary.behavior_tag.needed_comfort": "A eu besoin d'être consolé(e).",
    "reports.vocabulary.behavior_tag.perseverance": "A fait preuve de persévérance face aux difficultés.",
    "reports.vocabulary.class_behavior.calm": "😌 Calme",
    "reports.vocabulary.class_behavior.joyful": "😊 Joyeux(se)",
    "reports.vocabulary.class_behavior.smiling": "😄 Souriant(e)",
    "reports.vocabulary.class_behavior.participative": "🙋 Participatif(ve)",
    "reports.vocabulary.class_behavior.reserved": "🤐 Réservé(e)",
    "reports.vocabulary.class_behavior.dynamic": "⚡ Dynamique",
    "reports.vocabulary.class_behavior.agitated": "😅 Agité(e)",
    "reports.vocabulary.class_behavior.tired": "😴 Fatigué(e)",
    "reports.vocabulary.class_behavior.emotional": "😢 Émotif(ve)",
    "reports.vocabulary.peer_relation.kind_to_peers": "Gentil(le) avec les camarades",
    "reports.vocabulary.peer_relation.sociable": "Sociable",
    "reports.vocabulary.peer_relation.cooperative": "Coopératif(ve)",
    "reports.vocabulary.peer_relation.struggles_sharing": "A parfois du mal à partager",
    "reports.vocabulary.peer_relation.prefers_alone": "Préfère jouer seul(e)",
    "reports.vocabulary.emotion_management.cried_little": "A peu pleuré",
    "reports.vocabulary.emotion_management.cried_a_lot": "A beaucoup pleuré",
    "reports.vocabulary.emotion_management.needed_reassurance": "A eu besoin d'être rassuré(e)",
    "reports.vocabulary.emotion_management.expresses_better": "S'exprime mieux émotionnellement",
    "reports.vocabulary.emotion_management.improving_emotion_management": "En progrès dans la gestion des émotions",
    "reports.vocabulary.emotion_management.autonomous": "Autonome",
    "reports.vocabulary.acquisition_level.acquis": "Acquis",
    "reports.vocabulary.acquisition_level.en_cours_acquisition": "En cours d'acquisition",
    "reports.vocabulary.acquisition_level.a_consolider": "À consolider",
    # ── bulletin annuel (PDF) ───────────────────────────
    "reports.domains.oral_written_language": (
        "Développement et structuration du langage oral et écrit"
    ),
    "reports.domains.physical_activities": (
        "Agir, s'exprimer, comprendre à travers les activités physiques"
    ),
    "reports.domains.artistic_activities": (
        "Agir, s'exprimer, comprendre à travers les activités artistiques"
    ),
    "reports.domains.math_foundations": (
        "L'acquisition des premiers outils mathématiques"
    ),
    "reports.domains.world_exploration": "Explorer le monde",
    "reports.domains.english": "Anglais",
    "reports.pdf.title": "Bulletin annuel",
    "reports.pdf.column.domain": "Domaine",
    "reports.pdf.column.rating": "Notation",
    "reports.pdf.column.observation": "Observation de l'éducatrice",
    "reports.pdf.filename": "bulletin-annuel-{year}-{name}.pdf",
    # ── export des présences (PDF + Excel) ──────────────
    "attendance.status.present": "Présent",
    "attendance.status.late": "Retard",
    "attendance.status.absent": "Absent",
    "attendance.status.not_expected": "Non attendu",
    "attendance.status.exempt": "Exempté",
    "attendance.person.child": "Enfant",
    "attendance.person.staff": "Personnel",
    "attendance.export.title": "Export des présences",
    "attendance.export.sheet": "Présences",
    "attendance.export.period": "Période du {date_from} au {date_to}",
    "attendance.export.row_count": "{count} ligne(s)",
    "attendance.export.column.type": "Type",
    "attendance.export.column.name": "Nom",
    "attendance.export.column.matricule": "Matricule",
    "attendance.export.column.date": "Date",
    "attendance.export.column.status": "Statut",
    "attendance.export.column.arrival": "Arrivée",
    "attendance.export.column.departure": "Départ",
    "attendance.export.column.late": "Retard (min)",
    "attendance.export.column.meal": "Cantine",
    "attendance.export.yes": "Oui",
    "attendance.export.no": "Non",
    "attendance.export.filename.children": "enfants",
    "attendance.export.filename.staff": "personnel",
    "attendance.export.filename.both": "presences",
    # ── libellé de période d'un rapport (calculé à la lecture) ──
    "reports.period.quotidien": "{day} {month} {year}",
    "reports.period.bi_mensuel": "{first}–{last} {month} {year}",
    "reports.period.annuel": "Année {year}",
    # ── export / modèle des fiches enfants ──────────────
    "children.export.sheet": "Enfants",
    "children.export.filename": "enfants_{date}.xlsx",
    "children.export.filename_csv": "enfants_{date}.csv",
    "children.template.filename": "modele_enfants.xlsx",
    "children.template.filename_csv": "modele_enfants.csv",
    "children.template.help_sheet": "Aide",
    "children.template.help.column": "Colonne",
    "children.template.help.rule": "Règle",
    "children.template.help.matricule": (
        "Vide = création. Renseignez le matricule (export) pour mettre à jour."
    ),
    "children.template.help.names": "Obligatoires.",
    "children.template.help.usual_name": (
        "Optionnel — repris dans les notes si différent des prénoms."
    ),
    "children.template.help.dates": (
        "AAAA-MM-JJ (ou JJ/MM/AAAA). Admission ≥ naissance."
    ),
    "children.template.help.address": (
        "Obligatoire (mention par défaut si vide, signalée)."
    ),
    "children.template.help.status": "actif / inactif (vide = actif).",
    "children.template.help.section": (
        "Nom exact de la section. Inconnu = sans section + avertissement."
    ),
    "children.template.help.guardians": (
        "Au moins UN tuteur complet (nom, prénoms, tél) par enfant."
    ),
    "children.template.help.authorized": (
        "Personnes autorisées à récupérer l'enfant."
    ),
}
