# CLAUDE.md — LPRDS · Les Petits Rayons de Soleil

> Fichier de contexte pour Claude Code. Lis ce fichier en entier avant toute action sur le projet.

---

## Vue d'ensemble du projet

**LPRDS** est une plateforme SaaS de gestion globale de crèches, garderies et écoles maternelles.
Elle couvre : gestion des enfants, présences, personnel, facturation, messagerie parent-éducateur et administration multi-établissements.


---

## Architecture générale

```
lprds-backend/      ← FastAPI + PostgreSQL + Redis
lprds-frontend/     ← Next.js 15 + shadcn/ui + Framer Motion
```

Les deux projets sont dans des dossiers séparés au même niveau (`~/`).

---

## Stack technique

### Backend
| Outil | Version | Rôle |
|---|---|---|
| Python | 3.12.3 | Runtime |
| FastAPI | 0.115.0 | Framework API |
| SQLAlchemy | 2.0.35 | ORM async |
| asyncpg | 0.29.0 | Driver PostgreSQL async |
| Alembic | 1.13.3 | Migrations DB |
| Pydantic v2 | 2.9.2 | Validation + settings |
| PyJWT | 2.9.0 | Tokens JWT |
| bcrypt | 4.2.0 | Hachage mots de passe |
| itsdangerous | 2.2.0 | Tokens reset password |
| fastapi-mail | 1.4.2 | Envoi emails |
| Jinja2 | 3.1.4 | Templates emails HTML |
| Redis | 5.1.0 | Cache + sessions |
| Celery | 5.4.0 | Tâches asynchrones |
| cryptography | 49.0.0 | Chiffrement Fernet des QR codes (présences) |
| qrcode + Pillow | 8.2 / 12.3.0 | Génération d'image PNG des QR codes |
| reportlab | 5.0.0 | Génération PDF du bulletin annuel (module Rapports) |

### Frontend
| Outil | Version | Rôle |
|---|---|---|
| Next.js | 16.2.10 | Framework React (App Router) |
| TypeScript | 5.x | Typage statique strict |
| Tailwind CSS | v4 | Styling utility-first |
| shadcn/ui | latest | Composants UI (New York style, Zinc) |
| Framer Motion | latest | Animations |
| Zustand | latest | État global (auth session) |
| React Hook Form | latest | Formulaires |
| Zod | latest | Validation schémas |
| Axios | latest | Client HTTP |
| Sonner | latest | Toasts notifications |
| pnpm | 11.x | Gestionnaire de paquets |

---

## Structure des dossiers

### Backend — `lprds-backend/`

```
app/
├── main.py                        # Point d'entrée FastAPI + lifespan + CORS
├── core/
│   ├── config.py                  # Settings Pydantic (lire .env)
│   ├── database.py                # Engine SQLAlchemy async + get_db
│   ├── models.py                  # ⚠️ Registre central des modèles (cf. ci-dessous)
│   ├── redis.py                   # Client Redis async partagé
│   ├── storage.py                 # Stockage fichiers (backend local uniquement)
│   ├── rate_limit.py              # Anti brute-force générique (INCR+EXPIRE Redis)
│   └── seed.py                    # Script seed superadmin (idempotent)
├── modules/
│   ├── auth/
│   │   ├── models.py              # User, UserRole (StrEnum)
│   │   ├── schemas.py             # Pydantic v2 I/O + type StrongPassword
│   │   ├── security.py            # JWT, bcrypt, reset token, révocation Redis
│   │   ├── email.py               # Envoi emails via fastapi-mail + Jinja2
│   │   ├── service.py             # Logique métier auth
│   │   ├── router.py              # Endpoints HTTP /auth/*
│   │   ├── dependencies.py        # get_current_user, get_active_user, require_roles()
│   │   └── templates/             # HTML emails (welcome_*, reset_password)
│   ├── establishments/
│   │   ├── models.py              # Establishment, MAX_ADMINS_PER_ESTABLISHMENT
│   │   ├── schemas.py             # Pydantic v2 I/O schemas
│   │   ├── service.py             # Logique métier établissements
│   │   └── router.py              # Endpoints HTTP /establishments/*
│   ├── rbac/
│   │   ├── models.py              # Permission, Role, PermissionCode, tables M2M
│   │   ├── schemas.py             # Pydantic v2 I/O schemas
│   │   ├── service.py             # Logique métier rôles/permissions
│   │   ├── dependencies.py        # require_permission(), admin_establishment_id
│   │   └── router.py              # Endpoints HTTP /rbac/*
│   ├── organization/
│   │   ├── models.py              # Department, Section, Group (hiérarchie)
│   │   ├── schemas.py             # Pydantic v2 I/O schemas
│   │   ├── service.py             # Logique départements / sections / groupes
│   │   └── router.py              # /departments/*, /sections/*, /groups/*
│   ├── children/
│   │   ├── models.py              # Child, Guardian, AuthorizedPerson
│   │   ├── matricule.py           # Génération <CODE>-<5 alphanum>
│   │   ├── schemas.py             # Pydantic v2 I/O schemas
│   │   ├── service.py             # Logique métier enfants
│   │   └── router.py              # Endpoints HTTP /children/*
│   ├── parents/
│   │   ├── models.py              # Table d'association parent_children (M2M)
│   │   ├── schemas.py             # Pydantic v2 I/O schemas
│   │   ├── service.py             # Logique métier parents
│   │   └── router.py              # Endpoints HTTP /parents/*
│   ├── staff/
│   │   ├── models.py              # Enum StaffType (pas de table : staff = User)
│   │   ├── matricule.py           # Génération <CODE>-<3 alphanum>
│   │   ├── schemas.py             # Pydantic v2 I/O schemas
│   │   ├── service.py             # Logique métier personnel
│   │   └── router.py              # Endpoints HTTP /staff/*
│   ├── attendance/
│   │   ├── models.py              # AttendanceEvent, *AttendanceSettings (dept/staff)
│   │   ├── schemas.py             # Pydantic v2 I/O schemas
│   │   ├── service.py             # Scan, calcul présence/retard/absence à la volée
│   │   └── router.py              # Endpoints HTTP /attendance/*
│   ├── messaging/                 # ⚠️ HORS RBAC — admin/parent uniquement
│   │   ├── models.py              # Announcement, AnnouncementRead, Conversation, Message, Attachment
│   │   ├── schemas.py             # Pydantic v2 I/O schemas
│   │   ├── service.py             # Diffusions + conversations, publie sur Redis
│   │   ├── dependencies.py        # get_admin / get_parent / get_admin_or_parent
│   │   ├── ws_auth.py             # Authentification WebSocket (jeton en query string)
│   │   ├── ws_manager.py          # Relais pub/sub Redis ↔ WebSocket
│   │   └── router.py              # REST /messaging/* + WS /messaging/ws
│   ├── reports/
│   │   ├── models.py              # ReportType/Status, DepartmentReportType, Report, ReportRead
│   │   ├── schemas.py             # Pydantic v2 I/O schemas — contenu structuré par type
│   │   ├── service.py             # Cycle de vie, calcul de période, publication
│   │   ├── pdf.py                 # Génération PDF du bulletin annuel (reportlab)
│   │   ├── dependencies.py        # get_parent (portail)
│   │   ├── email.py + templates/  # Notification de publication (best-effort)
│   │   └── router.py              # Endpoints HTTP /reports/*
│   ├── gallery/                   # Pas de models.py — agrégation live, aucune table propre
│   │   ├── schemas.py             # GalleryMediaItem unifié (source report|message)
│   │   ├── service.py             # Requêtes agrégées sur report_attachments + attachments
│   │   ├── dependencies.py        # get_parent (portail)
│   │   └── router.py              # Endpoints HTTP /gallery/*
│   ├── menus/
│   │   ├── models.py              # WeeklyMenu (1 ligne = 1 semaine, content JSONB typé)
│   │   ├── schemas.py             # DayMenu, MenuCreateRequest/WriteRequest/Response
│   │   ├── service.py             # Règles lundi/passé, contrôle d'accès historique
│   │   ├── dependencies.py        # get_establishment_member (lecture ouverte à tous)
│   │   └── router.py              # Endpoints HTTP /menus/*
│   └── blog/                      # ⚠️ SEUL module avec un volet public sans authentification
│       ├── models.py              # BlogTag (libre), Article (draft/published, soft delete), ArticleAttachment
│       ├── schemas.py             # Schémas gestion (internes) + publics (site vitrine)
│       ├── service.py             # Workflow publication, soft delete, requêtes publiques scopées establishment_code
│       ├── router.py              # /blog/* — authentifié, blog:write
│       └── public_router.py       # /public/blog/* — AUCUNE authentification
└── api/
    └── v1/
        └── router.py              # Agrège tous les modules

migrations/
├── env.py                         # Config Alembic async
└── versions/                      # Fichiers de migration générés

tests/                             # cf. section "Tests automatisés"
├── conftest.py
├── helpers.py
└── e2e/

Dockerfile / docker-compose.yml / docker/entrypoint.sh   # cf. section "Docker"
.env.example                       # cf. section ".env.example"
pytest.ini
```

#### ⚠️ Registre central des modèles — `app/core/models.py`

Les modèles vivent chacun dans leur module métier et se référencent **par nom**
(`relationship("Establishment")`). SQLAlchemy ne résout ces noms que si **tous**
les modèles sont importés avant la première utilisation d'un mapper.

**Règle : tout point d'entrée (app, seed, Alembic) importe `app.core.models`,
jamais les modules de modèles un par un.** Tout nouveau module contenant des
modèles doit s'ajouter à ce registre, sinon les relations casseront au runtime.

### Frontend — `lprds-frontend/`

```
src/
├── app/
│   ├── layout.tsx                 # Root layout (Providers + Toaster)
│   ├── globals.css                # Tailwind v4 + variables CSS shadcn
│   ├── providers.tsx              # QueryClientProvider React Query
│   ├── auth/
│   │   ├── login/page.tsx         # Page connexion (email + password)
│   │   ├── reset-password/page.tsx # Demande reset mdp
│   │   └── new-password/page.tsx  # Nouveau mdp (1er login + reset)
│   └── dashboard/
│       ├── super/page.tsx         # Dashboard superadmin (temporaire)
│       ├── admin/page.tsx         # Dashboard admin (temporaire)
│       ├── staff/page.tsx         # Dashboard staff (temporaire)
│       └── parent/page.tsx        # Dashboard parent (temporaire)
├── components/
│   └── ui/                        # Composants shadcn (button, input, card, form, sonner...)
├── lib/
│   ├── api/
│   │   ├── client.ts              # Axios + intercepteurs JWT + refresh auto
│   │   └── auth.api.ts            # Appels API auth
│   ├── stores/
│   │   └── auth.store.ts          # Store Zustand (session + tokens)
│   └── utils/
│       ├── api-error.ts           # getApiErrorMessage()
│       └── cn.ts                  # Utilitaire Tailwind merge
├── types/
│   ├── auth.ts                    # UserRole, User, TokenResponse, ROLE_HOME...
│   └── api.ts                     # ApiResponse<T>, PaginatedResponse<T>
└── middleware.ts                   # Protection routes Next.js (Edge Runtime)
```

---

## Base de données

### Connexion
```
postgresql+asyncpg://adminlprds:lprds@localhost:5432/lprds_database
```

### Tables existantes
- `establishments` — établissements (crèches, garderies, maternelle)
- `users` — tous les utilisateurs (tous rôles confondus)
- `permissions` — catalogue RBAC (seedé par migration, lecture seule)
- `roles` / `role_permissions` / `user_roles` — RBAC par établissement
- `departments` / `sections` / `groups` — hiérarchie interne (dept → section → groupe)
- `children` — fiches enfants (matricule unique)
- `guardians` — parents/tuteurs d'un enfant (fiches de contact)
- `authorized_persons` — personnes autorisées à récupérer un enfant
- `parent_children` — association compte parent ↔ enfants (M2M)
- `attendance_events` — journal append-only des scans QR (présence)
- `department_attendance_settings` / `attendance_settings` — horaires + fuseau
- `announcements` / `announcement_reads` — diffusions admin → parents + accusés de lecture
- `conversations` / `messages` — messagerie privée admin ↔ parent (1 conv/parent)
- `attachments` — pièces jointes (messages OU diffusions, jamais les deux)
- `department_report_types` — types de rapport activés par département
- `reports` — rapports de vie de l'enfant (workflow brouillon → validé)
- `report_reads` — accusés de lecture d'un parent sur un rapport
- `report_attachments` — photos/vidéos jointes à un rapport

### Rôles utilisateurs (`UserRole` enum)
| Rôle | Description | Peut créer |
|---|---|---|
| `superadmin` | Gestion complète du SaaS | `superadmin`, `admin` |
| `admin` | Gestion d'un établissement | `staff`, `parent` (dans SON établissement uniquement) |
| `staff` | Éducatrices, secrétaires, etc. | — |
| `parent` | Parents d'enfants | — |

L'enum PostgreSQL `userrole` stocke les **valeurs en minuscules** (`superadmin`),
pas les noms de membres. C'est le rôle de `values_callable` sur le modèle `User` :
la base, l'API, le frontend et les futures policies RLS parlent le même langage.
Ne pas retirer ce paramètre.

### Commandes Alembic
```bash
# Nouvelle migration après modification d'un modèle
alembic revision --autogenerate -m "description"

# Appliquer
alembic upgrade head

# Revenir en arrière
alembic downgrade -1
```

**Alembic est la seule autorité sur le schéma.** Il n'y a volontairement plus de
`Base.metadata.create_all` dans le lifespan : deux sources de vérité finiraient
par diverger. Après un `git pull` ou un changement de modèle → `alembic upgrade head`.

> ⚠️ L'autogenerate **ne détecte pas** les changements de *valeurs* d'un enum
> PostgreSQL (seulement l'ajout de colonnes/types). Ces migrations doivent être
> écrites à la main — cf. `d1c025df8c1a` qui bascule `userrole` en minuscules.

---

## Authentification

### Flux complet
1. `POST /api/v1/auth/login` → retourne `access_token` (15min) + `refresh_token` (30j) + `must_change_pwd`
2. Si `must_change_pwd=true` → redirect `/auth/new-password`
3. Sinon → redirect vers `ROLE_HOME[user.role]`
4. `GET /api/v1/auth/me` → profil utilisateur (header `Authorization: Bearer <token>`)
5. Refresh auto via intercepteur Axios sur erreur 401

### Endpoints auth disponibles
```
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh            # Rotation : l'ancien refresh est révoqué
POST   /api/v1/auth/logout             # Révoque access + refresh (blacklist Redis)
GET    /api/v1/auth/me
POST   /api/v1/auth/users              # Créer un utilisateur (admin+ requis)
POST   /api/v1/auth/password-reset     # Demande reset (public)
POST   /api/v1/auth/password-reset/confirm
POST   /api/v1/auth/password-change    # Changement mdp (connecté)
```

### Envoi d'emails — deux comportements volontairement différents

`send_*_email()` lève `EmailDeliveryError` si le SMTP échoue. Les appelants la
traitent **différemment**, et ce n'est pas une incohérence :

| Chemin | Échec SMTP | Pourquoi |
|---|---|---|
| `POST /auth/users`, `POST /parents`, `POST /parents/{id}/reset-password` | **503**, transaction annulée | Le mot de passe n'existe que dans cet email : sans lui le compte/reset serait inutilisable. Mieux vaut aucun compte qu'un compte inaccessible. |
| `POST /auth/password-reset` | **204** (identique au cas nominal), échec journalisé | Un 503 sur email connu contre un 204 sur email inconnu permettrait d'**énumérer les comptes**. La réponse doit être invariante. |

L'envoi passe par `_send()` (`auth/email.py`), point unique qui : court-circuite
si `MAIL_SUPPRESS_SEND` (dev/test), sinon appelle le mailer et convertit toute
erreur SMTP en `EmailDeliveryError`.

> ⚠️ `MAIL_USERNAME` / `MAIL_PASSWORD` doivent contenir de **vraies** identifiants
> Mailtrap. Tant qu'ils valent `<mailtrap>` (placeholders), les chemins ci-dessus
> renverront 503 (sauf si `MAIL_SUPPRESS_SEND=true`). La création d'admin via
> `/establishments` n'est pas concernée (elle n'envoie pas d'email).

### Révocation de tokens (Redis)

Chaque JWT porte un `jti` unique. `POST /auth/logout` et la rotation du refresh
inscrivent ce `jti` dans une blacklist Redis (`revoked_jti:<jti>`), avec un TTL
aligné sur l'`exp` du token.

**Fail-closed** : si Redis est injoignable, les requêtes authentifiées renvoient
**503** et non 401 — sans Redis on ne peut pas prouver qu'un token n'a pas été
révoqué, et refuser vaut mieux qu'accepter un token révoqué. Redis est donc une
dépendance dure du chemin d'authentification.

### Anti brute-force sur `/auth/login` (Redis)

`app/core/rate_limit.py` — compteur `INCR` + `EXPIRE` (fenêtre fixe), clé
`login_attempts:<ip>:<email>`, **avant** toute vérification de mot de passe
(sinon le coût bcrypt lui-même reste exploitable comme oracle de charge).
Configurable via `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` (défaut 5) et
`LOGIN_RATE_LIMIT_WINDOW_SECONDS` (défaut 300) — `app/core/config.py`.

- Compté par **(IP, email)**, pas par IP seule : un attaquant ne peut pas
  bloquer les comptes des autres utilisateurs juste en les nommant depuis la
  même IP (chaque email a son propre quota), et une même IP peut légitimement
  servir plusieurs comptes (foyer, établissement) sans se gêner mutuellement.
- **Remis à zéro uniquement sur connexion réussie** — un utilisateur qui tape
  la bonne combinaison du premier coup n'est jamais ralenti ; seules les
  tentatives échouées consomment le quota.
- Quota dépassé → **429**, `detail` inclut le TTL restant en secondes
  (`Retry-After` implicite dans le message, pas encore un header HTTP dédié).
- Pas de dépendance externe (slowapi, etc.) — Redis est déjà une dépendance
  dure du module (révocation de tokens ci-dessus), pas besoin d'un second
  système.

### Protection des routes (backend)
```python
# Route publique — aucune dépendance
@router.post("/login")

# Route authentifiée, accessible même si must_change_pwd=True
# (réservé à /auth/me et /auth/password-change)
current_user: User = Depends(get_current_user)

# Route authentifiée exigeant un mot de passe déjà changé
current_user: User = Depends(get_active_user)

# Route par rôle (implique get_active_user)
creator: User = Depends(require_roles(UserRole.ADMIN, UserRole.SUPERADMIN))

# Dépendance sur tout un router (cf. module establishments)
router = APIRouter(dependencies=[Depends(require_roles(UserRole.SUPERADMIN))])
```

**`must_change_pwd` est imposé côté API**, pas seulement par le frontend : tant
qu'il est vrai, `get_active_user` renvoie **403** et seuls `/auth/me` et
`/auth/password-change` restent accessibles. Le détenteur d'un mot de passe
temporaire ne peut donc pas contourner l'étape via l'API directe.

### Protection des routes (frontend)
Le `middleware.ts` lit le cookie `lprds-auth` (Zustand persist) et redirige les non-authentifiés vers `/auth/login`.

### Redirection par rôle après login
```typescript
// src/types/auth.ts
export const ROLE_HOME: Record<UserRole, string> = {
  superadmin: '/dashboard/super',
  admin:      '/dashboard/admin',
  staff:      '/dashboard/staff',
  parent:     '/dashboard/parent',
}
```

---

## Module Établissements

Espace superadmin — version simplifiée : **pas** de gestion d'abonnement SaaS ni
de features avancées. Les établissements sont gérés **exclusivement par les
superadmins** (dépendance `require_roles(SUPERADMIN)` posée sur tout le router).

### Endpoints
```
POST   /api/v1/establishments                        # Établissement + son 1er admin
GET    /api/v1/establishments                        # ?search= &include_inactive= &skip= &limit=
GET    /api/v1/establishments/{id}                   # Détail + admins actifs
PATCH  /api/v1/establishments/{id}                   # Modification partielle
DELETE /api/v1/establishments/{id}                   # Désactivation (SOFT delete)
GET    /api/v1/establishments/{id}/admins            # Lister les admins actifs
POST   /api/v1/establishments/{id}/admins            # Ajouter un admin (max 3)
DELETE /api/v1/establishments/{id}/admins/{user_id}  # Retirer un admin
```

### Champs d'un établissement
| Champ | Contrainte |
|---|---|
| `code` | **unique**, indexé, 2–10 caractères alphanumériques, normalisé en MAJUSCULES |
| `name` | requis, 200 max |
| `address` | requis, 500 max |
| `email` | requis, validé `EmailStr` |
| `phone` | requis, 20 max |
| `is_active` | soft delete |

### Le code établissement

Champ **structurant** : il sert de préfixe aux matricules des membres (enfants,
staff) — ex. `LPRDS` → `LPRDS-2026-0001`. D'où sa normalisation stricte
(majuscules, alphanumérique, sans espace ni accent) : un code mal formé
produirait des matricules bancals. `"lprds"` est accepté et stocké `"LPRDS"`.

> La **génération des matricules** elle-même reste à implémenter dans les modules
> enfants / staff. Le code est la brique de base.

### Règles métier (invariants)
- **Max 3 admins actifs** par établissement (`MAX_ADMINS_PER_ESTABLISHMENT`).
  Vérifié via `ensure_admin_quota()`, appelé **aussi** depuis `POST /auth/users`
  (import local pour éviter un cycle) — sinon la règle serait contournable.
- **Le dernier admin ne peut pas être retiré** (409) : un établissement sans
  admin ne serait plus gérable.
- **Un admin est confiné à son établissement** : `POST /auth/users` force
  `establishment_id = creator.establishment_id` et ignore la valeur du payload.
  Seul un superadmin choisit librement l'établissement.
- **Retirer un admin** = désactiver son compte (`is_active=False`), jamais de
  suppression.
- **Le mot de passe de l'admin est saisi par le superadmin** à la création, avec
  `must_change_pwd=True`. **Aucun email n'est envoyé sur ce chemin** : il
  contiendrait un mot de passe en clair. Le superadmin transmet les identifiants
  hors plateforme. (`welcome_admin.html` ne sert qu'à `POST /auth/users`.)
- **Le `code` est figé dès qu'un matricule enfant a été émis** (409). Les
  matricules embarquent le code en préfixe (`LPRDS-M87D1`) : le changer les
  désynchroniserait silencieusement de leur établissement.

---

## Module RBAC (rôles & permissions)

### ⚠️ Deux notions de « rôle » coexistent — ne pas les confondre

| | `User.role` (UserRole) | `Role` (RBAC) |
|---|---|---|
| Nature | Enum figé dans le code | Ligne en base, créée par l'admin |
| Portée | Type de compte | Droits fins dans un établissement |
| Valeurs | superadmin / admin / staff / parent | Directeur, Assistant de direction… (libres) |
| Qui l'attribue | Le créateur du compte | L'admin de l'établissement |

`UserRole` dit **ce qu'est** le compte, `Role` dit **ce que le staff a le droit de
faire**. Les deux sont vérifiés : `require_roles()` pour le premier,
`require_permission()` pour le second.

### Endpoints (réservés à l'admin de SON établissement)
```
GET    /api/v1/rbac/permissions                    # Catalogue (lecture seule)
POST   /api/v1/rbac/roles                          # Créer un rôle
GET    /api/v1/rbac/roles                          # ?include_inactive=
GET    /api/v1/rbac/roles/{id}
PATCH  /api/v1/rbac/roles/{id}                     # permissions=[] vide les droits
DELETE /api/v1/rbac/roles/{id}                     # Désactivation (soft)
GET    /api/v1/rbac/staff/{user_id}/roles          # Rôles + permissions effectives
POST   /api/v1/rbac/staff/{user_id}/roles/{role_id}    # Attribuer
DELETE /api/v1/rbac/staff/{user_id}/roles/{role_id}    # Révoquer
```

### Catalogue des permissions

Source de vérité : l'enum `PermissionCode` (`rbac/models.py`). La table
`permissions` en est le reflet, **seedée par migration**.

| Code | Effet |
|---|---|
| `children:read` | Consulter les fiches enfants |
| `children:write` | Créer et modifier les fiches enfants |
| `children:archive` | Activer / désactiver une fiche enfant |
| `parents:read` | Consulter les comptes parents |
| `parents:write` | Créer, modifier et réinitialiser les comptes parents |
| `staff:read` | Consulter les comptes du personnel |
| `staff:write` | Créer, modifier et réinitialiser les comptes du personnel |
| `organization:read` | Consulter départements, sections et groupes |
| `organization:write` | Gérer départements, sections et groupes |
| `attendance:scan` | Scanner les codes QR de présence |
| `attendance:read` | Consulter les présences et tableaux de bord |
| `attendance:write` | Configurer les paramètres de présence (horaires, exemptions, QR) |
| `reports:read` | Consulter les rapports |
| `reports:write` | Créer, modifier et soumettre des rapports |
| `reports:validate` | Valider ou rejeter les rapports soumis |
| `gallery:read` | Consulter la galerie de médias (photos/vidéos des rapports) |
| `menus:write` | Créer et modifier les menus de la semaine, consulter l'historique |
| `blog:write` | Rédiger, publier, modifier et supprimer les actualités du site vitrine |

> **Ajouter une permission** = 1) l'ajouter à `PermissionCode` + `PERMISSION_LABELS`,
> 2) écrire une migration qui l'insère dans `permissions`. Sans l'étape 2, toute
> tentative de l'attribuer renvoie une 500 explicite (garde-fou dans le service).

### Règle d'autorisation — `require_permission(*codes)`
- **Admin** de l'établissement → autorisé d'office (tous les droits chez lui)
- **Staff** → autorisé si ses rôles **actifs** portent **toutes** les permissions
- **Superadmin** → **refusé** (403). Il gère le SaaS et les établissements, pas
  les données des enfants — minimisation RGPD. C'est volontaire, pas un oubli.
- **Parent** → refusé (le portail parent est un module à venir)

---

## Module Organisation (départements, sections & groupes)

Hiérarchie stricte, propre à chaque établissement :

```
Department  1 ──< N  Section  1 ──< N  Group
                                        ├── educatrice (1 staff type=educateur, unique/section)
                                        └── enfants (N, même section, 1 groupe max)
```

**On ne peut pas sauter un niveau** : pas de section sans département (422 si
`department_id` manquant, 404 si le département n'existe pas), pas de groupe sans
section. Tout est géré par un **admin ou un staff porteur de `organization:write`**
(superadmin exclu, 403).

### Endpoints
```
POST/GET/PATCH/DELETE  /api/v1/departments[/{id}]      # DELETE = soft
POST/GET/PATCH/DELETE  /api/v1/sections[/{id}]         # ?department_id= ; DELETE = soft
POST/GET/PATCH/DELETE  /api/v1/groups[/{id}]           # ?section_id= ; DELETE = soft
POST   /api/v1/groups/{id}/children/{child_id}         # Assigner / déplacer un enfant
DELETE /api/v1/groups/{id}/children/{child_id}         # Retirer un enfant
```

Permissions : `organization:read` (GET) / `organization:write` (le reste).
Unicité des noms par parent : département unique/établissement, section
unique/département, groupe unique/section.

### Départements & sections
Juste un `name` (+ `description` optionnelle). La section porte en plus un
`department_id` obligatoire, validé dans l'établissement.

### Groupes — la partie complexe
- **Éducatrice obligatoire**, et **unique par section** : une éducatrice ne mène
  qu'un groupe actif par section (409 sinon), **mais peut en mener plusieurs dans
  des sections différentes**. Doit être un staff **actif** de type `educateur`
  (422 sinon).
- **Nom** optionnel : par défaut le **surnom de l'éducatrice** (repli sur
  `prénom nom`). Surchargeable.
- **Enfants** : assignables à la création (`child_ids`) ou via les endpoints
  dédiés. Un enfant ne peut être assigné qu'à un groupe **de sa propre section**
  (422 sinon).
- **Un enfant appartient à 0 ou 1 groupe** (`children.group_id`). L'assigner à un
  nouveau groupe le retire automatiquement de l'ancien → le « déplacement » se
  fait donc toujours dans la même section (la section de l'enfant est fixe).

### ⚠️ Unicité et soft-delete → index PARTIELS
Les contraintes d'unicité des groupes (nom, éducatrice) sont des **index uniques
partiels `WHERE is_active`** (`uq_group_name_active_per_section`,
`uq_group_educatrice_active_per_section`), pas des contraintes pleines. Sinon un
groupe désactivé bloquerait la réutilisation du nom (= surnom de l'éducatrice,
récurrent) ou la réassignation de l'éducatrice. Les checks applicatifs filtrent
donc aussi `is_active=True`. **Tout couple unicité + soft-delete doit suivre ce
patron** (index partiel + filtre applicatif cohérent).

---

## Module Enfants

### Endpoints
```
POST   /api/v1/children                 # Matricule généré côté serveur
GET    /api/v1/children                 # ?search= &department_id= &section_id=
                                        #  &include_inactive= &skip= &limit=
GET    /api/v1/children/{id}            # Fiche complète (dont médical)
PATCH  /api/v1/children/{id}            # Modification partielle
PATCH  /api/v1/children/{id}/status     # Activer / désactiver
```

**Il n'existe AUCUN endpoint DELETE** — c'est délibéré. Une fiche enfant ne se
supprime jamais, elle se désactive (`PATCH /status`). Données RGPD sensibles.

### Permissions requises
| Endpoint | Permission |
|---|---|
| `POST`, `PATCH /{id}` | `children:write` |
| `GET`, `GET /{id}` | `children:read` |
| `PATCH /{id}/status` | `children:archive` |

### Le matricule

Format : **`<CODE ÉTABLISSEMENT>-<5 caractères alphanumériques>`** — ex. `LPRDS-M87D1`.

- Généré **côté serveur**, jamais fourni par le client
- Alphabet `A-Z0-9`, tirage aléatoire (`secrets`), unicité vérifiée avec retry
  (10 tentatives) + contrainte `UNIQUE` en base comme garde-fou final
- 36⁵ ≈ 60 millions de combinaisons par établissement
- **Immuable** : jamais régénéré, y compris à la modification de la fiche
- Voir `children/matricule.py`

### Structure des informations
| Groupe | Champs |
|---|---|
| Base | `last_name`, `first_names`, `birth_date`, `admission_date`, `residence_address`, `department_id`, `section_id` |
| Comportement | `behavioral_notes`, `preferences` |
| Médical | `medical_notes`, `dietary_restrictions`, `medications`, `doctor_name`, `doctor_phone` |
| Tuteurs (1-N) | `guardians[]` : `last_name`, `first_names`, `phone`, `email` (optionnel) |
| Personnes autorisées (0-N) | `authorized_persons[]` : `last_name`, `first_names`, `phone` |

### Règles métier (invariants)
- **Tuteur non obligatoire** : une fiche peut être créée/importée sans tuteur
  (`guardians=[]` accepté — règle assouplie sur demande : les lignes d'import
  sans tuteur créent la fiche au lieu d'être rejetées)
- **Dates cohérentes** : naissance non future, admission ≥ naissance — vérifié
  aussi au PATCH partiel (en recroisant avec les valeurs déjà en base)
- **Département / section doivent appartenir au même établissement** (404 sinon).
  ⚠️ `department_id` et `section_id` de l'enfant restent **indépendants** l'un de
  l'autre (on ne vérifie pas encore que la section appartient au département de
  l'enfant, contrairement à la hiérarchie du module Organisation) — à durcir si
  le métier l'exige.
- **Groupe** : un enfant a 0 ou 1 groupe (`group_id`), assigné/déplacé via les
  endpoints `/groups/{id}/children/{child_id}` du module Organisation, jamais via
  `/children`. L'enfant et le groupe doivent partager la même section.
- **Isolation multi-établissement** : toutes les requêtes sont bornées à
  `current_user.establishment_id`. Une fiche d'un autre établissement renvoie
  **404, jamais 403** — on ne révèle pas son existence.
- **`guardians` / `authorized_persons` au PATCH** : `None` = inchangé, une liste
  fournie **REMPLACE** l'ensemble existant (pas de fusion).
- **Parents/tuteurs = fiches de contact**, sans compte de connexion. La colonne
  `guardians.user_id` (nullable) est prévue pour brancher un compte le jour où le
  portail parent arrivera — sans migration de schéma.

### Import one-shot depuis l'export legacy (`backend/scripts/import_children.py`)

Script CLI de migration unique (jamais d'endpoint API pour ça — pas de surface
d'attaque permanente). Chaque ligne passe par `create_child` (+ `set_child_status`
si `inactive`) : matricules générés par `children/matricule.py`, validations
Pydantic natives, rattachement département/section vérifié. **Dry-run par défaut**,
`--apply` pour écrire ; rapport CSV systématique (`legacy_id → OK + matricule /
REJETÉE + motif / avertissements`) + `--resume-from-report` (les doublons se
créent quand même par décision produit : la reprise évite le double import).

Mapping legacy (72 lignes testées : 71 OK, 1 rejetée sur dates incohérentes) :
`first_name/last_name`, dates ISO, `address` (vide → mention par défaut +
avertissement), `status` active/inactive, `section` (slug → `--section-map` puis
repli nom exact, inconnu → NULL + avertissement ; `department_id` dérivé de la
section), `emergency_contacts_detailed` (JSON : `parent`/`guardian` → `guardians[]`
dédupliqués par téléphone puis fusion même-nom-tél-différent avec avertissement ;
autres + `is_pickup_authorized` → `authorized_persons[]` ; autres non autorisés
ignorés car aucun champ ne les porte), `medical_info_detailed` + `medical_info` +
`special_needs` → champs médicaux, `dietary_restrictions`/`behavioral_notes`/
`preferences` homonymes (`"[]"` = vide), `usual_name` → préfixé à
`behavioral_notes` si non inclus dans `first_names`. Emails invalides → `None` +
avertissement (jamais de rejet) ; téléphone > 20 car. → 1er segment avant `/` +
avertissement, sinon rejet.

**Colonnes ignorées** (`IGNORED_COLUMNS` dans le script) : `id`/`created_at`/
`updated_at` (régénérés), `code_qr_id` (QR legacy — nos QR d'attendance dérivent
des IDs internes, jamais du matricule), `group_id`/`assigned_educator_id` (IDs
legacy — assignation aux groupes après coup via `/groups/...`), `photo_url`
(aucun fichier), `administrative_documents`/`dietary_restrictions`/
`medical_history`/`allergies`/`special_needs` plats (vides dans l'export),
`emergency_contacts` plat (vide — seul le JSON est lu).

Garde-fous : vérification `to_regclass` du schéma effectif avant toute écriture
(sans elle, un `DB_SCHEMA` sans migrations ferait retomber les écritures sur
`public` — piège vécu en test) ; CSV **jamais versionné** (`**/children_rows*.csv`
au `.gitignore`, données RGPD).

Runbook VPS : backup `pg_dump` → `scp` + `docker cp` du CSV → `docker compose exec
backend python scripts/import_children.py --csv /tmp/... --establishment-code
LPRDS` (dry-run d'abord, `--apply` ensuite) → récupérer le rapport (`docker cp`)
→ supprimer les CSV (conteneur + VPS). Détail complet dans le docstring du script.

---

## Module Parents

Un compte parent **est un `User` (role=parent)**, pas un modèle à part. Il porte
le champ `nickname` (surnom d'identification, ex. « Papa Anaïs »). Ce module
n'ajoute qu'une table d'association `parent_children`.

### ⚠️ Deux notions distinctes — `guardians` vs compte parent

| | `guardians` | Compte parent (`User` role=parent) |
|---|---|---|
| Nature | Fiche de contact sur la fiche enfant | Compte connectable |
| Créé | À la création de l'enfant | Via `POST /parents` |
| Portée | 1 enfant | N enfants (via `parent_children`) |
| Login | Non | Oui |

Les deux **coexistent** et ne sont pas synchronisés : un guardian déclaré sur une
fiche n'a pas forcément de compte, et un compte parent ne crée pas de guardian.
La colonne `guardians.user_id` (nullable) reste le point de jonction prévu pour
le futur portail parent.

### Endpoints
```
POST   /api/v1/parents                       # Crée le compte + envoie les identifiants
GET    /api/v1/parents                       # ?search= &include_inactive= &skip= &limit=
GET    /api/v1/parents/{id}                  # Détail + enfants assignés
PATCH  /api/v1/parents/{id}                  # Modifie tout (email inclus)
POST   /api/v1/parents/{id}/reset-password   # Reset administré (voir ci-dessous)
```

Pas d'endpoint DELETE : un compte se désactive via `PATCH {is_active:false}`.

### Permissions requises
| Endpoint | Permission |
|---|---|
| `POST`, `PATCH`, `reset-password` | `parents:write` |
| `GET`, `GET /{id}` | `parents:read` |

L'admin de l'établissement a tout d'office ; le superadmin est **exclu** (403),
comme pour les enfants.

### Création
Champs saisis par le créateur : `first_name`, `last_name`, `nickname`, `phone`,
`email`, `password` (temporaire), `child_ids` (≥ 1). Le parent reçoit
**automatiquement** un email de bienvenue avec ses identifiants
(`welcome_parent.html`), et `must_change_pwd=True` (changement imposé au 1er login).
Les enfants assignés **doivent appartenir au même établissement** (404 sinon).

### Reset de mot de passe — « administré », spécifique aux parents
`POST /parents/{id}/reset-password` avec `{new_password}` :
- l'admin/staff **saisit** le nouveau mot de passe
- il est envoyé au parent par email (`parent_password_reset.html`)
- **`must_change_pwd` reste False** : le parent n'a PAS à le redéfinir, contrairement
  au flux `/auth/password-reset` (lien + saisie). C'est un choix produit assumé.

> C'est distinct du reset self-service `/auth/password-reset` (lien de reset) :
> ici c'est l'établissement qui pilote et communique le mot de passe.

### Invariants
- **Isolation** : toutes les requêtes bornées à `current_user.establishment_id`.
  Un parent d'un autre établissement → **404** (jamais 403).
- **`child_ids` au PATCH** : `None` = inchangé, une liste **REMPLACE** l'assignation.
- **Email unique** sur toute la table `users` (409 sinon).
- **Envoi d'email obligatoire** : si le SMTP échoue à la création ou au reset, la
  transaction est annulée (**503**) — un compte/reset dont les identifiants ne sont
  pas délivrés serait inutilisable. (Cf. `MAIL_SUPPRESS_SEND` pour dev/test.)

---

## Module Personnel (staff)

Un compte staff **est un `User` (role=staff)**, porteur du `nickname` (surnom, ex.
« Tata Victoire ») et de deux colonnes propres au staff : `matricule` et
`staff_type`. Ce module ne définit **aucune table** — juste l'enum `StaffType`.

### ⚠️ `staff_type` est une métadonnée, PAS une permission

Le type de personnel est un **poste descriptif**, totalement indépendant de :
- `UserRole` — le compte reste `role=staff`
- le RBAC — les droits viennent des rôles/permissions attribués

**Choisir le type « administrateur » ne confère AUCUN droit d'administration.**
Pour donner des droits à un staff, l'admin lui attribue un rôle RBAC (`/rbac`).

Valeurs (`StaffType`) : `administrateur`, `educateur`, `prestataire`,
`directrice`, `redacteur`, `secretaire`, `restaurateur`. Stockées en **texte**
(validées côté API), pas en enum PostgreSQL : ajouter un type = éditer l'enum,
sans migration.

> `community_manager` a été renommé `redacteur` (migration `e65737c171e1`,
> `UPDATE users SET staff_type='redacteur' WHERE staff_type='community_manager'`)
> à l'introduction du module Blog — rappel : ce renommage ne change **aucun
> droit** (`staff_type` reste purement descriptif), c'est `blog:write` (RBAC)
> qui gouverne qui peut rédiger/publier.

### Endpoints
```
POST   /api/v1/staff                      # Crée le compte (matricule) + envoie les identifiants
GET    /api/v1/staff                      # ?search= &staff_type= &include_inactive= &skip= &limit=
GET    /api/v1/staff/{id}                 # Détail
PATCH  /api/v1/staff/{id}                 # Modifie tout (email, type inclus)
POST   /api/v1/staff/{id}/reset-password  # Reset administré (cf. module Parents)
PATCH  /api/v1/staff/{id}/status          # Activer / désactiver
```

Pas d'endpoint DELETE : un compte se désactive via `PATCH /status`.

### Permissions requises
| Endpoint | Permission |
|---|---|
| `POST`, `PATCH`, `reset-password`, `status` | `staff:write` |
| `GET`, `GET /{id}` | `staff:read` |

Admin d'office ; superadmin **exclu** (403).

### Le matricule staff
Format : **`<CODE ÉTABLISSEMENT>-<3 caractères alphanumériques>`** — ex. `LPRDS-D2Y`.
Généré côté serveur, immuable, unique (colonne `users.matricule`, index unique).
36³ ≈ 46 656 combinaisons/établissement (bien moins que les 5 caractères des
enfants → 20 tentatives de retry). Cf. `staff/matricule.py`.

### Création / reset / statut
Mêmes règles que le module Parents : mot de passe temporaire saisi par le
créateur + email de bienvenue (`welcome_staff.html`) + `must_change_pwd=True` ;
reset administré (mot de passe fourni, envoyé, sans redéfinition imposée) ;
isolation en 404 ; envoi d'email obligatoire (503 + rollback sinon).

> ⚠️ Un staff créé via l'ancien `POST /auth/users` n'a **ni matricule ni
> staff_type**. Créer le personnel via `POST /staff` désormais.

---

## Module Présences (attendance)

Pointage par scan de QR code : arrivée, départ, cantine (staff uniquement),
avec accompagnateur pour les enfants. **Aucune UI de dashboard n'est fournie
ici** — le module expose les données agrégées (présence/retard/absence/cantine
du jour), à consommer par le frontend.

### Modèle : un journal, pas un état

`attendance_events` est **append-only** : chaque scan crée une ligne, jamais de
mise à jour. Présence, retard, absence et cantine du jour sont **calculés à la
volée** (`attendance/service.py`) à partir des événements du jour, jamais stockés.
Avantages : traçabilité complète (qui a scanné, quand), plusieurs scans par jour
sans rien écraser, aucune désynchronisation possible entre un état et son historique.

Deux contraintes **CHECK** en base (pas seulement applicatives) :
- exactement une des deux FK (`child_id` / `staff_id`) est renseignée, cohérente
  avec `person_type`
- `event_type='meal'` impossible si `person_type != 'staff'` — **pas de cantine
  pour les enfants**, imposé au niveau SQL, pas seulement par l'API

### QR code — chiffré, avec image générée côté backend

Les QR sont imprimés sur des cartes/badges et **présentés physiquement** par le
parent ou le personnel au scan (arrivée comme départ). Le contenu doit donc être
**illisible pour un tiers** qui scannerait le badge avec une app quelconque :

- Le payload est un jeton **chiffré** (Fernet/`cryptography`, clé dérivée de
  `SECRET_KEY` — pas de nouvelle variable d'env), **pas seulement signé**. Un
  simple token signé (type `itsdangerous`) reste décodable en base64 par
  n'importe qui ; ici le contenu est réellement opaque.
- Le payload n'encode **jamais le matricule**, ni même en clair le type de
  personne — seulement `{type, id interne}` chiffré. Même en cas de faiblesse
  cryptographique hypothétique, le pire qui fuiterait est un UUID interne,
  inutilisable sans accès API authentifié.
- **Pas d'expiration** : le badge doit rester valide au long cours (Fernet le
  permet nativement, `ttl=None` au déchiffrement).
- Le backend génère aussi l'**image PNG** (`qrcode` + `Pillow`), renvoyée en
  data URI base64 (`qr_image`) — prête à imprimer, aucune génération requise
  côté frontend.
- ⚠️ **Rupture volontaire** : l'ancien format `"CHILD:<matricule>"` en clair
  (première version de ce module) n'est plus accepté par `/scan` — il n'y a
  jamais eu d'usage réel, aucune compatibilité à préserver.

`GET /attendance/qrcode/child/{id}` et `.../staff/{id}` renvoient
`{ matricule, qr_payload, qr_image }` — `matricule` reste utile à l'écran pour
l'admin authentifié (impression lisible sur le badge à côté du QR), mais n'est
**jamais** ce qui est encodé dans le QR lui-même.

### Endpoints
```
GET  /api/v1/attendance/qrcode/child/{id}         # Jeton chiffré + image PNG (attendance:write)
GET  /api/v1/attendance/qrcode/staff/{id}         # Jeton chiffré + image PNG (attendance:write)
POST /api/v1/attendance/scan                      # Enregistre un scan (attendance:scan)
GET  /api/v1/attendance/events                    # Journal (attendance:read)
GET  /api/v1/attendance/daily/children            # ?date= &department_id= &section_id=
GET  /api/v1/attendance/daily/staff                # ?date=
GET  /PUT /api/v1/attendance/settings/departments/{department_id}   # attendance:write
GET  /PUT /api/v1/attendance/settings/general                        # fuseau + horaires staff
GET  /api/v1/attendance/settings/exempt-staff                        # ?exempt_only=
PATCH /api/v1/attendance/settings/exempt-staff/{staff_id}
GET  /api/v1/attendance/export                      # ?format=&person_type=&date_from=&date_to=
                                                    #  &department_id=&section_id=&child_id=&staff_id=
```

Export agrégé PDF/Excel (statut par personne × jour, max 366 jours) :
`child_id` / `staff_id` (exclusifs, 422 sinon) restreignent à UNE personne
précise — 404 si hors établissement — et priment sur `person_type` /
département / section.

### Permissions — trois, pas deux

Contrairement aux autres modules (`read`/`write`), celui-ci a **trois**
permissions distinctes, car ce sont trois gestes différents dans la vraie vie
(un agent d'accueil scanne, sans pouvoir consulter les rapports ni changer la
config) :

| Permission | Couvre |
|---|---|
| `attendance:scan` | `POST /scan` uniquement |
| `attendance:read` | Journal + dashboards journaliers |
| `attendance:write` | QR codes, horaires, exemptions (config du système) |

Admin d'office sur les trois ; superadmin exclu (403), comme partout ailleurs.

### Calcul du statut journalier

Pour chaque personne active d'un établissement (enfants ou staff, un dashboard
séparé pour chacun) :

| Situation | `status` | `late_minutes` |
|---|---|---|
| Pas d'arrivée, jour ouvré (lun-ven) | `absent` | `null` |
| Pas d'arrivée, week-end | `not_expected` | `null` |
| Arrivée, aucun horaire configuré | `present` | `null` (indéterminable) |
| Arrivée après l'horaire attendu | `late` | écart en minutes |
| Arrivée dans les temps | `present` | `0` |
| **Staff exempté**, pas d'arrivée | `exempt` | `null` |
| **Staff exempté**, arrivée quand même | calculé normalement | idem |

`arrival_time` = **premier** événement `arrival` du jour ; `departure_time` =
**dernier** événement `departure` du jour (en cas de scans multiples/erreurs).

> ⚠️ Pas de gestion de calendrier (congés, jours fériés) dans cette version —
> volontairement simplifié à « jours ouvrés lun-ven ». Un enfant/staff absent un
> jour férié apparaîtra `absent`. À enrichir si besoin.
>
> Le **bucket « jour »** (quels événements comptent pour la date demandée) reste
> calculé sur une journée UTC 00:00–24:00, mais la **comparaison de retard**
> (heure d'arrivée vs horaire attendu) est faite dans le **fuseau horaire
> configuré** de l'établissement (cf. ci-dessous). Un décalage de fuseau proche
> de minuit peut donc, en théorie, ranger un événement dans le « mauvais » jour
> côté bucket — cas limite non traité, à corriger si besoin réel.

### Paramètres — fuseau horaire + asymétrie enfants/staff assumée

Un seul jeu de **paramètres généraux** par établissement
(`attendance_settings`, table singleton) — configurable par l'admin ou un
staff porteur de `attendance:write` :

- **`timezone`** (nom IANA, ex. `Africa/Porto-Novo`) : utilisé pour **les deux**
  calculs de retard (enfants ET staff). Validé via `zoneinfo` à la saisie (422
  si le nom n'existe pas). Défaut implicite `UTC` tant que rien n'est configuré.
- **`staff_expected_arrival_time` / `staff_expected_departure_time`** : **un
  seul horaire pour tout le personnel** de l'établissement — pas de découpe par
  département pour le staff (confirmé : *« Tous les personnels ont une même
  heure d'arrivée et de départ »*).

Les enfants restent différents : horaires **par département**
(`department_attendance_settings`, 1 ligne par département,
`GET`/`PUT /attendance/settings/departments/{id}`) — *« La découpe des horaires
par département ne concerne que les enfants »*. Le fuseau horaire, lui, est
**unique pour l'établissement** et s'applique aussi aux enfants (pas de fuseau
par département).

> ⚠️ Le staff n'est **rattaché à aucun département** dans le modèle actuel. Même
> si on voulait un jour des horaires staff par département, il faudrait d'abord
> ajouter ce lien — non fait ici, hors périmètre de la demande actuelle.

**Exemption** (`users.attendance_exempt`, colonne sur `User`, défaut `False`) :
un staff exempté n'est jamais compté `absent` par défaut, géré via
`/attendance/settings/exempt-staff`.

### Isolation
Toutes les opérations (scan, QR, dashboards, réglages) sont bornées à
`current_user.establishment_id`. Scanner ou consulter une personne d'un autre
établissement → **404**, y compris quand le matricule scanné existe réellement
mais ailleurs (le matricule seul ne suffit pas à identifier une personne hors
de son établissement).

---

## Module Messagerie (temps réel)

Deux volets : **diffusions** (un admin publie pour tous les parents de
l'établissement **ou** pour un à plusieurs départements cochés avant l'envoi)
et **conversations privées** (une par parent — pas par membre du staff :
« l'administration » est collective, n'importe quel admin peut répondre dans
n'importe quelle conversation ; photos ET vidéos acceptées).

### ⚠️ HORS RBAC — la seule exception du projet

Ce module ne passe **jamais** par `require_permission`. Seul le rôle de compte
est vérifié (`UserRole.ADMIN` / `UserRole.PARENT`), via
`messaging/dependencies.py` (`get_admin`, `get_parent`, `get_admin_or_parent`).
**Le staff est exclu même avec toutes les permissions RBAC possibles**, et le
superadmin aussi — sur demande explicite (*« très sensible [...] uniquement les
comptes admin et parents »*). Vérifié par test : un staff ou un superadmin
reçoit 403 sur chaque endpoint, y compris le WebSocket.

### Architecture temps réel : REST pour écrire, WebSocket pour pousser

Toutes les écritures passent par des endpoints REST classiques (validés,
permissionnés, testables comme le reste de l'app). Le WebSocket ne contient
**aucune logique métier** — il relaie uniquement ce qui est publié sur Redis
après une écriture réussie :

```
Client → POST /messaging/... → service (DB + validation)
                                    │
                                    └─→ publish_event(canal, contenu complet) → Redis
                                                                                    │
Client ← WS (relais transparent) ←──────────── tous les workers abonnés ──────────┘
```

- **Contenu complet publié, pas un pointeur** : l'événement Redis contient déjà
  toute la donnée (le message, l'annonce...), pas juste "il y a du nouveau, va
  recharger". Ça contourne la question d'ordonnancement commit/publish (publier
  légèrement avant la fin de la transaction HTTP n'expose aucune donnée
  incohérente au client, qui n'a rien à requêter).
- **Multi-workers correct** : le relais passe par Redis (déjà une dépendance du
  projet — révocation de tokens), pas par un registre de connexions en mémoire
  locale à un process. Un message publié depuis une requête traitée par le
  worker A atteint bien un client connecté au worker B.
- **Best-effort, jamais bloquant** : contrairement à l'email (canal de
  délivrance critique sans filet, cf. module Parents), un échec Redis sur
  `publish_event` est **journalisé, jamais remonté en erreur HTTP** — le
  message est déjà persisté en base, il sera vu au prochain chargement REST
  même sans le push temps réel.

### WebSocket — `GET /api/v1/messaging/ws?token=<jwt>`

- **Jeton en query string**, pas en header `Authorization` : un navigateur ne
  peut pas poser de header custom sur un handshake WS. Authentification
  manuelle (`ws_auth.py`), réplique de `get_current_user`/`get_active_user`
  (jeton `access`, non révoqué, compte actif, mdp déjà changé).
- **Défense en profondeur** : l'`Origin` du handshake, quand le navigateur en
  envoie un, est vérifié contre `settings.cors_origins` (CORSMiddleware ne
  s'applique PAS aux WebSocket — Starlette ne le fait qu'sur le scope `http` —
  donc cette vérification est la seule protection d'origine sur ce endpoint).
- **Rejet = fermeture avant `accept()`** : un jeton invalide/révoqué ou un rôle
  non éligible (staff/superadmin) ferme la connexion sans l'accepter. Selon le
  serveur ASGI, ça se traduit soit par un refus HTTP direct du handshake
  (`InvalidStatus`, observé avec uvicorn), soit par une fermeture juste après
  (`ConnectionClosed`, code `1008`) — les deux prouvent la même chose : jamais
  de session WS utilisable sans jeton admin/parent valide.
- **Session DB éphémère** : la connexion n'ouvre une session DB QUE pour la
  phase d'authentification (+ get-or-create de la conversation côté parent),
  commit, puis referme — une connexion WS peut vivre des heures, hors de
  question de garder une connexion du pool ouverte tout ce temps.
- **Canaux abonnés** :
  | Rôle | Canaux |
  |---|---|
  | Parent | `messaging:estab:{id}:announcements` + `messaging:conv:{sa_conversation_id}` |
  | Admin | `messaging:estab:{id}:announcements` + `messaging:estab:{id}:admin` (agrégé : tous les messages de toutes les conversations, pour rafraîchir la liste en direct) |

### Endpoints REST
```
POST   /api/v1/messaging/announcements                     # admin
GET    /api/v1/messaging/announcements                     # admin ou parent (vue différente)
GET    /api/v1/messaging/announcements/{id}
PATCH  /api/v1/messaging/announcements/{id}                # admin — dont désactivation (soft)
POST   /api/v1/messaging/announcements/{id}/read           # parent

GET    /api/v1/messaging/conversations/me                  # parent — auto-créée si absente
GET    /api/v1/messaging/conversations/me/messages
POST   /api/v1/messaging/conversations/me/messages
POST   /api/v1/messaging/conversations/me/read

GET    /api/v1/messaging/conversations                     # admin — liste, triée par activité
POST   /api/v1/messaging/conversations                     # admin — ouvre (get-or-create) une conversation
                                                           #   avec un parent {parent_id, body?} ; body = 1er
                                                           #   message d'ouverture (optionnel) — 201
GET    /api/v1/messaging/conversations/{id}/messages       # admin — n'importe quel parent
POST   /api/v1/messaging/conversations/{id}/messages       # admin — répond « au nom de l'administration »
POST   /api/v1/messaging/conversations/{id}/read           # admin

POST   /api/v1/messaging/announcements/{id}/attachments                     # admin
POST   /api/v1/messaging/conversations/me/messages/{msg_id}/attachments     # parent
POST   /api/v1/messaging/conversations/{id}/messages/{msg_id}/attachments   # admin
GET    /api/v1/messaging/attachments/{id}                                   # admin ou parent — téléchargement
```

Double chemin volontaire : `/me` pour le parent (toujours SA conversation,
auto-résolue), `/{id}` pour l'admin (n'importe laquelle, par id) — les deux
acteurs ont des règles de portée trop différentes pour partager un seul jeu
d'endpoints proprement.

### Diffusions — lecture asymétrique
`AnnouncementResponse` porte des champs qui n'apparaissent JAMAIS ensemble :
- vue **parent** : `is_read` (son statut personnel)
- vue **admin** : `read_count` / `total_parents` (« combien de parents ont vu »)

### Diffusions — ciblage par départements (1 à N, coché avant l'envoi)

UX voulue : la diffusion se rédige **en entier d'abord**, puis l'admin coche
les départements concernés avant d'envoyer (un seul ou plusieurs) —
`POST /announcements {title, body, department_ids: [...]}`. **Liste vide =
broadcast** à tous les parents (comportement historique inchangé).

- Stockage : table d'association `announcement_departments` (aucune ligne =
  broadcast), relation `Announcement.departments` (`lazy="selectin"`).
  FK côté département en `RESTRICT` : une suppression ne doit jamais élargir
  silencieusement une audience ciblée vers un broadcast (les départements ne
  sont de toute façon que soft-deleted via l'API).
- **Audience d'un parent** = les départements de SES enfants (via
  `parent_children` + `children.department_id`, enfants sans département
  ignorés). Un parent sans enfant dans le périmètre : la diffusion n'apparaît
  ni en liste, ni au détail, ni en `POST .../read` (**404 partout**, jamais
  403 — on ne révèle pas l'existence, comme tout le projet).
- **Compteur admin X/Y sur l'audience réelle** : `total_parents` = parents
  actifs ayant ≥ 1 enfant dans le périmètre (broadcast = tous les parents).
  Au `PATCH` du périmètre, les lectures de parents sortis du périmètre sont
  **supprimées** (sinon `read_count > total`). `PATCH {department_ids: [...]`
  remplace le ciblage (`[]` = retour au broadcast, `null` = inchangé).
- **Temps réel & push ciblés** : l'événement WS `announcement` inclut
  `department_ids` (même canal établissement — le client filtre) ; le push
  (`send_push_to_establishment_parents(..., parent_ids=...)`) et le
  téléchargement des pièces jointes de diffusion respectent le périmètre
  (404 hors périmètre côté parent).
- Validation : chaque `department_id` doit appartenir à l'établissement
  (404 sinon, doublons dédupliqués).

### Conversations — un seul niveau de lu/non-lu
`Message.read_at` = lu **par l'autre côté**, un seul champ (pas de suivi par
admin individuel). Un admin qui ouvre le fil et appelle `POST .../read` marque
lu **pour toute l'administration** — un seul parent en face, une équipe de
l'autre, le suivi collectif correspond à l'usage réel. `sender_role` est une
**photo** du rôle au moment de l'envoi (pas le rôle actuel de l'expéditeur) :
sert à afficher « Administration » côté parent et à filtrer qui-doit-marquer-lu
sans jointure.

### Accusés de lecture — poussés en temps réel (pas juste au rechargement)
`mark_conversation_read` / `mark_announcement_read` publient un événement Redis
en plus d'écrire en base — le côté qui a envoyé voit le « lu » apparaître sans
recharger :

| Action | Événement | Canaux |
|---|---|---|
| Admin/parent marque une conversation lue | `{"type": "read_receipt", conversation_id, reader_role, message_ids: [...], read_at}` | `messaging:conv:{id}` + `messaging:estab:{id}:admin` |
| Parent marque une diffusion lue | `{"type": "announcement_read", announcement_id, read_count}` | `messaging:estab:{id}:admin` **uniquement** |

La lecture d'une diffusion ne notifie **jamais les autres parents** (non
pertinent pour eux) — seul le compteur admin (« X/Y ont lu ») a besoin d'être
poussé en direct. Testé explicitement : le canal parent ne reçoit rien sur
`announcement_read`.

### Pièces jointes

Une pièce jointe appartient à **un message OU une diffusion, jamais les
deux** — même pattern « double FK nullable + `CHECK`» que
`AttendanceEvent.child_id`/`staff_id`. Upload en **deux temps** (pas dans le
même appel que l'envoi du texte) : le message/l'annonce existe déjà, on y
attache un fichier après coup via un endpoint dédié — ça n'a rien cassé des
endpoints JSON existants (`send_message` reste inchangé). Côté UI le trombone
vit dans la barre de saisie (au-dessus du bouton d'envoi), plus sur chaque
bulle : choisir un fichier crée le message (texte éventuel, corps vide sinon
— `MessageCreateRequest.body` accepte `""`) puis y attache le média dans la
foulée, façon WhatsApp.

- **Stockage local uniquement** (`app/core/storage.py`, backend `local` —
  `STORAGE_BACKEND`/`STORAGE_LOCAL_PATH` étaient déjà dans `Settings` mais
  jusqu'ici inutilisés par aucun module ; celui-ci est le premier à les
  câbler). Nom sur disque = UUID généré, **jamais** le nom original (évite
  collisions et path traversal) ; le nom original n'est conservé qu'en base
  pour l'affichage/téléchargement.
- **Écriture disque hors thread principal** (`asyncio.to_thread`) — ne bloque
  pas la boucle asyncio le temps de l'I/O.
- **Téléchargement authentifié uniquement** : `GET /messaging/attachments/{id}`
  vérifie l'établissement (404 si différent), pour une pièce jointe de
  message que le demandeur est admin OU le parent propriétaire de la
  conversation, et pour une pièce jointe de **diffusion ciblée** que le parent
  est dans le périmètre (404 sinon). **Jamais de fichier servi en statique**
  (pas de `StaticFiles` mount) — un accès direct au chemin de stockage ne
  suffirait à rien voir, toute lecture passe par cette vérification.
- **Validation** : taille max (`MESSAGING_MAX_ATTACHMENT_MB`, défaut 10 Mo,
  413 sinon — **sauf la vidéo** : `MESSAGING_MAX_VIDEO_MB`, défaut 50 Mo, car
  10 Mo rendrait tout envoi vidéo impossible) et type MIME — la liste blanche
  (`MESSAGING_ALLOWED_ATTACHMENT_TYPES`, défaut images + PDF, 422 sinon) est
  complétée par un sur-ensemble : **tout MIME `image/*` est accepté** (sauf
  `image/svg+xml`) partout, et **tout MIME `video/*` est accepté UNIQUEMENT
  dans les conversations privées** (`_validate_upload(allow_video=True)` —
  les diffusions restent images + PDF) —
  le `content_type` déclaré par le client n'est **pas** vérifié par analyse du
  contenu (pas de sniffing des octets magiques) : simplification assumée,
  acceptable pour ce périmètre mais pas une garantie de sécurité forte contre
  un client qui mentirait délibérément sur le type.
- **Poussé en temps réel** comme un message : `{"type": "attachment", message_id, ...}`
  sur les mêmes canaux (`messaging:conv:{id}` + `messaging:estab:{id}:admin`),
  ou `{"type": "announcement_attachment", ...}` sur le canal diffusions pour
  une pièce jointe d'annonce.

### Limites connues (hors périmètre de cette version)
- Pas de limitation de débit sur l'envoi de messages/fichiers.
- Pas de vérification du contenu réel des fichiers (seulement taille + type
  MIME déclaré).
- Un seul backend de stockage (local) — `S3`/objet distant non implémenté
  malgré le paramètre `storage_backend` qui l'anticipe.

---

## Module Rapports

Récapitulatif de la vie de l'enfant, rédigé par l'éducatrice de son groupe (ou
un admin), validé par l'admin (ou un staff délégué), publié automatiquement au
parent (portail + email) une fois validé.

### Contenu : les 3 types sont maintenant structurés

`content` est validé contre un schéma Pydantic strict dédié à chaque type
(`DailyReportContent` / `BiMensuelReportContent` / `AnnualReportContent`,
`reports/schemas.py`) — 422 avec le détail des erreurs si non conforme.
`summary` reste accepté mais **optionnel** pour les 3 types (tout est porté
par le contenu structuré).

Cette validation est décidée **dans `_validate_content()`** (service.py), via
une table `_CONTENT_SCHEMA_BY_TYPE = {ReportType: schéma}` — pas de
discriminated union Pydantic globale (toujours pas justifié avec seulement 3
schémas indépendants, chacun avec ses propres règles). Ajouter un futur type
de rapport ne touche que cette table.

#### Contenu du rapport quotidien (`DailyReportContent`)
| Champ | Type | Règle |
|---|---|---|
| `arrival_time` / `departure_time` | `time \| None` | **Pré-remplis automatiquement** depuis les scans du module Présences si non fournis — cf. ci-dessous. Toujours éditables. |
| `health_status` | `bien \| a_surveiller \| malade` | Requis |
| `temperature_arrival` / `temperature_departure` | `float \| None` | Optionnel, borné 30–43°C (repère nonsense — ex. une saisie en Fahrenheit) |
| `health_notes` | `str \| None` | Optionnel |
| `breakfast` / `lunch` / `snack` | `bien_mange \| peu_mange \| rien_mange` | Requis chacun |
| `nap` | `bool` | Requis |
| `nap_duration_minutes` | `int \| None` | **Cohérence imposée** : requis si `nap=true`, doit être absent si `nap=false` (422 sinon) |
| `bath` / `poop` | `bool` | Requis |
| `moods` | `list[Mood]`, ≥1 | Cases cochées (au moins une) ; doublons silencieusement dédupliqués, pas une erreur |
| `activities` | `list[str]`, ≥1 | Saisie une par une côté formulaire (input + bouton « + ») ; espaces rognés, entrées vides écartées, au moins une activité réelle exigée (422 sinon). Les rapports historiques stockent encore une `str` : normalisée en liste à la lecture côté frontend (`normalizeActivities`), jamais migrée en base.
| `behaviors` | `list[BehaviorTag]`, ≥1 | Idem `moods` — dédupliqué automatiquement |
| `highlight` | `str \| None` | Facultatif (« petit fait marquant ») |

#### Contenu du rapport bi-mensuel (`BiMensuelReportContent`)
| Champ | Type | Règle |
|---|---|---|
| `oral_written_language`, `physical_activities`, `artistic_activities`, `math_foundations`, `world_exploration`, `english` | `str`, non vide | 6 champs texte requis (« Activités & apprentissages ») |
| `class_behaviors` | `list[ClassBehavior]`, ≥1 | Cases cochées, dédupliquées |
| `peer_relations` | `list[PeerRelation]`, ≥1 | Idem |
| `emotion_management` | `list[EmotionManagement]`, ≥1 | Idem |
| `teacher_observations` | `str`, non vide | Requis |

> ⚠️ **« Date de début & date de fin »** demandées dans la spec ne sont **pas**
> des champs de `content` : elles correspondent aux `period_start`/`period_end`
> déjà calculés automatiquement (découpage 1–15 / 16–fin de mois). Les
> dupliquer dans `content` créerait une seconde source de vérité pouvant
> diverger de la période réelle du rapport — interprétation à confirmer si le
> besoin réel était des dates librement éditables.
>
> **« Photos & vidéo de la période »** ne sont pas non plus un champ de
> `content` : gérées par le mécanisme générique de pièces jointes du module
> (déjà valable pour tous les types, cf. ci-dessous), pas de code spécifique
> au bi-mensuel nécessaire.

#### Contenu du rapport annuel (`AnnualReportContent`) — bulletin par domaine

6 domaines fixes, chacun noté (`AcquisitionLevel`) **et** commenté par
l'éducatrice — pas de liste libre de domaines, les 6 champs sont nommés :

| Champ | Domaine (libellé) |
|---|---|
| `oral_written_language` | Développement et structuration du langage oral et écrit |
| `physical_activities` | Agir, s'exprimer, comprendre à travers les activités physiques |
| `artistic_activities` | Agir, s'exprimer, comprendre à travers les activités artistiques |
| `math_foundations` | L'acquisition des premiers outils mathématiques |
| `world_exploration` | Explorer le monde |
| `english` | Anglais |

Chaque champ est un objet `DomainAssessment` :
```json
{"rating": "acquis | en_cours_acquisition | a_consolider", "observation": "texte libre, non vide"}
```
`rating` et `observation` sont tous deux **requis** — un domaine sans
observation (422) n'a pas de sens pour un bulletin. Comme pour bi_mensuel, la
période (année civile) est déjà portée par `period_start`/`period_end`, pas un
champ de `content` ; les photos/vidéo réutilisent le mécanisme générique de
pièces jointes.

Tous les enums de cases à cocher/notation (`Mood`, `BehaviorTag`,
`ClassBehavior`, `PeerRelation`, `EmotionManagement`, `AcquisitionLevel` —
6+15+9+5+6+3 valeurs) sont des **codes stables** (ex. `pleasant_day`), jamais
les phrases françaises brutes — même pattern que `PermissionCode`/
`PERMISSION_LABELS` : la base ne dépend jamais du texte affiché, qui peut
changer sans migration. Libellés exposés via `GET /reports/vocabulary` (cf.
plus bas — 8 catégories au total).

#### Pré-remplissage des horaires depuis le module Présences

Si `arrival_time`/`departure_time` ne sont **pas fournis** par le client à la
création d'un `quotidien`, le service interroge `attendance_events` (même
enfant, même `reference_date`) et pré-remplit avec le premier scan `arrival` /
dernier scan `departure` du jour, convertis dans le **fuseau horaire configuré**
de l'établissement (`AttendanceSettings.timezone`, même mécanisme que le
module Présences — UTC par défaut si non configuré). **Le client reste
prioritaire** : une valeur fournie n'est jamais écrasée.

### Pièces jointes (photos / vidéos)

Table dédiée `report_attachments` (pas de polymorphisme avec les pièces
jointes de la messagerie — modules indépendants, pas de FK croisée) :
- Upload en **deux temps**, comme la messagerie : le rapport existe déjà
  (JSON), le fichier s'ajoute après via `multipart/form-data`.
- Limites **propres au module** (`MESSAGING_*` ne s'applique pas ici) :
  `REPORTS_MAX_ATTACHMENT_MB` (défaut 50 Mo — plus haut que la messagerie car
  la vidéo est acceptée) et `REPORTS_ALLOWED_ATTACHMENT_TYPES`. **Tout MIME
  `image/*` ou `video/*` est accepté** (le plafond + la liste configurée
  restent en vigueur en sur-ensemble) — l'utilisateur a demandé le support de
  **tous** les formats image/vidéo. Seul `image/svg+xml` est rejeté (422,
  risque XSS).
- **Téléchargement authentifié uniquement**, jamais de fichier servi en
  statique — même principe que la messagerie. Côté parent
  (`GET /reports/mine/{id}/attachments/{id}`), les pièces jointes ne sont
  accessibles **qu'une fois le rapport `validated`** (404 avant, même règle
  que la lecture du rapport lui-même).

### Téléchargement PDF (rapport annuel uniquement)

Le parent peut télécharger le **bulletin annuel** en PDF (`GET
/reports/mine/{id}/pdf`) — pas les autres types, dont la mise en page
« bulletin par domaine » n'a pas de sens (422 si appelé sur un `quotidien`/
`bi_mensuel`). Réservé au parent (comme tout `/mine/*`), mêmes règles de
visibilité que le rapport lui-même (`validated` uniquement, sinon 404).

- Génération via **reportlab** (`reports/pdf.py`, `render_annual_report_pdf`)
  — rendu synchrone (bloquant), appelé via `asyncio.to_thread` depuis le
  service pour ne pas bloquer la boucle événementielle asyncio.
- Une table (domaine / notation / observation), un en-tête
  (établissement, enfant, période) — pas de template Jinja2/HTML→PDF : mise en
  page simple, reportlab suffit sans dépendance système supplémentaire
  (contrairement à weasyprint qui nécessite cairo/pango).
- `Content-Disposition: attachment` — le fichier est bien téléchargé, pas
  affiché inline dans le navigateur.

### Trois types, affectés par département (pas globalement)

```
ReportType : quotidien | bi_mensuel | annuel
```

Un département peut avoir **plusieurs types actifs simultanément** (ex:
quotidien + annuel, mais pas bi-mensuel). Un rapport ne peut être créé que si
son type est activé pour le département de l'enfant — sinon 422. Table
`department_report_types`, gérée par `reports:write`.

### Périodes — calculées automatiquement, jamais saisies à la main

À partir d'une `reference_date` (défaut aujourd'hui, ne peut pas être dans le
futur) :
| Type | Période | Exemple de `period_label` |
|---|---|---|
| `quotidien` | Le jour lui-même | « 20 juillet 2026 » |
| `bi_mensuel` | 1–15 ou 16–fin de mois (bi-mensuel = **deux fois par mois**, pas « tous les deux mois ») | « 16–31 juillet 2026 » |
| `annuel` | Année civile complète | « Année 2026 » |

Contrainte `UNIQUE(child_id, report_type, period_start)` : empêche deux
rapports du même type, pour le même enfant, sur la même période (409 sinon) —
la période elle-même sert de garde-fou anti-doublon, pas besoin de logique
applicative séparée.

### Circuit de validation — machine à états

```
draft ──submit──> submitted ──validate──> validated (publié au parent)
  ▲                    │
  └──────reject────────┘  (avec motif, conservé dans rejected_reason)
```

- **Modifiable** : l'**admin à tout moment** — même `submitted`/`validated`,
  même déjà lu par le parent (le statut ne change pas, aucune re-notification ;
  le parent voit le contenu corrigé à sa prochaine visite). Le **staff** reste
  limité à `draft` / `rejected`. Les médias suivent la même règle : ajout
  (`POST .../attachments`) et retrait (`DELETE .../attachments/{id}`) possibles
  pour l'admin quel que soit le statut.
- **Soumissible** depuis `draft` ou `rejected` (`rejected_reason` est effacé au
  moment de la resoumission — la prochaine décision de l'admin repart neuve).
- **Supprimable** (hard delete) **seulement en `draft` jamais soumis** — dès
  qu'un rapport a été soumis une fois, son historique est conservé.
- **Qui peut créer/modifier/soumettre** (`reports:write`, cumulatif avec la
  règle métier ci-dessous — la permission RBAC ouvre l'accès au module, la
  règle de groupe restreint ensuite QUELS enfants) :
  - **Éducatrice (staff)** : uniquement les enfants de son **propre groupe**
    (`Group.educatrice_id == current_user.id`, vérifié via `child.group_id`,
    PAS une vérification redondante de `staff_type` — la direction d'un
    groupe implique déjà `staff_type=educateur`, imposé à l'assignation dans
    le module Organisation).
  - **Admin** : n'importe quel enfant de l'établissement, sans restriction de
    groupe.
- **Qui valide/rejette** (`reports:validate`, **délégable** via RBAC — admin
  d'office, ou un staff de confiance type Directrice/Assistante de direction) :
  n'importe quel rapport `submitted` de l'établissement, sans restriction de
  groupe (contrairement à la création).

### ⚠️ Auto-publication quand l'auteur est admin

Quand `POST /reports/{id}/submit` est appelé par un **admin**, le rapport est
**validé et publié immédiatement dans le même appel** — pas de détour par
`submitted` en attente d'un validateur : personne n'est « au-dessus » de
l'admin pour approuver son propre rapport, l'aller-retour serait artificiel.
Décision explicitement confirmée avec l'utilisateur avant implémentation
(alternative envisagée : passer quand même par le circuit standard — écartée).
Un rapport soumis par un **staff** suit le circuit complet normal.

### Publication — portail parent + email (best-effort)

À la validation (explicite par un validateur, ou automatique si auteur=admin) :
- Le rapport devient visible via `GET /reports/mine/list` (parent) — **jamais**
  avant `validated` : un parent ne voit ni brouillons, ni rapports soumis, ni
  rejetés, seulement l'état final.
- Tous les comptes parents assignés à l'enfant (`child.parents`) reçoivent un
  email (`reports/templates/report_available.html`).
- **Best-effort, comme la messagerie (pas comme le mot de passe temporaire)** :
  un échec d'envoi est journalisé, jamais bloquant — le rapport reste
  consultable sur le portail indépendamment de la délivrance de l'email
  (contrairement au mot de passe temporaire, qui EST le seul canal de
  délivrance et bloque donc la création si l'email échoue, cf. module Parents).

### Endpoints
```
GET/POST/DELETE /api/v1/reports/settings/departments/{id}/types[/{report_type}]  # reports:write (GET: reports:read)

GET    /api/v1/reports/vocabulary         # reports:read — labels FR (mood, behavior_tag, ...)
POST   /api/v1/reports                    # reports:write (+ règle de groupe pour le staff)
GET    /api/v1/reports                    # reports:read — scope auto par groupe si staff
GET    /api/v1/reports/{id}
PATCH  /api/v1/reports/{id}               # admin : tout statut ; staff : draft/rejected — revalide le contenu
DELETE /api/v1/reports/{id}               # draft jamais soumis uniquement
POST   /api/v1/reports/{id}/submit        # admin → auto-validé ; staff → submitted
POST   /api/v1/reports/{id}/validate      # reports:validate
POST   /api/v1/reports/{id}/reject        # reports:validate — body {reason}
POST   /api/v1/reports/{id}/attachments               # reports:write — multipart (même règle de statut que PATCH)
DELETE /api/v1/reports/{id}/attachments/{attachment_id}  # retrait d'un média (même règle de statut que PATCH)
GET    /api/v1/reports/{id}/attachments/{attachment_id}

GET    /api/v1/reports/mine/list          # parent — rapports VALIDÉS de ses enfants
GET    /api/v1/reports/mine/{id}
POST   /api/v1/reports/mine/{id}/read
GET    /api/v1/reports/mine/{id}/attachments/{attachment_id}
GET    /api/v1/reports/mine/{id}/pdf      # bulletin annuel uniquement — 422 sur les autres types
```

> ⚠️ Chemins parent sous `/mine/list` et `/mine/{id}` (pas `/mine` seul), et
> `/vocabulary` placé **avant** `/{report_id}` dans le router — évite toute
> ambiguïté de routage (segments différents pour `/mine/*`, ordre de
> déclaration pour `/vocabulary` vs `/{report_id}` puisqu'ils ont la même
> forme à un segment). Vérifié explicitement au chargement de l'app à chaque
> ajout de route dans ce module.

### Isolation
Toutes les opérations sont bornées à `establishment_id`. Un rapport d'un autre
établissement → **404** partout (admin comme staff), cohérent avec tous les
autres modules.

---

## Module Galerie

Répertorie tous les médias (photos/vidéos) qui ont transité sur la plateforme,
pour deux usages :
- **Admin/staff délégué** : filtrer par enfant, groupe, département,
  éducatrice (auteur de l'upload), type de rapport, période.
- **Parent** : voir toutes les photos/vidéos de ses enfants, qu'elles viennent
  des rapports ou de sa messagerie privée avec l'établissement.

### Architecture : agrégation live, aucune nouvelle table

Décision explicite (confirmée avec l'utilisateur avant implémentation, avec 2
alternatives écartées : table d'index dédiée synchronisée à chaque upload, et
duplication complète des métadonnées). La galerie **ne stocke rien** : elle
interroge directement `report_attachments` (module Rapports) et `attachments`
(module Messagerie) à chaque requête, sans jamais dupliquer ni fichier ni
métadonnée — cohérent avec le principe déjà établi ailleurs dans le projet
(« pas de table polymorphe / pas de FK croisée entre modules indépendants »).

Deux relations ORM pures (aucune migration, pas de nouvelle colonne) ont été
ajoutées pour permettre à `gallery/service.py` de remonter jusqu'à
l'enfant/parent sans requête séparée par élément listé :
- `ReportAttachment.report` (`reports/models.py`)
- `Attachment.message` et `Message.conversation` (`messaging/models.py`)

Les URL de téléchargement renvoyées par la galerie **pointent toujours vers
les endpoints authentifiés déjà existants** de chaque module d'origine
(`/reports/{id}/attachments/{id}`, `/reports/mine/{id}/attachments/{id}`,
`/messaging/attachments/{id}`) — la galerie ne sert jamais elle-même un
fichier, elle ne fait qu'agréger et filtrer.

### Deux sources traitées différemment — décision explicite

Les pièces jointes de messagerie ne sont liées **qu'à un parent** (sa
conversation), jamais à un enfant précis (un parent peut avoir plusieurs
enfants) — contrairement aux pièces jointes de rapport, liées à un enfant, un
département, un groupe et un auteur. Plutôt que de modifier le module
Messagerie (volontairement simple, hors RBAC) pour y ajouter un tag enfant,
la décision retenue (confirmée avec l'utilisateur, 2 alternatives écartées :
tag enfant optionnel à l'envoi, attribution automatique si un seul enfant) est
de traiter la messagerie comme une **catégorie à part**, jamais filtrable par
enfant/groupe/département/éducatrice :

- **`source=report`** : filtrable par `child_id`, `group_id`, `staff_id`
  (auteur de l'upload, `ReportAttachment.uploaded_by_id`), `department_id`,
  `report_type`, `date_from`/`date_to`.
- **`source=message`** : filtrable seulement par date. Si un filtre propre aux
  rapports est posé (`child_id`, `group_id`, `staff_id`, `department_id`,
  `report_type`), la messagerie est **silencieusement exclue** du résultat
  (jamais une erreur : ces filtres n'ont simplement rien à y apporter).
- **Les diffusions (`Announcement`) sont toujours exclues** de la galerie,
  y compris côté admin — génériques à tout l'établissement, jamais « une
  photo de mon enfant » au sens de la demande initiale.

### Accès — décision explicite

- **Admin** : galerie complète (rapports + messagerie), toujours.
- **Staff** : nouvelle permission RBAC délégable `gallery:read` — mais
  **rapports uniquement**, jamais la messagerie (source=message → 403), qui
  reste hors RBAC et hors d'atteinte du staff partout ailleurs dans
  l'application (cf. module Messagerie). Établissement entier une fois la
  permission accordée, **pas de scoping par groupe** (contrairement à
  `reports:read`) — modèle de délégation de confiance, comme
  `reports:validate`, pas un outil d'auto-consultation par groupe.
- **Parent** : ses enfants uniquement — rapports **validés** de ses enfants +
  messages de **sa propre conversation** (jamais les diffusions).

> ⚠️ **`gallery:read` n'implique pas `reports:read`.** Un membre du staff avec
> seulement `gallery:read` voit la liste (miniatures, métadonnées), mais reçoit
> un 403 en cliquant l'URL de téléchargement d'un média de rapport — chaque
> permission garde son périmètre propre, aucun couplage caché entre modules.
> Si le staff délégué doit aussi pouvoir télécharger, l'admin doit inclure
> `reports:read` dans le même rôle RBAC. Documenté ici pour éviter la surprise
> côté frontend.

### Endpoints
```
GET /api/v1/gallery/media   # gallery:read — admin: tout ; staff: rapports uniquement
GET /api/v1/gallery/mine    # parent — ses enfants (rapports validés + messagerie propre)
```

Paramètres de `/gallery/media` : `source` (`report`/`message`), `child_id`,
`group_id`, `staff_id`, `department_id`, `report_type`, `date_from`,
`date_to`, `skip`, `limit`. Paramètres de `/gallery/mine` : `source`,
`child_id`, `skip`, `limit`.

### Isolation
Toutes les requêtes sont bornées à `establishment_id` — même principe que le
reste de l'application.

---

## Module Menus

Menu hebdomadaire (lundi–vendredi) informant les parents des repas servis par
l'établissement. Une semaine = 5 jours × 4 créneaux, **toujours dans cet ordre
réel des repas** : collation → déjeuner → dessert → goûter.

### Une ligne = une semaine pour UN département (plus de menu général)

Chaque menu appartient à **un département** (`department_id` obligatoire,
unicité `(establishment_id, department_id, week_start)`) — il n'existe plus de
menu « général » d'établissement. La réponse dénormalise `department_name`
(le parent ne peut pas appeler `/departments`, `organization:read` requis).

### Une ligne = une semaine entière, contenu typé (pas de `content: dict` ouvert)

Contrairement aux rapports, la structure ne varie jamais (toujours 5 jours ×
4 créneaux) : pas besoin d'une validation par type en service — le schéma de
requête FastAPI (`MenuCreateRequest`/`MenuWriteRequest`, `menus/schemas.py`)
suffit à lui seul à valider `content` à la frontière de l'API. Chaque créneau
(`collation`/`dejeuner`/`dessert`/`gouter`) est un `str | None` **facultatif**
(`min_length=1` si fourni, jamais de chaîne vide) — remplissage progressif au
fil de la semaine, pas besoin que tout soit prêt d'un coup.

`week_start` doit être un **lundi** exact (422 sinon, jamais snappé
silencieusement) — `week_end` (vendredi) est calculé, jamais saisi.

### Écriture — admin ou staff délégué (`menus:write`), jamais dans le passé

Nouvelle permission RBAC délégable `menus:write` — typiquement accordée à un
staff `staff_type=restaurateur`, mais **RBAC seul fait foi** : `staff_type`
reste une métadonnée descriptive sans effet sur les droits (cf. module Staff),
n'importe quel staff peut recevoir `menus:write` si l'admin le décide.
L'écriture couvre TOUS les départements (la restauration reste centrale) :
`department_id` passé en body (POST) ou query (PATCH/DELETE, 422 si absent),
vérifié dans l'établissement (404 sinon), 409 par (semaine, département).

**On ne réécrit jamais l'historique** : création, modification (`PATCH`,
remplace `content` en entier — pas de fusion partielle implicite, comme pour
les rapports) et suppression sont toutes les trois limitées à la semaine en
cours ou à venir (`week_start >= lundi de cette semaine`, 422 sinon).

### Lecture — scopée aux départements visibles

- **Admin / `menus:write`** : tous les départements (gestion).
- **Parent** : départements de SES enfants — multi-départements = tous les
  siens (`GET /current` renvoie UN menu par département visible).
- **Éducatrice** (≥ 1 groupe mené) : départements de ses groupes (menus:read
  du socle automatique + scope, cf. `ensure_educatrice_baseline_role`).
- **Autre staff** (aucun groupe, pas de `menus:write`) : tout, comme avant —
  seuls parents et éducatrices sont scopés (décision explicite).
- **`GET /menus/departments`** : départements visibles de l'appelant —
  alimente les sélecteurs UI sans passer par `/departments` (inaccessible
  parent). Placé AVANT `/{week_start}` dans le router.
- **Semaine passée** : réservé admin / `menus:write` / `menus:read` — 403 pour
  les autres. Le contrôle d'accès prime sur l'existence (403 avant 404) :
  périmètre d'abord, historique ensuite, existence en dernier.
- **`GET /menus`** (historique, `?department_id=` optionnel) : réservé admin /
  `menus:read` / `menus:write`, scopé aux départements visibles — jamais les
  parents (403, inchangé).

### Endpoints
```
POST   /api/v1/menus                # menus:write — department_id obligatoire, 409 par (semaine, dept)
PATCH  /api/v1/menus/{week_start}?department_id=  # menus:write — remplace le contenu entier
DELETE /api/v1/menus/{week_start}?department_id=  # menus:write
GET    /api/v1/menus?department_id=  # admin/menus:read/menus:write — historique scopé, paginé
GET    /api/v1/menus/departments      # départements visibles (sélecteurs UI)

GET    /api/v1/menus/current         # UN menu par département visible (liste, éventuellement vide)
GET    /api/v1/menus/{week_start}?department_id=  # 403 hors périmètre, 403 historique sans droit, 404 si rien
```

> ⚠️ `/departments` et `/current` placés **avant** `/{week_start}` dans le
> router — même précaution de routage que `/vocabulary` (rapports).

### Registre central — leçon apprise

`menus/models.py` manquait dans `app/core/models.py` (`WeeklyMenu` figurait
dans `__all__` mais l'import avait été oublié) : l'app tournait quand même
(import en cascade via le router), mais **l'autogenerate Alembic ne voyait
jamais la table** et proposait de la SUPPRIMER à chaque revision (fantôme
`weekly_menus` croisé deux fois avant diagnostic). Règle durcie : après ajout
au registre, relancer un `alembic revision --autogenerate` à vide pour vérifier
qu'il ne détecte rien d'inattendu.

### Isolation
Toutes les requêtes sont bornées à `establishment_id` — même principe que le
reste de l'application.

---

## Module Blog

Actualités du **site vitrine** (page publique) : actualités, événements,
projets pédagogiques, etc. Rédigées et publiées par l'admin ou un staff
délégué (`blog:write` — typiquement `staff_type=redacteur`, mais RBAC seul
fait foi, même principe que partout ailleurs).

### ⚠️ Seule exception du projet à « toujours authentifié »

La consultation (liste, détail, image à la une, médias) est **volontairement
publique, sans jeton JWT** — décision explicite confirmée avec l'utilisateur
(alternative écartée : ouvert seulement aux comptes connectés, comme le
module Menus). Un site vitrine sert justement à être visible par des
visiteurs sans compte. C'est la **seule** donnée de toute l'application
exposée sans authentification — partout ailleurs, y compris les pièces
jointes, tout passe par un token.

- **Router authentifié** (`blog/router.py`, prefix `/blog`) : gestion —
  CRUD articles/étiquettes, upload cover/médias, workflow de publication.
  Réservé à `blog:write` (admin ou staff délégué). Inclut aussi la
  consultation interne (brouillons compris) — pas de vue lecture séparée
  pour le reste du staff/les parents, qui consultent comme n'importe quel
  visiteur via le router public.
- **Router public** (`blog/public_router.py`, prefix `/public/blog`) :
  **aucune dépendance d'authentification**. Scopé par `establishment_code`
  (le code court déjà utilisé comme préfixe de matricule, ex. `LPRDS`) plutôt
  que par UUID — n'expose jamais d'identifiant interne dans une URL publique.
  Ne renvoie **jamais** que du contenu `published` + `is_active=True` — la
  garde est dans `service.py` (`list_public_articles`/`get_public_article`/
  `get_public_cover`/`get_public_attachment`), pas seulement dans le router.

### Portée : par établissement, jamais un blog global

Chaque établissement a ses propres actualités/étiquettes, visibles uniquement
sur son propre site (`/public/blog/{code}/...`) — cohérent avec l'isolation
stricte par `establishment_id` appliquée partout ailleurs (décision
explicite, alternative « blog global partagé » écartée).

### Étiquettes : liste libre, pas un enum fermé

Contrairement à `Mood`/`HealthStatus`/etc., l'étiquette d'un article
(`BlogTag`) est une **vraie table**, créée à la volée par l'admin/rédacteur
(`POST /blog/tags`) — décision explicite de l'utilisateur (« le rédacteur ou
l'admin doit pouvoir créer des étiquettes à sa guise »), pas un vocabulaire
figé en code comme le reste de l'application. Nom unique par établissement
(409 sinon). Suppression d'une étiquette = **suppression définitive** (pas de
soft delete pour les étiquettes elles-mêmes) ; les articles qui la
portaient passent silencieusement à `tag=None` (`ON DELETE SET NULL`).

### Workflow : brouillon → publication explicite

```
draft ──publish──> published
```
Décision explicite (alternative « publication immédiate à la création »
écartée) : un article se prépare en brouillon (titre, contenu, image à la
une, médias) avant d'être rendu public via `POST /articles/{id}/publish`.

- **`publish` exige une image à la une ET une étiquette** (422 sinon) — les
  trois attributs cités par la demande initiale (image à la une, titre,
  contenu) doivent être réunis avant l'exposition publique ; `title`/
  `content` sont déjà garantis non vides dès la création.
- **Republier un article déjà publié → 409** (pas d'effet, pas de nouvelle
  date de publication silencieuse).
- **Modifiable en brouillon COMME après publication** (demande explicite —
  contrairement aux rapports, verrouillés après soumission) : `PATCH`
  fonctionne à tout moment tant que l'article n'est pas soft-deleted.

### Image à la une vs médias — deux mécanismes distincts

- **Image à la une** : UNE seule, colonnes directes sur `Article`
  (`cover_filename`/`cover_content_type`/`cover_size_bytes`/
  `cover_storage_key`), pas de table à part (relation strictement 1–1).
  Upload en 2 temps comme partout (`POST /articles/{id}/cover`, remplace
  l'image existante — l'ancien fichier est supprimé du stockage). Doit être
  une **image** (`content_type` commençant par `image/`), jamais une vidéo
  (422 sinon), même si le type autorisé pour les médias inclut la vidéo.
- **Médias (galerie)** : table dédiée `article_attachments` (même pattern que
  `ReportAttachment`/messaging `Attachment` — pas de polymorphisme entre
  modules), liste illimitée d'images/vidéos, upload/suppression indépendants
  de l'article. `BLOG_MAX_ATTACHMENT_MB` (défaut 50 Mo) et
  `BLOG_ALLOWED_ATTACHMENT_TYPES`. Idem rapports : **tout MIME `image/*` ou
  `video/*` est accepté**, seul `image/svg+xml` est rejeté.

### Suppression : soft delete explicite (demande utilisateur)

`DELETE /blog/articles/{id}` ne fait jamais disparaître la ligne — bascule
`is_active=False`. Un article désactivé :
- disparaît immédiatement du site public (même s'il était `published`) ;
- reste visible et consultable **côté gestion** (utile pour audit/restauration
  manuelle future — pas d'endpoint de restauration pour l'instant, non
  demandé) ;
- devient **non modifiable** (`PATCH` → 409) — cohérent avec « supprimé »,
  même en soft delete.

`GET /blog/articles` exclut les inactifs par défaut ; `?include_inactive=true`
les inclut (vue de gestion complète, réservée à `blog:write`).

### Endpoints
```
# Gestion (authentifiée, blog:write)
POST   /api/v1/blog/tags
GET    /api/v1/blog/tags
PATCH  /api/v1/blog/tags/{tag_id}
DELETE /api/v1/blog/tags/{tag_id}                       # suppression définitive

POST   /api/v1/blog/articles                            # créé en draft
GET    /api/v1/blog/articles                             # ?status= &tag_id= &include_inactive= &skip= &limit=
GET    /api/v1/blog/articles/{id}
PATCH  /api/v1/blog/articles/{id}                        # draft ou published, jamais si soft-deleted
DELETE /api/v1/blog/articles/{id}                        # soft delete
POST   /api/v1/blog/articles/{id}/publish                # 422 si pas de cover/étiquette
POST   /api/v1/blog/articles/{id}/cover                  # multipart — remplace l'image existante
GET    /api/v1/blog/articles/{id}/cover                  # aperçu authentifié (tout statut)
POST   /api/v1/blog/articles/{id}/attachments             # multipart
GET    /api/v1/blog/articles/{id}/attachments/{aid}
DELETE /api/v1/blog/articles/{id}/attachments/{aid}

# Consultation (PUBLIQUE, sans authentification, site vitrine)
GET /api/v1/public/blog/{establishment_code}/articles              # published + actifs uniquement
GET /api/v1/public/blog/{establishment_code}/articles/{id}
GET /api/v1/public/blog/{establishment_code}/tags
GET /api/v1/public/blog/{establishment_code}/articles/{id}/cover
GET /api/v1/public/blog/{establishment_code}/articles/{id}/attachments/{aid}
```

### Isolation
Toutes les opérations authentifiées sont bornées à `establishment_id` ; côté
public, le scoping se fait via `establishment_code` (l'établissement doit en
plus être `is_active`, sinon 404 — un établissement désactivé n'a plus de
site vitrine visible).

---

## Variables d'environnement

### Backend — `lprds-backend/.env`
```env
APP_NAME=LPRDS Backend
APP_ENV=development
DEBUG=true
DATABASE_URL=postgresql+asyncpg://adminlprds:lprds@localhost:5432/lprds_database
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=<hex 32 bytes>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30
RESET_TOKEN_EXPIRE_MINUTES=60
FRONTEND_URL=http://localhost:3000
# Anti brute-force /auth/login — cf. section Authentification
LOGIN_RATE_LIMIT_MAX_ATTEMPTS=5
LOGIN_RATE_LIMIT_WINDOW_SECONDS=300
# Origines CORS supplémentaires (séparées par des virgules).
# FRONTEND_URL est toujours autorisée — inutile de la répéter ici.
CORS_EXTRA_ORIGINS=
MAIL_USERNAME=<mailtrap>
MAIL_PASSWORD=<mailtrap>
MAIL_FROM=noreply@lespetitsrayonsdesoleil.fr
MAIL_FROM_NAME=LPRDS
MAIL_PORT=587
MAIL_SERVER=sandbox.smtp.mailtrap.io
MAIL_STARTTLS=true
MAIL_SSL_TLS=false
# Dev/test : n'établit aucune connexion SMTP, les emails sont ignorés (défaut false)
MAIL_SUPPRESS_SEND=false
STORAGE_BACKEND=local
STORAGE_LOCAL_PATH=./media
# Pièces jointes messagerie (défauts si absent : 10 Mo, 50 Mo vidéo) — tout
# MIME image/* est accepté en plus de la liste (sauf image/svg+xml) ; tout
# MIME video/* est accepté UNIQUEMENT dans les conversations privées (les
# diffusions restent images + PDF), avec son propre plafond vidéo.
MESSAGING_MAX_ATTACHMENT_MB=10
MESSAGING_MAX_VIDEO_MB=50
MESSAGING_ALLOWED_ATTACHMENT_TYPES=image/jpeg,image/png,image/gif,image/webp,application/pdf
# Pièces jointes rapports (défauts si absent : 50 Mo) — tout MIME image/* ou
# video/* est accepté en plus de la liste (sauf image/svg+xml)
REPORTS_MAX_ATTACHMENT_MB=50
REPORTS_ALLOWED_ATTACHMENT_TYPES=image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm
# Pièces jointes blog (défauts si absent : 50 Mo) — même sur-ensemble image/*
# ou video/* sauf image/svg+xml. L'image à la une est en plus filtrée aux
# seuls types "image/*" (cf. blog/service.py)
BLOG_MAX_ATTACHMENT_MB=50
BLOG_ALLOWED_ATTACHMENT_TYPES=image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm
```

### Frontend — `lprds-frontend/.env`
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=LPRDS - Gestion Crèche
# Code court unique de l'établissement (préfixe de matricule, ex. LPRDS) —
# sert de scope aux endpoints PUBLICS du site vitrine (/api/v1/public/blog/{code}/…)
NEXT_PUBLIC_ESTABLISHMENT_CODE=LPRDS
```

---

## Commandes de développement

### Backend
```bash
cd ~/lprds-backend
source .venv/bin/activate

# Démarrer le serveur
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Créer le premier superadmin
python -m app.core.seed

# Nouvelle migration
alembic revision --autogenerate -m "description"
alembic upgrade head

# Vérifier la syntaxe d'un fichier
python -c "import py_compile; py_compile.compile('app/modules/auth/models.py')"

# Suite de tests (cf. section "Tests automatisés" plus bas)
pytest

# Avec Docker (backend + Postgres + Redis, migrations auto au démarrage)
docker compose up --build
```

### Frontend
```bash
cd ~/lprds-frontend

# Démarrer le serveur de dev
pnpm dev

# Vérifications avant commit
pnpm type-check
pnpm lint
pnpm build

# Ajouter un composant shadcn
pnpm dlx shadcn@latest add <composant>
```

---

## Tests automatisés

Suite pytest committée (`tests/`), portée à partir des scripts E2E manuels
utilisés pendant tout le développement du projet — même méthode, désormais
rejouable en CI/localement au lieu de vivre dans un répertoire jetable.

### Architecture : un vrai serveur, un schéma Postgres dédié

`tests/conftest.py` démarre un **vrai serveur uvicorn** (thread dédié, une
fois par session pytest) servant la même app FastAPI qu'en prod ; les tests
tapent dessus en HTTP via un client `httpx` synchrone — exactement la méthode
validée manuellement tout au long du projet, simplement automatisée.

**Isolation des données** : plutôt qu'une base Postgres séparée (`CREATEDB`
non disponible pour le rôle applicatif dans cet environnement), les tests
tournent dans un **schéma Postgres dédié** (`db_schema` dans
`app/core/config.py`, valeur fixe `pytest`) de la **même base** que le dev —
jamais dans `public`. Mécanisme :
- `app/core/database.py` et `migrations/env.py` acceptent tous les deux un
  `connect_args={"server_settings": {"search_path": "<schema>,public"}}`
  quand `settings.db_schema` est défini — **vide par défaut, donc strictement
  aucun effet en dev/prod** (`DB_SCHEMA` n'est jamais positionné hors tests).
- `tests/conftest.py` définit `DB_SCHEMA=pytest` dans `os.environ` **avant**
  le premier import de `app.core.config` (singleton résolu à l'import), crée
  le schéma, migre via Alembic (`command.upgrade(cfg, "head")`, programmatique),
  puis le supprime en fin de session (`DROP SCHEMA ... CASCADE`).
- **Garde de sécurité explicite** : si `DB_SCHEMA` résout à `public` ou une
  chaîne vide, la session pytest refuse de démarrer (`RuntimeError`) — aucun
  risque de vider la base de dev par erreur de configuration.
- Avant **chaque test** (fixture `autouse`), un moteur SQLAlchemy jetable
  (créé et `dispose()` à l'intérieur du même `asyncio.run()`, jamais partagé
  entre deux appels — évite tout risque de connexion asyncpg recyclée d'une
  boucle asyncio fermée à une autre) exécute `TRUNCATE TABLE establishments
  CASCADE` puis réinsère le superadmin — même discipline de reset que les
  scripts manuels utilisés pendant le développement.

**Isolation Redis** : même principe, mais par **index de base** plutôt que
par schéma (Redis n'a pas l'équivalent) — `tests/conftest.py` force
`REDIS_URL` sur l'index **15** (jamais le 0 du dev) avant le premier import
de `app.core.config`, et `FLUSHDB` cet index avant **chaque test**. Sans ça,
un compteur de rate-limit (`login_attempts:...`) ou un token révoqué posé par
un test contaminerait soit la session dev, soit le test suivant — les clés
Redis n'étant pas scopées comme les tables Postgres le sont par schéma.

### Lancer les tests

```bash
pytest                              # toute la suite
pytest tests/e2e/test_blog.py -v    # un seul module
pytest -k reports                   # par mot-clé
```

Aucune étape manuelle requise : le schéma de test, les migrations et le
superadmin sont entièrement pris en charge par `conftest.py`. Le `.env` du
dev (`DATABASE_URL`, `REDIS_URL`) sert de base — seuls le `search_path`
(Postgres) et l'index de base (Redis) sont dérivés pour les tests, jamais
la base, l'hôte ni le port.

### Contenu de la suite

```
tests/
├── conftest.py                          # infra : schéma, migrations, serveur live, reset
├── helpers.py                           # ck/login/onboard/PNG partagés
└── e2e/
    ├── test_smoke.py                    # santé de l'infra elle-même
    ├── test_core_modules_smoke.py       # golden path : auth, RBAC, organisation,
    │                                     #   enfants, parents, staff, présences, messagerie
    ├── test_reports_workflow.py         # cycle de vie complet (soumission/validation/rejet)
    ├── test_reports_daily_content.py    # contenu structuré quotidien + pièces jointes
    ├── test_reports_bimensuel_content.py
    ├── test_reports_annuel_content.py   # + génération PDF
    ├── test_gallery.py                  # agrégation rapports/messagerie, filtres RBAC
    ├── test_menus.py                    # lecture ouverte vs historique restreint
    ├── test_blog.py                     # workflow publication, soft delete, accès PUBLIC
    ├── test_messaging_scope_and_media.py # diffusions ciblées par départements, vidéo en conversations
    └── test_hardening.py                # rate limiting /auth/login, format d'erreur uniforme
```

`test_core_modules_smoke.py` couvre le **golden path** des modules construits
avant Rapports/Galerie/Menus/Blog (jamais portés en script E2E jusqu'ici) —
pas une couverture exhaustive des cas limites, qui existe déjà côté
rapports/galerie/menus/blog. À enrichir au fil de l'eau si des régressions y
apparaissent.

> Convention : `ck(label, got, exp)` (dans `tests/helpers.py`) reste utilisée
> à la place d'un `assert` nu — un test E2E enchaîne des dizaines de
> vérifications sur un même scénario monté une fois ; le libellé permet de
> voir immédiatement QUEL contrôle métier a échoué, sans relire tout le corps
> du test.

### Dates dans les tests

Jamais de date codée en dur pour une comparaison au « aujourd'hui » serveur
(ex: le module Menus compare `week_start` à la semaine en cours) — toujours
calculée par rapport à `date.today()` au moment de l'exécution (cf.
`test_menus.py`). Un test committé doit rester valide indéfiniment, contrairement
à un script manuel ponctuel où une date figée pour la session suffisait.

---

## Docker

`Dockerfile` (image unique, `docker/entrypoint.sh` exécute `alembic upgrade
head` puis `python -m app.core.seed` avant `uvicorn`) + `docker-compose.yml`
(Postgres 16, Redis 7, backend — healthchecks, volumes nommés pour les
données Postgres et les fichiers uploadés).

```bash
docker compose up --build
```

`DATABASE_URL`/`REDIS_URL` sont **surchargées** dans `docker-compose.yml` vers
les noms de service Docker (`db`, `redis`) quoi que dise le `.env` local (qui
pointe vers `localhost` pour un usage hors conteneur) — évite le piège
classique « ça marche en local mais pas en conteneur ».

> ⚠️ Le build Docker n'a **pas** pu être testé dans l'environnement où ces
> fichiers ont été écrits (`docker` indisponible). Fichiers relus attentivement
> mais à valider avec un vrai `docker compose up --build` avant de s'y fier
> en CI/déploiement.

---

## `.env.example`

Gabarit de toutes les variables lues par `app/core/config.py`, à copier en
`.env` (jamais commité — `.gitignore`). Ajouter une variable à `Settings` sans
la documenter ici est considéré comme un oubli — c'est le seul point de
référence pour quiconque clone le repo (nouvelle recrue frontend comprise).

---

## Conventions de code

### Backend — règles absolues
- **📝 Tout nouveau module DOIT être documenté dans ce fichier**, dans le même
  passage que le code : structure des dossiers, endpoints, règles métier,
  variables d'env. Ce fichier est le contexte lu au début de chaque session —
  s'il diverge du code, les sessions suivantes travaillent sur une carte périmée.
- **Architecture modulaire** : un dossier par domaine métier dans `app/modules/`
- **Modèles ajoutés au registre** `app/core/models.py` (cf. section dédiée)
- **Séparation stricte** : `models.py` → `schemas.py` → `service.py` → `router.py`
- **Le router n'accède JAMAIS à la DB directement** — toujours via le service
- **Toujours async** : toutes les fonctions de service et router sont `async def`
- **`await db.flush()`** après les `db.add()` pour générer l'ID sans commit (le commit se fait dans `get_db`)
- **Messages d'erreur génériques** sur login (pas d'énumération d'emails)
- **UUIDs** pour toutes les clés primaires
- **Timestamps** `created_at` / `updated_at` sur tous les modèles
- **Politique de mot de passe centralisée** : utiliser le type `StrongPassword`
  de `auth/schemas.py`, ne pas redéfinir de validator (min 8 + majuscule + chiffre)
- **Les invariants métier se vérifient dans le service**, jamais dans le schéma
  Pydantic — et pensez aux autres chemins qui pourraient les contourner
- **`HTTPException.detail` est toujours une chaîne**, jamais une liste/dict,
  sur toute erreur métier levée à la main (4xx applicatifs). Seules les 422
  générées automatiquement par FastAPI (corps de requête malformé, avant même
  d'entrer dans le service) gardent le format liste natif — hors du contrôle
  de l'application. Piège vécu : `reports/service.py` construisait `detail`
  directement depuis `ValidationError.errors()` (une liste) pour le contenu
  structuré des rapports — le seul endpoint qui dérogeait à la règle. Corrigé
  en aplatissant les erreurs Pydantic en un message texte unique, pour qu'un
  frontend affichant génériquement `error.detail` n'ait jamais à distinguer
  un cas particulier.

### Frontend — règles absolues
- **`'use client'`** uniquement sur les composants avec état ou événements
- **Jamais de `any`** TypeScript — `warn` dans ESLint, viser `error`
- **Toujours `cn()`** pour les classes Tailwind conditionnelles
- **Gestion d'erreur via `getApiErrorMessage()`** — jamais de `error.message` brut
- **Animations Framer Motion** : `initial={{ opacity: 0, y: 24 }}` + `animate={{ opacity: 1, y: 0 }}` pour les pages
- **Validation Zod** sur tous les formulaires via `zodResolver`
- **Imports** : toujours via alias `@/` (ex: `@/components/ui/button`)

### Nommage
```
Backend  : snake_case pour tout (Python)
Frontend : camelCase variables/fonctions, PascalCase composants, kebab-case fichiers de routes
Types    : PascalCase interfaces, SCREAMING_SNAKE pour les constantes
```

---

## Points d'attention critiques

### Sécurité
- **Données d'enfants = données sensibles** soumises au RGPD
- **Row-Level Security** à activer sur PostgreSQL en production
- **Audit log** à implémenter sur toutes les actions sur les profils enfants
- **`must_change_pwd=True`** par défaut à la création de compte, **imposé côté
  API** via `get_active_user` (403) — pas seulement par le frontend
- **Révocation de tokens** active (blacklist `jti` dans Redis, fail-closed en 503)
- **Jamais de mot de passe en clair dans un email** — c'est pourquoi la création
  d'admin via établissement n'envoie pas d'email
- **Rate limiting** encore absent sur `/auth/login` et `/auth/password-reset` —
  à implémenter (Redis est déjà branché)

### Performance
- Utiliser `select` SQLAlchemy pour les requêtes (pas `session.query()`)
- `lazy="selectin"` sur les relations pour éviter les N+1
- **`__mapper_args__ = {"eager_defaults": True}` sur tout modèle ayant un
  `onupdate=func.now()`** : sans ça, l'attribut est expiré après un UPDATE et sa
  lecture déclenche un lazy-load interdit en async (`MissingGreenlet` → 500).
  Les INSERT n'ont pas le problème (RETURNING automatique), les UPDATE si.
- **`await db.refresh(obj)` après un flush si la réponse expose une relation
  renseignée par sa FK** : poser `child.department_id = x` ne charge PAS
  `child.department`, et `lazy="selectin"` ne joue qu'au chargement par requête,
  pas sur un objet fraîchement `add()`. Sans refresh → `MissingGreenlet` → 500.
  C'est le même symptôme que ci-dessus mais une cause différente.
- Partitionner la table `presences` par mois/année quand elle grossit
- Cache Redis pour les plannings et taux d'occupation

### Compatibilité
- Environnement de développement : **WSL2 Ubuntu** sur Windows
- PostgreSQL et Redis tournent dans WSL2
- Accès depuis Windows via `localhost`
- **Ne jamais travailler dans `/mnt/c/`** — performances I/O catastrophiques

---

## Phase 2 — Notifications Push (PWA)

### Contexte
La Phase 2 étend le PWA (Phase 1 complete) en ajoutant les notifications push Web pour deux types d'événements :
- **Messagerie** : nouveau message admin↔parent, nouvelle diffusion
- **Rapports** : rapport validé → notification aux parents

### Architecture technique
- **Clés VAPID** générées via `py_vapid`, stockées dans `backend/.env` (`VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`) et exposées via `GET /api/v1/notifications/vapid-public-key`
- **Bibliothèque** : `pywebpush 2.5.0` (dépendance `base` ajoutée à `requirements/base.txt`)
- **Modèle** : `push_subscriptions` table (migration `fe76c1320d23`) stockant l'endpoint, les clés p256dh/auth et l'associations user/établishment
- **Rate-limiting** : les tentatives de push échouent silencieusement (best-effort), jamais d'erreur HTTP remontée

### Module backend `app/modules/notifications/`
Nouveau module créé avec :
- `models.py` — modèle `PushSubscription` (user_id FK, establishment_id, endpoint, p256dh, auth_key)
- `schemas.py` — schémas Pydantic `PushSubscriptionCreate`, `PushSubscriptionResponse`, `PushSubscriptionDelete`
- `service.py` — fonctions CRUD + `send_push_to_subscription()`, `send_push_to_establishment_parents()`, `send_push_to_establishment_admins()`, `_send_report_push_notifications()`
- `router.py` — endpoints `POST /subscriptions`, `DELETE /subscriptions/{id}`, `GET /vapid-public-key`, `GET /test`

### Intégration dans les modules existants
- **Messagerie** (`app/modules/messaging/service.py`) :
  - `send_message()` : push aux admins de l'établissement après publication
  - `create_announcement()` : push à l'audience de la diffusion (tous les parents, ou parents des départements ciblés) après diffusion
- **Rapports** (`app/modules/reports/service.py`) :
  - `validate_report()` : push aux parents en plus des emails après validation
  - `submit_report` (admin) : push aux parents après validation immédiate
  - `_send_report_push_notifications()` : nouvelle fonction d'envoi push

### Intégration frontend
- `frontend/src/lib/push-subscription.ts` — hook `usePushSubscription` gérant :
  - Détection support navigateur
  - Demande de permission `Notification.requestPermission()`
  - Récupération de la clé VAPID publique via `GET /api/v1/notifications/vapid-public-key`
  - Abonnement `navigator.serviceWorker.pushManager.subscribe()`
  - Envoi de l'abonnement au backend `POST /api/v1/notifications/subscriptions`
  - Désabonnement `DELETE /api/v1/notifications/subscriptions`
- `frontend/public/sw.js` — handlers `push` et `notificationclick` :
  - Sur `push` : montre une notification avec titre/corps/icône depuis le payload JSON
  - Sur `notificationclick` : focalise la fenêtre d'application existante ou ouvre `/`

### Événements push notifiés
- **Messagerie** : nouvel message (title/body avec noms), diffusion admin→parent
- **Rapports** : rapport validé (title/body avec nom de l'enfant, période)

### Sécurité
- Les clés VAPID privées ne sont JAMAIS exposées au frontend (seule la clé publique l'est)
- Les abonnements sont associés à un `user_id` et `establishment_id`
- L'échec d'envoi push est journalisé, jamais bloquant (best-effort, comme les emails de rapport)
- Les permissions Notification sont demandées par l'utilisateur via l'interface

### Dépendances ajoutées
- `pywebpush==2.5.0` dans `requirements/base.txt`
- `py-vapid==1.9.4` (déjà présent, utilisé pour la génération des clés)
- Nouvelle table BDD : `push_subscriptions`
- Module `app/modules/notifications/` complet

### Tests
- Backend : `pytest` (les tests e2e ont des dépendances de configuration de serveur)
- Frontend : `pnpm lint && pnpm type-check && pnpm build`

---

## URLs de développement

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| Health check (liveness) | http://localhost:8000/health/live |
| Health check (readiness — vérifie DB + Redis) | http://localhost:8000/health/ready |

---

## Compte de test

```
Email    : tech@lespetitsrayonsdesoleil.fr
Password : Geek-Ot@ku#2002   (à changer au premier login)
Rôle     : superadmin
```

---
