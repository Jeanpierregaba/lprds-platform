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
    # ── uploaded media (reports, messaging, blog) ────────
    "errors.media.not_media": (
        "This file is neither an image nor a video. Check that it is not "
        "damaged, then try again"
    ),
    "errors.media.video_not_allowed": "Videos are not accepted here",
    "errors.media.video_too_large": (
        "This video is over {max_mb} MB. Images are compressed automatically, "
        "videos are not: shorten it or lower its resolution before sending it"
    ),
    "errors.media.pdf_too_large": "This PDF is over {max_mb} MB",
    "errors.media.animated_too_large": (
        "This animation is over {max_mb} MB. Compressing it would lose the "
        "movement: send a lighter one, or a still image"
    ),
    "errors.media.heic_unsupported": (
        "HEIC photos cannot be converted on this server. Save it as JPEG from "
        "your phone, then try again"
    ),
    "errors.media.too_heavy_to_keep_readable": (
        "This document is too large to fit under {max_mb} MB without becoming "
        "unreadable. Photograph it again, or save it as a PDF"
    ),
    "errors.media.unreadable_image": (
        "This image could not be read — it is probably damaged"
    ),
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
    "errors.auth.invitation_resend_too_soon": (
        "An invitation was just sent to this account. Try again in {seconds} seconds."
    ),
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
    "errors.children.photo_not_found": "This child has no photo",
    "errors.children.photo_forbidden": (
        "Only the administration, the child's parents and their group's teacher can manage this photo"
    ),
    "errors.children.photo_must_be_image": "The profile photo must be an image",
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
    "errors.library.unknown_sections": "Some sections do not exist in this establishment",
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
    "errors.messaging.already_signed": "You have already signed this announcement",
    "errors.messaging.signature_not_required": (
        "This announcement does not require a signature"
    ),
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
    "errors.notifications.no_subscription": (
        "No push subscription for this account on this device"
    ),
    # ── organization ──────────────────────────────────────
    "errors.organization.child_not_in_group": "This child does not belong to this group",
    "errors.organization.educatrice_busy": (
        "This educator already leads a group in this section. An educator can lead only one group per section"
    ),
    "errors.organization.child_not_found": "Child not found in this establishment",
    "errors.organization.children_not_found": "Child(ren) not found: {ids}",
    "errors.organization.child_wrong_section": (
        "The child must belong to the same section as the group. Only children from that section can be assigned to it"
    ),
    "errors.organization.section_exists": (
        "The section “{name}” already exists in this department"
    ),
    "errors.organization.department_exists": (
        "The department “{name}” already exists in this establishment"
    ),
    "errors.organization.group_exists": "The group “{name}” already exists in this section",
    "errors.organization.educator_type_required": (
        "Only a staff member of type “educateur” can lead a group"
    ),
    "errors.organization.label_not_found": "{label} not found in this establishment",
    "organization.unit.departments": "Department",
    "organization.unit.sections": "Section",
    "organization.unit.groups": "Group",
    "organization.unit.other": "Item",
    "errors.organization.educatrice_not_found": "Educator not found in this establishment",
    # ── parents ───────────────────────────────────────────
    "errors.parents.children_not_found": "Child(ren) not found in this establishment: {ids}",
    # ── rbac ──────────────────────────────────────────────
    "rbac.baseline.educatrice.name": "Educator (baseline)",
    "rbac.baseline.educatrice.description": (
        "Automatic baseline for every educator: viewing and writing reports for "
        "their own group, viewing the menu."
    ),
    "rbac.baseline.bibliothecaire.name": "Librarian (baseline)",
    "rbac.baseline.bibliothecaire.description": (
        "Automatic baseline for every librarian: managing the catalogue, loans "
        "and returns, and library reminders."
    ),
    "errors.rbac.permissions_missing": (
        "The permission catalogue is incomplete in the database: {missing}. Run 'alembic upgrade head'"
    ),
    "errors.rbac.staff_not_found": "Staff member not found in this establishment",
    "errors.rbac.role_not_found": "Role not found",
    "errors.rbac.role_exists": "A role “{name}” already exists in this establishment",
    # ── reports ───────────────────────────────────────────
    "errors.reports.child_no_group": "This child is not assigned to any group",
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
    "errors.reports.only_draft_editable": (
        "A report that has been approved can no longer be changed: the parent has already received it"
    ),
    "errors.reports.only_draft_submittable": "Only a draft or rejected report can be submitted",
    "errors.reports.only_draft_deletable": (
        "Only a report still in draft (never submitted) can be deleted"
    ),
    "errors.reports.only_submitted_rejectable": "Only a submitted report can be rejected",
    "errors.reports.only_submitted_validatable": "Only a submitted report can be approved",
    "errors.reports.bad_file_type": (
        "File type not allowed: {content_type}. Only images and videos are accepted."
    ),
    "errors.reports.period_exists": (
        "A {report_type} report already exists for the “{period}” period ({report_status})"
    ),
    "errors.reports.dates_admin_only": (
        "Only an administrator can change a report's dates"
    ),
    "errors.reports.cannot_edit": "You are not allowed to change this report",
    "errors.reports.own_group_only": (
        "You can only fill in reports for children in your own group"
    ),
    "errors.common.unknown_type": "unknown",
    "errors.messaging.bad_file_type": (
        "File type not allowed: {content_type}. Allowed: {allowed}, or any image (except SVG)."
    ),
    "errors.messaging.bad_file_type_video": (
        "File type not allowed: {content_type}. Allowed: {allowed}, or any image (except SVG) or any video."
    ),
    # ── emails ──────────────────────────────────────────
    "emails.welcome_admin.subject": "Welcome to LPRDS — Administrator access",
    "emails.welcome_staff.subject": "Welcome to LPRDS — Your personal area",
    "emails.welcome_parent.subject": "Welcome to LPRDS — Family area",
    "emails.reset_password.subject": "Reset your LPRDS password",
    "emails.parent_password_reset.subject": "Your LPRDS password has been reset",
    "emails.report_available.subject": "A new report is available — {child}",
    "emails.announcement.subject": "New announcement — {title}",
    "emails.absence_inquiry.subject_one": "{child} absent — {date}",
    "emails.absence_inquiry.subject_many": "Absences on {date}",
    "emails.library_reminder.subject": "Library books due back",
    "reports.types.quotidien": "daily",
    "reports.types.bi_mensuel": "twice-monthly",
    "reports.types.annuel": "annual",
    "reports.status.draft": "draft",
    "reports.status.submitted": "submitted",
    "reports.status.rejected": "rejected",
    "reports.status.validated": "approved",
    # ── push ────────────────────────────────────────────
    "push.announcement.title": "New announcement",
    "push.message_from_school.title": "New message from the school",
    "push.message.title": "New message",
    "push.message.body": "A new message from {sender}",
    "push.report.title": "Report approved",
    "push.report.body": "A new “{period}” report is available for {child}.",
    "push.new_attachment": "New attachment",
    "push.test.title": "Test notification",
    "push.test.body": (
        "If you can read this, notifications work on this device."
    ),
    # ── dates (libellés longs : emails, messages, documents) ──
    "date.long": "{weekday} {day} {month} {year}",
    "date.weekday.0": "Monday",
    "date.weekday.1": "Tuesday",
    "date.weekday.2": "Wednesday",
    "date.weekday.3": "Thursday",
    "date.weekday.4": "Friday",
    "date.weekday.5": "Saturday",
    "date.weekday.6": "Sunday",
    "date.month.1": "January",
    "date.month.2": "February",
    "date.month.3": "March",
    "date.month.4": "April",
    "date.month.5": "May",
    "date.month.6": "June",
    "date.month.7": "July",
    "date.month.8": "August",
    "date.month.9": "September",
    "date.month.10": "October",
    "date.month.11": "November",
    "date.month.12": "December",
    # ── validation (ValueError Pydantic → 422) ──────────
    "validation.timezone_unknown": (
        "Unknown time zone: “{value}”. Use an IANA name, "
        "e.g. “Africa/Porto-Novo”"
    ),
    "validation.departure_before_arrival": (
        "The departure time must be later than the arrival time"
    ),
    "validation.password_requirements": "The password must contain: {missing}",
    "validation.password_uppercase": "an uppercase letter",
    "validation.password_digit": "a digit",
    "validation.birth_date_future": "The date of birth cannot be in the future",
    "validation.admission_before_birth": (
        "The admission date cannot precede the date of birth"
    ),
    "validation.nap_duration_required": "The nap duration is required when nap = yes",
    "validation.nap_duration_forbidden": "No nap duration should be given when nap = no",
    "validation.activity_required": "At least one activity is required",
    "validation.establishment_code": (
        "The code must be 2 to 10 alphanumeric characters "
        "(letters or digits), with no spaces or accents"
    ),
    # ── messages injectés en conversation ───────────────
    "conversations.absence_inquiry": (
        "Hello, {children} was marked absent on {date} (no arrival was "
        "recorded). Could you let us know the reason for this absence? "
        "Thank you."
    ),
    "conversations.library_reminder.intro": (
        "Library reminder: some borrowed books are due back."
    ),
    "conversations.library_reminder.line": (
        "• {book} — {child} — due back on {due_date}{overdue}"
    ),
    "conversations.library_reminder.overdue_one": " ({days} day overdue)",
    "conversations.library_reminder.overdue_many": " ({days} days overdue)",
    # ── import de fiches enfants (rapport ligne par ligne) ──
    "import.file.unsupported_format": (
        "unsupported format — .xlsx or .csv only"
    ),
    "import.file.xlsx_unreadable": "unreadable Excel file ({reason})",
    "import.file.no_headers": "empty sheet, or no header row",
    "import.file.csv_no_headers": "empty CSV, or no header row",
    "import.file.no_rows": "no data rows",
    "import.file.bad_encoding": "unreadable encoding (neither UTF-8 nor Windows-1252)",
    "import.row.empty": "entirely empty row",
    "import.row.phone_missing": "missing phone number",
    "import.row.phone_unusable": "unusable phone number ({phone}…)",
    "import.row.phone_secondary_ignored": (
        "secondary number ignored (phone longer than 20 characters)"
    ),
    "import.row.email_invalid": "invalid email ignored ({email})",
    "import.row.guardian_incomplete": (
        "guardian {slot} incomplete (surname + first names required)"
    ),
    "import.row.guardian_phone_missing": "guardian {slot}: missing phone number",
    "import.row.guardian_warning": "guardian {slot}: {warning}",
    "import.row.guardian_duplicate_ignored": (
        "duplicate guardian {slot} ignored ({name})"
    ),
    "import.row.guardian_duplicate_merged": (
        "duplicate guardian {slot} merged ({name}: {phones})"
    ),
    "import.row.authorized_incomplete": (
        "authorised person {slot} incomplete (surname + first names required)"
    ),
    "import.row.authorized_phone_missing": (
        "authorised person {slot}: missing phone number"
    ),
    "import.row.address_missing": "missing address → default wording used",
    "import.row.address_fallback": "Address not provided",
    "import.row.section_unknown": "unknown section ({section}) → left unassigned",
    "import.row.usual_name_note": "Usual name: {name}.",
    "import.row.status_unknown": "unknown status ({value}) — 'actif' or 'inactif'",
    "import.row.date_invalid": "invalid {field} ({value}) — YYYY-MM-DD or DD/MM/YYYY",
    # ── vocabulaire des rapports (formulaires + PDF) ────
    "reports.vocabulary.health_status.bien": "Well",
    "reports.vocabulary.health_status.a_surveiller": "To watch",
    "reports.vocabulary.health_status.malade": "Unwell",
    "reports.vocabulary.meal_amount.bien_mange": "Ate well",
    "reports.vocabulary.meal_amount.peu_mange": "Ate a little",
    "reports.vocabulary.meal_amount.rien_mange": "Ate nothing",
    "reports.vocabulary.mood.joyeux": "😊 Happy",
    "reports.vocabulary.mood.calme": "😌 Calm",
    "reports.vocabulary.mood.agite": "😤 Restless",
    "reports.vocabulary.mood.triste": "😢 Sad",
    "reports.vocabulary.mood.fatigue": "😴 Tired",
    "reports.vocabulary.mood.grincheux": "😠 Grumpy",
    "reports.vocabulary.behavior_tag.pleasant_day": "Had a lovely day at nursery.",
    "reports.vocabulary.behavior_tag.enthusiastic_participation": "Took part in the activities enthusiastically.",
    "reports.vocabulary.behavior_tag.interested_participation": "Took part in the activities with interest.",
    "reports.vocabulary.behavior_tag.observed_before_participating": "Preferred to watch before joining in.",
    "reports.vocabulary.behavior_tag.attentive_focused": "Was attentive and focused.",
    "reports.vocabulary.behavior_tag.distracted_moments": "Had a few distracted moments.",
    "reports.vocabulary.behavior_tag.curious_interested": "Showed curiosity and interest.",
    "reports.vocabulary.behavior_tag.assimilated_learning": "Took in the day's learning well.",
    "reports.vocabulary.behavior_tag.careful_application": "Carried out the activities carefully and diligently.",
    "reports.vocabulary.behavior_tag.autonomous": "Was independent during the activities.",
    "reports.vocabulary.behavior_tag.needed_support": "Needed support with some activities.",
    "reports.vocabulary.behavior_tag.good_interaction": "Interacted well with the other children.",
    "reports.vocabulary.behavior_tag.followed_instructions": "Followed instructions.",
    "reports.vocabulary.behavior_tag.needed_comfort": "Needed comforting.",
    "reports.vocabulary.behavior_tag.perseverance": "Showed perseverance in the face of difficulty.",
    "reports.vocabulary.class_behavior.calm": "😌 Calm",
    "reports.vocabulary.class_behavior.joyful": "😊 Cheerful",
    "reports.vocabulary.class_behavior.smiling": "😄 Smiling",
    "reports.vocabulary.class_behavior.participative": "🙋 Takes part",
    "reports.vocabulary.class_behavior.reserved": "🤐 Reserved",
    "reports.vocabulary.class_behavior.dynamic": "⚡ Lively",
    "reports.vocabulary.class_behavior.agitated": "😅 Restless",
    "reports.vocabulary.class_behavior.tired": "😴 Tired",
    "reports.vocabulary.class_behavior.emotional": "😢 Emotional",
    "reports.vocabulary.peer_relation.kind_to_peers": "Kind to classmates",
    "reports.vocabulary.peer_relation.sociable": "Sociable",
    "reports.vocabulary.peer_relation.cooperative": "Cooperative",
    "reports.vocabulary.peer_relation.struggles_sharing": "Sometimes finds sharing hard",
    "reports.vocabulary.peer_relation.prefers_alone": "Prefers to play alone",
    "reports.vocabulary.emotion_management.cried_little": "Cried little",
    "reports.vocabulary.emotion_management.cried_a_lot": "Cried a lot",
    "reports.vocabulary.emotion_management.needed_reassurance": "Needed reassurance",
    "reports.vocabulary.emotion_management.expresses_better": "Expresses emotions better",
    "reports.vocabulary.emotion_management.improving_emotion_management": "Making progress managing emotions",
    "reports.vocabulary.emotion_management.autonomous": "Independent",
    "reports.vocabulary.acquisition_level.acquis": "Achieved",
    "reports.vocabulary.acquisition_level.en_cours_acquisition": "Developing",
    "reports.vocabulary.acquisition_level.a_consolider": "Needs consolidating",
    # ── bulletin annuel (PDF) ───────────────────────────
    "reports.domains.oral_written_language": (
        "Developing and structuring spoken and written language"
    ),
    "reports.domains.physical_activities": (
        "Acting, expressing and understanding through physical activity"
    ),
    "reports.domains.artistic_activities": (
        "Acting, expressing and understanding through creative activity"
    ),
    "reports.domains.math_foundations": "Acquiring the first mathematical tools",
    "reports.domains.world_exploration": "Exploring the world",
    "reports.domains.english": "English",
    "reports.pdf.title": "Annual report",
    "reports.pdf.column.domain": "Area of learning",
    "reports.pdf.column.rating": "Rating",
    "reports.pdf.column.observation": "Teacher's observation",
    "reports.pdf.filename": "annual-report-{year}-{name}.pdf",
    # ── export des présences (PDF + Excel) ──────────────
    "attendance.status.present": "Present",
    "attendance.status.late": "Late",
    "attendance.status.absent": "Absent",
    "attendance.status.not_expected": "Not expected",
    "attendance.status.exempt": "Exempt",
    "attendance.person.child": "Child",
    "attendance.person.staff": "Staff",
    "attendance.export.title": "Attendance export",
    "attendance.export.sheet": "Attendance",
    "attendance.export.period": "Period from {date_from} to {date_to}",
    "attendance.export.row_count": "{count} row(s)",
    "attendance.export.column.type": "Type",
    "attendance.export.column.name": "Name",
    "attendance.export.column.matricule": "Reference",
    "attendance.export.column.date": "Date",
    "attendance.export.column.status": "Status",
    "attendance.export.column.arrival": "Arrival",
    "attendance.export.column.departure": "Departure",
    "attendance.export.column.late": "Late (min)",
    "attendance.export.column.meal": "Lunch",
    "attendance.export.yes": "Yes",
    "attendance.export.no": "No",
    "attendance.export.filename.children": "children",
    "attendance.export.filename.staff": "staff",
    "attendance.export.filename.both": "attendance",
    # ── libellé de période d'un rapport (calculé à la lecture) ──
    "reports.period.quotidien": "{day} {month} {year}",
    "reports.period.bi_mensuel": "{first}–{last} {month} {year}",
    "reports.period.annuel": "Year {year}",
    # ── export / modèle des fiches enfants ──────────────
    "children.export.sheet": "Children",
    "children.export.filename": "children_{date}.xlsx",
    "children.export.filename_csv": "children_{date}.csv",
    "children.template.filename": "children-template.xlsx",
    "children.template.filename_csv": "children-template.csv",
    "children.template.help_sheet": "Help",
    "children.template.help.column": "Column",
    "children.template.help.rule": "Rule",
    "children.template.help.matricule": (
        "Leave empty to create. Enter the reference (from an export) to update."
    ),
    "children.template.help.names": "Required.",
    "children.template.help.usual_name": (
        "Optional — added to the notes when it differs from the first names."
    ),
    "children.template.help.dates": (
        "YYYY-MM-DD (or DD/MM/YYYY). Admission on or after date of birth."
    ),
    "children.template.help.address": (
        "Required (a default wording is used, and flagged, when empty)."
    ),
    "children.template.help.status": (
        "actif / inactif (empty means actif)."
    ),
    "children.template.help.section": (
        "The section's exact name. Unknown = left unassigned, with a warning."
    ),
    "children.template.help.guardians": (
        "At least ONE complete guardian (surname, first names, phone) per child."
    ),
    "children.template.help.authorized": (
        "People authorised to collect the child."
    ),
}
