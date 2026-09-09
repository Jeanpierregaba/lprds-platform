"""
Registre central des modèles SQLAlchemy.

Les modèles vivent dans leur module métier respectif et se référencent entre eux
par nom (ex: relationship("Establishment")). SQLAlchemy ne peut résoudre ces noms
que si TOUS les modèles sont importés avant la première utilisation d'un mapper.

Tout point d'entrée (app, seed, Alembic) doit donc importer ce module plutôt que
les modules de modèles un par un. Tout nouveau module ajoutant des modèles DOIT
les déclarer ici.
"""

from app.core.database import Base
from app.modules.attendance.models import (
    AttendanceEvent,
    AttendanceSettings,
    DepartmentAttendanceSettings,
    StaffAttendanceSchedule,
)
from app.modules.auth.models import User, UserRole
from app.modules.children.models import (
    AuthorizedPerson,
    Child,
    ChildAttachment,
    Guardian,
)
from app.modules.establishments.models import Establishment
from app.modules.library.models import Book, BookLending, LibrarySettings, book_sections
from app.modules.messaging.models import (
    Announcement,
    AnnouncementRead,
    Attachment,
    Conversation,
    Message,
    announcement_departments,
)
from app.modules.menus.models import WeeklyMenu
from app.modules.organization.models import Department, Group, Section
from app.modules.parents.models import parent_children
from app.modules.rbac.models import (
    Permission,
    PermissionCode,
    Role,
    role_permissions,
    user_roles,
)
from app.modules.reports.models import DepartmentReportType, Report, ReportAttachment, ReportRead
from app.modules.notifications.models import PushSubscription
from app.modules.blog.models import Article, ArticleAttachment, BlogGalleryPhoto, BlogTag

__all__ = [
    "Base",
    "User",
    "UserRole",
    "Establishment",
    "Department",
    "Section",
    "Group",
    "Permission",
    "PermissionCode",
    "Role",
    "role_permissions",
    "user_roles",
    "Child",
    "ChildAttachment",
    "Guardian",
    "AuthorizedPerson",
    "parent_children",
    "AttendanceEvent",
    "DepartmentAttendanceSettings",
    "AttendanceSettings",
    "StaffAttendanceSchedule",
    "Announcement",
    "AnnouncementRead",
    "announcement_departments",
    "Conversation",
    "Message",
    "Attachment",
    "DepartmentReportType",
    "Report",
    "ReportRead",
    "ReportAttachment",
    "WeeklyMenu",
    "BlogTag",
    "Article",
    "ArticleAttachment",
    "BlogGalleryPhoto",
    "Book",
    "BookLending",
    "LibrarySettings",
    "book_sections",
    "PushSubscription",
]
