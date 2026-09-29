"""
Catalogue anglais — même jeu de clés que `fr.py`.

Toute clé du français doit exister ici (vérifié par `tests/e2e/test_i18n.py`).
Une clé absente ne casse rien à l'exécution — le repli sur le français
s'applique — mais produit une phrase française isolée dans une interface
anglaise, ce qui est précisément ce que ce chantier cherche à éliminer.
"""

MESSAGES: dict[str, str] = {
    # ── common ────────────────────────────────────────────
    "errors.common.no_establishment": "Your account is not linked to any establishment",
    "errors.common.insufficient_permissions": "Insufficient permissions",
    "errors.common.not_found": "Not found",
    "errors.common.unauthorized": "Not authorised",
    "errors.common.empty_file": "Empty file",
    "errors.common.email_exists": "An account already exists with this email",
    "errors.common.child_not_found": "Child not found",
    "errors.common.staff_not_found": "Staff member not found",
    "errors.common.establishment_not_found": "Establishment not found",
    "errors.common.department_not_found": "Department not found",
    "errors.common.parent_not_found": "Parent not found",
    "errors.common.date_future": "The date cannot be in the future",
    "errors.common.child_inactive": "This child's record is deactivated",
    "errors.common.email_unavailable_account": (
        "Account not created: the email service is unavailable. Check the MAIL_* configuration and try again"
    ),
    "errors.common.email_unavailable_password": (
        "Password unchanged: the email service is unavailable. Check the MAIL_* configuration and try again"
    ),
    "errors.common.matricule_failed": (
        "Could not generate a unique ID after {attempts} attempts"
    ),
    # ── auth ──────────────────────────────────────────────
    "errors.auth.invalid_credentials": "Incorrect email or password",
    "errors.auth.account_disabled": "Account deactivated. Contact your administrator",
    "errors.auth.invalid_link": "Invalid or expired link",
    "errors.auth.wrong_current_password": "Current password is incorrect",
    "errors.auth.invalid_refresh": "Invalid or expired refresh token",
    "errors.auth.service_unavailable": "Authentication service temporarily unavailable",
    "errors.auth.invalid_token": "Invalid or expired token",
    "errors.auth.wrong_token_type": "Wrong token type",
    "errors.auth.user_not_found": "User not found",
    "errors.auth.user_not_found_or_inactive": "User not found or inactive",
    "errors.auth.cannot_create_role": "You are not allowed to create a {role} account",
    "errors.auth.rate_limited": "Too many attempts. Try again in {seconds} seconds.",
    # ── attendance ────────────────────────────────────────
    "errors.attendance.no_department_schedule": "No schedule configured for this department",
    "errors.attendance.no_staff_schedule": (
        "No custom schedule configured for this staff member"
    ),
    "errors.attendance.no_settings": "No attendance settings configured for this establishment",
    "errors.attendance.account_disabled": "This account is deactivated",
    "errors.attendance.child_not_absent": "This child is not absent on this date",
    "errors.attendance.invalid_qr": "Invalid QR code",
    "errors.attendance.bad_timezone": (
        "Invalid time zone configured ({timezone}) — reconfigure the attendance settings"
    ),
    "errors.attendance.arrival_after_departure": (
        "The corrected arrival is after the last departure of the day"
    ),
    "errors.attendance.departure_before_arrival": (
        "The corrected departure is before the first arrival of the day"
    ),
    "errors.attendance.time_future": "The corrected time cannot be in the future",
    "errors.attendance.start_after_end": "The start date must be before the end date",
    "errors.attendance.end_before_start": "The end date must be on or after the start date",
    "errors.attendance.range_too_long": "The export period cannot exceed 366 days",
    "errors.attendance.no_meal_for_children": "No canteen entry for children",
    "errors.attendance.no_companion_for_staff": "A companion does not apply to a staff member",
    "errors.attendance.ids_exclusive": "child_id and staff_id are mutually exclusive",
    "errors.attendance.child_id_required": "child_id is required to correct a child's record",
    "errors.attendance.staff_id_required": "staff_id is required to correct a staff record",
    "errors.attendance.duplicate_scan": (
        "This event was already recorded less than a minute ago"
    ),
    "errors.attendance.event_not_found": "Event not found",
    # ── blog ──────────────────────────────────────────────
    "errors.blog.article_not_found": "Article not found",
    "errors.blog.no_cover": "No cover image",
    "errors.blog.category_not_found": "Category not found",
    "errors.blog.article_deleted": "This article has been deleted",
    "errors.blog.already_published": "This article is already published",
    "errors.blog.file_too_large": "File too large (max {max_mb} MB)",
    "errors.blog.cover_must_be_image": "The cover must be an image, not a video",
    "errors.blog.gallery_images_only": "The gallery accepts images only: {content_type}",
    "errors.blog.no_svg": "SVG files are not allowed",
    "errors.blog.media_not_found": "Media not found",
    "errors.blog.photo_not_found": "Photo not found",
    "errors.blog.bad_file_type": (
        "File type not allowed: {content_type}. Only images and videos are accepted."
    ),
    "errors.blog.category_exists": "A category already has this name",
    "errors.blog.cover_required": "A cover image is required before publishing",
    "errors.blog.tag_required": "A tag is required before publishing",
    "errors.blog.tag_exists": "A tag already has this name",
    "errors.blog.tag_not_found": "Tag not found",
    # ── children ──────────────────────────────────────────
    "errors.children.document_not_found": "Document not found",
    "errors.children.file_too_large_fixed": "File too large (max 5 MB)",
    "errors.children.file_too_large": "File too large (max {max_mb} MB)",
    "errors.children.admission_before_birth": (
        "The admission date cannot precede the date of birth"
    ),
    "errors.children.birth_future": "The date of birth cannot be in the future",
    "errors.children.too_many_rows": "Too many rows (max {max_rows})",
    "errors.children.bad_file_type": (
        "File type not allowed: {content_type}. Allowed: {allowed}"
    ),
    "errors.children.bad_format": "invalid format — 'xlsx' or 'csv'",
    # ── establishments ────────────────────────────────────
    "errors.establishments.admin_not_found": "Administrator not found for this establishment",
    "errors.establishments.max_admins": (
        "This establishment already has {max_admins} administrators (maximum reached)"
    ),
    "errors.establishments.last_admin": (
        "The last administrator cannot be removed. Add another administrator first"
    ),
    "errors.establishments.code_locked": (
        "The code can no longer be changed: children's IDs have already been issued with the current code"
    ),
    "errors.establishments.code_taken": "The establishment code “{code}” is already in use",
    # ── gallery ───────────────────────────────────────────
    "errors.gallery.messaging_admin_only": "The message gallery is reserved for administrators",
    # ── library ───────────────────────────────────────────
    "errors.library.no_copy_available": "No copies of this book are available",
    "errors.library.already_deactivated": "This book is already deactivated",
    "errors.library.book_deactivated": "This book is deactivated: a loan cannot be recorded",
    "errors.library.already_returned": "This loan has already been returned",
    "errors.library.unknown_sections": "Some groups do not exist in this establishment",
    "errors.library.active_lendings": "A book with active loans cannot be deactivated",
    "errors.library.borrow_date_future": "The loan date cannot be in the future",
    "errors.library.due_before_borrow": "The due date is before the loan date",
    "errors.library.book_not_found": "Book not found",
    "errors.library.lending_not_found": "Loan not found",
    # ── menus ─────────────────────────────────────────────
    "errors.menus.no_menu": "No menu published for this week and department",
    "errors.menus.wrong_department": "This menu does not concern your department",
    "errors.menus.past_week": (
        "A menu for a week that has already passed cannot be created, changed or deleted"
    ),
    "errors.menus.history_restricted": (
        "Only the administrator and delegated catering staff may view the menu history"
    ),
    "errors.menus.already_exists": (
        "A menu already exists for this week and department — use PATCH to change it"
    ),
    "errors.menus.not_monday": "week_start must be a Monday",
    # ── messaging ─────────────────────────────────────────
    "errors.messaging.no_file": "No file provided",
    "errors.messaging.conversation_not_found": "Conversation not found",
    "errors.messaging.announcement_not_found": "Announcement not found",
    "errors.messaging.edit_window_over": "The editing window has passed (15 minutes)",
    "errors.messaging.file_too_large": "File too large (max {max_mb} MB)",
    "errors.messaging.announcement_media_limit": (
        "Limit of {max_media} media per announcement reached ({existing} already attached)"
    ),
    "errors.messaging.message_media_limit": (
        "Limit of {max_media} media per message reached ({existing} already attached)"
    ),
    "errors.messaging.message_not_found": "Message not found",
    "errors.messaging.message_deleted": "Message deleted",
    "errors.messaging.attachment_not_found": "Attachment not found",
    "errors.messaging.admin_or_parent_only": "Reserved for administrators and parents",
    "errors.messaging.body_or_media": (
        "A message must contain text of at most 5000 characters, or media"
    ),
    "errors.messaging.keep_body_or_media": (
        "A message must keep at least one media item or some text"
    ),
    # ── notifications ─────────────────────────────────────
    "errors.notifications.subscription_not_found": "Subscription not found",
    "errors.notifications.no_establishment": "No establishment linked to this account",
    "errors.notifications.no_vapid_key": "VAPID key not configured",
    "errors.notifications.no_vapid_keys": "VAPID keys not configured — push cannot be sent",
    # ── organization ──────────────────────────────────────
    "errors.organization.child_not_in_group": "This child does not belong to this class",
    "errors.organization.educatrice_busy": (
        "This educator already leads a class in this group. An educator can lead only one class per group"
    ),
    "errors.organization.child_not_found": "Child not found in this establishment",
    "errors.organization.children_not_found": "Child(ren) not found: {ids}",
    "errors.organization.child_wrong_section": (
        "The child must belong to the same group as the class. Only children from that group can be assigned to it"
    ),
    "errors.organization.section_exists": (
        "The group “{name}” already exists in this department"
    ),
    "errors.organization.department_exists": (
        "The department “{name}” already exists in this establishment"
    ),
    "errors.organization.group_exists": "The class “{name}” already exists in this group",
    "errors.organization.educator_type_required": (
        "Only a staff member of type “educateur” can lead a class"
    ),
    "errors.organization.label_not_found": "{label} not found in this establishment",
    "errors.organization.educatrice_not_found": "Educator not found in this establishment",
    # ── parents ───────────────────────────────────────────
    "errors.parents.children_not_found": "Child(ren) not found in this establishment: {ids}",
    # ── rbac ──────────────────────────────────────────────
    "errors.rbac.permissions_missing": (
        "The permission catalogue is incomplete in the database: {missing}. Run 'alembic upgrade head'"
    ),
    "errors.rbac.staff_not_found": "Staff member not found in this establishment",
    "errors.rbac.role_not_found": "Role not found",
    "errors.rbac.role_exists": "A role “{name}” already exists in this establishment",
    # ── reports ───────────────────────────────────────────
    "errors.reports.child_no_group": "This child is not assigned to any class",
    "errors.reports.invalid_content": "Invalid content for a {report_type} report: {messages}",
    "errors.reports.file_too_large": "File too large (max {max_mb} MB)",
    "errors.reports.child_no_department": (
        "The child must be linked to a department to receive reports"
    ),
    "errors.reports.reference_date_future": "The reference date cannot be in the future",
    "errors.reports.type_not_enabled": (
        "The report type “{report_type}” is not enabled for this department"
    ),
    "errors.reports.pdf_annual_only": "PDF download is available for the annual report only",
    "errors.reports.attachment_not_found": "Attachment not found",
    "errors.reports.not_found": "Report not found",
    "errors.reports.only_draft_editable": "Only a draft or rejected report can be changed",
    "errors.reports.only_draft_submittable": "Only a draft or rejected report can be submitted",
    "errors.reports.only_draft_deletable": (
        "Only a report still in draft (never submitted) can be deleted"
    ),
    "errors.reports.only_submitted_rejectable": "Only a submitted report can be rejected",
    "errors.reports.only_submitted_validatable": "Only a submitted report can be approved",
    "errors.reports.bad_file_type": (
        "File type not allowed: {content_type}. Only images and videos are accepted."
    ),
    "errors.reports.period_exists": "A {report_type} report already exists for this period",
    "errors.reports.cannot_edit": "You are not allowed to change this report",
    "errors.reports.own_group_only": (
        "You can only fill in reports for children in your own class"
    ),
    "errors.common.unknown_type": "unknown",
    "errors.messaging.bad_file_type": (
        "File type not allowed: {content_type}. Allowed: {allowed}, or any image (except SVG)."
    ),
    "errors.messaging.bad_file_type_video": (
        "File type not allowed: {content_type}. Allowed: {allowed}, or any image (except SVG) or any video."
    ),
}
