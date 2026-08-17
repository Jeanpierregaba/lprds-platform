from fastapi import APIRouter
from app.modules.attendance.router import router as attendance_router
from app.modules.auth.router import router as auth_router
from app.modules.blog.public_router import router as blog_public_router
from app.modules.blog.router import router as blog_router
from app.modules.children.router import router as children_router
from app.modules.establishments.router import router as establishments_router
from app.modules.gallery.router import router as gallery_router
from app.modules.menus.router import router as menus_router
from app.modules.messaging.router import router as messaging_router
from app.modules.organization.router import router as organization_router
from app.modules.parents.router import router as parents_router
from app.modules.rbac.router import router as rbac_router
from app.modules.reports.router import router as reports_router
from app.modules.staff.router import router as staff_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(establishments_router)
api_router.include_router(rbac_router)
api_router.include_router(organization_router)
api_router.include_router(children_router)
api_router.include_router(parents_router)
api_router.include_router(staff_router)
api_router.include_router(attendance_router)
api_router.include_router(messaging_router)
api_router.include_router(reports_router)
api_router.include_router(gallery_router)
api_router.include_router(menus_router)
api_router.include_router(blog_router)
api_router.include_router(blog_public_router)
