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
| openpyxl | 3.1.5 | Génération Excel de l'export présences (module Présences) |

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
│   ├── database.py                # Engine SQLAlchemy async + get_db + task_sessions()
│   ├── models.py                  # ⚠️ Registre central des modèles (cf. ci-dessous)
│   ├── redis.py                   # Client Redis async partagé
│   ├── storage.py                 # Stockage fichiers (backend local uniquement)
│   ├── rate_limit.py              # Anti brute-force générique (INCR+EXPIRE Redis)
│   ├── i18n.py                    # Locale, t(), ContextVar de requête, format_long_date()
│   ├── translation.py             # Traduction auto du contenu saisi (SDK Anthropic)
│   ├── translation_models.py      # TranslationMemory — séparé pour que le registre
│   │                              #   n'ait pas à importer le SDK
│   └── seed.py                    # Script seed superadmin (idempotent)
├── locales/
│   ├── fr.py / en.py              # Catalogues plats (334 clés/langue)
│   └── __init__.py                # CATALOGS
├── modules/
│   ├── auth/
│   │   ├── models.py              # User, UserRole (StrEnum)
│   │   ├── schemas.py             # Pydantic v2 I/O + type StrongPassword
│   │   ├── security.py            # JWT, bcrypt, reset token, révocation Redis
│   │   ├── email.py               # Envoi emails via fastapi-mail + Jinja2
│   │   ├── service.py             # Logique métier auth
│   │   ├── router.py              # Endpoints HTTP /auth/*
│   │   ├── dependencies.py        # get_current_user, require_roles()
│   │   └── templates/{fr,en}/     # HTML emails (welcome_*, reset_password) — un dossier par langue
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
│   │   ├── models.py              # AttendanceEvent, *AttendanceSettings, StaffAttendanceSchedule
│   │   ├── schemas.py             # Pydantic v2 I/O schemas (horaires staff + export)
│   │   ├── service.py             # Scan, calcul présence/retard/absence à la volée, export agrégé
│   │   ├── export.py              # Rendu PDF (reportlab) + Excel (openpyxl) de l'export présence
│   │   ├── email.py + templates/  # Enquête d'absence envoyée aux parents (best-effort)
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
│   │   ├── tasks.py               # Reprise planifiée des traductions manquantes
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
│   │   ├── tasks.py               # Reprise planifiée des traductions manquantes
│   │   ├── dependencies.py        # get_establishment_member (lecture ouverte à tous)
│   │   └── router.py              # Endpoints HTTP /menus/*
│   ├── blog/                      # ⚠️ SEUL module avec un volet public sans authentification
│   │   ├── models.py              # BlogTag (libre), Article (draft/published, soft delete), ArticleAttachment
│   │   ├── schemas.py             # Schémas gestion (internes) + publics (site vitrine)
│   │   ├── service.py             # Workflow publication, soft delete, requêtes publiques scopées establishment_code
│   │   ├── router.py              # /blog/* — authentifié, blog:write
│   │   ├── tasks.py               # Reprise planifiée des traductions manquantes
│   │   └── public_router.py       # /public/blog/* — AUCUNE authentification
│   ├── library/
│   │   ├── models.py              # Livres, prêts, paramètres bibliothèque
│   │   ├── schemas.py / service.py / router.py / dependencies.py
│   │   ├── tasks.py               # Relances des prêts en retard + reprise des traductions
│   │   └── email.py + templates/  # Emails de rappel (best-effort)
│   └── notifications/             # Push Web (PWA Phase 2) — cf. section dédiée
│       ├── models.py              # PushSubscription
│       └── schemas.py / service.py / router.py
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
messages/                          # Catalogues de traduction — ~1830 clés par langue
├── fr/ · en/                      # 19 domaines JSON (admin, auth, blog, errors, enums…)
└── {fr,en}/index.ts               # ⚠️ Tout nouveau domaine DOIT y être enregistré

scripts/
├── check-messages.mjs             # Clé appelée absente du catalogue
├── check-hardcoded-text.mjs       # Texte visible en dur dans le JSX (analyse AST)
├── check-zod-messages.mjs         # Messages de validation Zod en français
├── check-private-routes.mjs       # Route échappant à la garde d'authentification
└── stamp-version.mjs              # public/version.json au build (PWA auto-update)

src/
├── i18n/
│   ├── routing.ts                 # LOCALES, localePrefix 'as-needed', asAppLocale()
│   ├── use-locale-switch.ts       # Le geste de bascule — cookie + compte + navigation
│   ├── client-locale.ts           # clientLocale() — URL puis cookie, hors React
│   ├── slugs.ts                   # Slugs publics traduits (/a-propos ↔ /en/about)
│   ├── detect.ts                  # Règle de détection (FR seulement si préféré)
│   ├── navigation.ts              # ⚠️ SEULE source de Link/useRouter/usePathname
│   ├── request.ts                 # Chargement des catalogues
│   └── metadata.ts                # localePath() / localeAlternates() (hreflang)
├── app/
│   ├── layout.tsx                 # Root layout (Providers + Toaster) + métadonnées PWA
│   ├── globals.css                # Tailwind v4 + variables CSS shadcn
│   ├── providers.tsx              # QueryClientProvider React Query
│   ├── manifest.ts                # Manifest Web App (PWA) — /manifest.webmanifest
│   ├── sitemap.ts                 # Les deux langues
│   └── [locale]/                  # ⚠️ TOUTES les routes vivent sous ce segment
│       ├── offline/page.tsx       # Page hors-ligne (fallback du service worker)
│       ├── (marketing)/           # Site vitrine public (a-propos, galerie, actualités…)
│       ├── auth/                  # login, reset-password, new-password
│       └── dashboard/             # super, admin, staff, parent
├── components/
│   ├── locale-switcher.tsx        # Menu de langue (en-tête vitrine + espaces)
│   ├── dashboard/
│   │   └── language-settings-card.tsx  # Même geste, en RÉGLAGE, dans les 4 espaces
│   ├── menus/
│   │   └── menu-translation-dialog.tsx  # Relecture FR/EN d'une semaine de menus
│   ├── pwa/pwa-provider.tsx       # Enregistrement SW + prompt d'installation + voile hors-ligne
│   └── ui/                        # Composants shadcn (button, input, card, form, sonner...)
├── lib/
│   ├── api/
│   │   ├── client.ts              # Axios + intercepteurs JWT + refresh auto
│   │   └── auth.api.ts            # Appels API auth
│   ├── i18n/labels.ts             # useLabel() / useLabelMap() — libellés d'énumération
│   ├── hooks/
│   │   └── use-report-vocabulary.ts  # Vocabulaire rapports, locale dans la clé de cache
│   ├── stores/
│   │   └── auth.store.ts          # Store Zustand (session + tokens)
│   └── utils/
│       ├── api-error.ts           # getApiErrorMessage() — lit le cookie de langue
│       ├── locale-format.ts       # intlLocale() (fr→fr-FR, en→en-GB), intlLocaleFor()
│       └── cn.ts                  # Utilitaire Tailwind merge
├── types/
│   ├── auth.ts                    # UserRole, User, TokenResponse, ROLE_HOME...
│   └── api.ts                     # ApiResponse<T>, PaginatedResponse<T>
└── middleware.ts                   # Langue + garde auth/rôle (cf. § Internationalisation)

public/
├── sw.js                          # Service worker PWA (app shell + vitrine)
├── icons/                         # Icônes PWA (192/512, maskable, apple-touch, favicon)
└── images/                        # Assets marketing (dont images du site)
```

### PWA — coque d'application installable (Phase 1)

La plateforme est installable comme une application native (mobile/desktop) :
**manifest**, **service worker** (hors-ligne), **bouton d'installation** et
**voile hors-ligne**. La **Phase 2 (notifications push Web)** est implémentée — cf. section
« Phase 2 — Notifications Push (PWA) » en fin de fichier.

- **Manifest** (`src/app/manifest.ts`) : `display: standalone`,
  `theme_color #F5AA2D` (Jaune Soleil), `background_color #FFFFFF`, icônes
  `any` + `maskable`, raccourcis vitrine (Galerie, Actualités). Servi sur
  `/manifest.webmanifest`.
- **Meta iOS / app-like** (`src/app/layout.tsx`) : `appleWebApp.capable`,
  `viewportFit: cover`, `themeColor`, `formatDetection.telephone: false`.
- **Service worker** (`public/sw.js`, enregistré par `pwa-provider.tsx`) —
  stratégies volontairement simples, **pas de réseau-first partout** :
  | Ressource | Stratégie |
  |---|---|
  | Navigation (pages) | network-first, repli HTML en cache → `/offline` |
  | `/_next/static/*` | stale-while-revalidate (chunks hashed) |
  | `/icons`, `/images` | cache-first |
  | `/api/*` | **jamais caché** (données authentifiées, sensibles RGPD) |
  ⚠️ **`CACHE_VERSION`** en tête de `sw.js` : l'incrémenter à chaque
  changement de stratégie/des assets pré-cachés, sinon les clients gardent le
  worker précédent.
- **`PwaProvider`** (`src/components/pwa/pwa-provider.tsx`, monté dans le root
  layout) : enregistre `/sw.js` (avec `registration.update()`), capture
  `beforeinstallprompt` → bouton flottant « Installer l'application »
  (masqué une fois installé / standalone), affiche un bandeau « hors ligne »
  sur `offline`/`online`, et applique les **mises à jour automatiquement**
  (cf. ci-dessous).
- **Auto-update sans geste manuel** : `scripts/stamp-version.mjs` (hook
  `prebuild`) écrit `public/version.json` au build ; le bundle embarque la
  même version via `NEXT_PUBLIC_APP_VERSION`. Le provider sonde
  `/version.json` (`cache: no-store`, **jamais caché** côté SW) toutes les
  15 min + à chaque retour visible/en ligne : version différente = nouveau
  déploiement → toast + `location.reload()` (garde anti double-reload).
  En parallèle, `controllerchange` recharge aussi (cas d'un `sw.js` modifié —
  le worker `skipWaiting`/`claim` déjà en place prend aussitôt le contrôle),
  sauf à l'installation initiale. Toast « Application mise à jour. » après
  rechargement (flag `sessionStorage`). Sans `NEXT_PUBLIC_APP_VERSION` au
  build (dev local), le sondage est désactivé — aucun risque de boucle.
  ⚠️ En prod Docker, penser à fixer `NEXT_PUBLIC_APP_VERSION` (ex. hash git)
  dans `frontend/.env` **avant** `docker compose up --build` (variable lue
  au build, pas au runtime).
- **Page `/offline`** : repli hors-ligne stylé vitrine, publiée en statique,
  exclue des moteurs de recherche, **exclue du middleware** (elle doit rester
  accessible sans session).
- **Middleware** (`src/middleware.ts`) : les ressources PWA
  (`manifest.webmanifest`, `sw.js`, `offline`, `version.json`, icônes/images)
  sont exclues du matcher — sans quoi un visiteur anonyme serait redirigé
  vers `/auth/login`.
- Aucune variable d'env supplémentaire pour cette phase (les icônes sont
  dérivées de `public/images/marketing/logo.png`).

Test local : `pnpm dev` sur `http://localhost:3000` (contexte sécurisé) →
DevTools > Application > Manifest / Service Workers ; mode hors-ligne = le
voile s'affiche et la navigation retombe sur `/offline`. En production, le
service worker exige HTTPS.


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
- `staff_attendance_schedules` — horaires personnalisés par membre du personnel (surcharge l'horaire général)
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
1. `POST /api/v1/auth/login` → retourne `access_token` (15min) + `refresh_token` (30j)
2. Redirection vers `ROLE_HOME[user.role]`
3. `GET /api/v1/auth/me` → profil utilisateur (header `Authorization: Bearer <token>`)
4. Refresh auto via intercepteur Axios sur erreur 401

> **Plus de changement de mot de passe imposé au premier login** (décision
> produit, colonne `must_change_pwd` supprimée — migration `1455017b2af8`). Un
> compte créé avec un mot de passe temporaire s'en sert tel quel ; les emails
> de bienvenue invitent à le changer depuis les paramètres, sans l'exiger.
>
> La fonctionnalité n'avait de toute façon jamais tenu en entier : l'API REST
> ne l'imposait pas, la page de login ne redirigeait pas, mais le handshake
> WebSocket de la messagerie refusait les comptes concernés — un compte neuf
> n'avait donc pas de temps réel, sans la moindre explication.

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

# Route authentifiée (jeton valide, non révoqué, compte actif)
current_user: User = Depends(get_current_user)

# Route par rôle (implique get_current_user)
creator: User = Depends(require_roles(UserRole.ADMIN, UserRole.SUPERADMIN))

# Dépendance sur tout un router (cf. module establishments)
router = APIRouter(dependencies=[Depends(require_roles(UserRole.SUPERADMIN))])
```

> `get_active_user` a été **supprimé** avec `must_change_pwd` : il ne faisait
> plus que déléguer à `get_current_user`, qui vérifie déjà `is_active`. Deux
> noms pour la même garde invitaient à croire qu'ils différaient.

### Protection des routes (frontend)
Le `middleware.ts` lit le cookie `lprds-auth` (Zustand persist) et redirige les
non-authentifiés vers `/auth/login` — **mais seulement depuis l'espace privé**,
qu'il NOMME (`PRIVATE_PREFIX = '/dashboard'`).

⚠️ La garde raisonnait d'abord par la négative : « tout ce qui n'est pas listé
comme public exige une session ». Juste pour les routes qui existent, faux pour
toutes les autres — une URL inconnue n'étant dans aucune liste,
`/une-page-inconnue` renvoyait un visiteur anonyme vers l'écran de connexion au
lieu d'une 404. Un moteur y voyait une redirection et non une page disparue, un
visiteur suivant un vieux lien se croyait déconnecté, et rien ne distinguait
« cette adresse n'existe pas » de « cette page est protégée ».

Nommer le privé remet le défaut du bon côté, mais déplace le risque : une route
privée posée **ailleurs** que sous `/dashboard` serait servie à n'importe qui,
sans la moindre erreur. D'où `scripts/check-private-routes.mjs`, dans
`pnpm lint` : chaque route du disque doit être soit sous le préfixe privé, soit
déclarée dans `PUBLIC_ROUTES` / `MARKETING_ROUTES`.

La règle « authentifié sur une page publique → son tableau de bord » continue,
elle, de tester l'appartenance aux listes : une URL inconnue ne doit pas
davantage rediriger un utilisateur connecté — elle n'existe pour personne.

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
- **Le mot de passe de l'admin est saisi par le superadmin** à la création.
  **Aucun email n'est envoyé sur ce chemin** : il
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
| `menus:read` | Consulter le menu de la semaine et son historique |
| `menus:write` | Créer et modifier les menus de la semaine, consulter l'historique |
| `blog:write` | Rédiger, publier, modifier et supprimer les actualités du site vitrine (pas de `blog:read` — la lecture interne exige l'écriture) |
| `library:read` | Consulter le catalogue et le suivi des prêts |
| `library:write` | Créer, modifier et désactiver les livres |
| `library:lend` | Enregistrer prêts, retours et rappels |

> **Ajouter une permission** = 1) l'ajouter à `PermissionCode` (+ `PERMISSION_LABELS`,
> qui ne sert plus qu'au seed — l'API ne renvoie que le code, le libellé vit
> dans `messages/{locale}/rbac.json` et dans `PERMISSION_CODES` côté frontend),
> 2) écrire une migration qui l'insère dans `permissions`. Sans l'étape 2, toute
> tentative de l'attribuer renvoie une 500 explicite (garde-fou dans le service).

### Règle d'autorisation — `require_permission(*codes)`
- **Admin** de l'établissement → autorisé d'office (tous les droits chez lui)
- **Staff** → autorisé si ses rôles **actifs** portent **toutes** les permissions
  listées (sémantique AND — pour un OU, voir le pattern `_read_history` du
  module Menus ou les portails hors RBAC ci-dessous)
- **Superadmin** → **refusé** (403). Il gère le SaaS et les établissements, pas
  les données des enfants — minimisation RGPD. C'est volontaire, pas un oubli.
- **Parent** → refusé (son portail dédié est hors RBAC)

### Granularité bibliothèque — un geste = une permission
Le module Bibliothèque applique le principe fin (pas de garde groupée) :
`GET /books`, `/books/{id}`, `/lendings` → `library:read` ;
`POST /books`, `PATCH/DELETE /books/{id}` → `library:write` ;
`POST /lendings`, `/lendings/{id}/return`, `/reminders/run` → `library:lend`.
Le rôle socle « Bibliothécaire » porte les 3 (accès complet inchangé) ; un
rôle partiel (ex. lecture seule) n'ouvre que son geste. Les paramètres
(`GET/PUT /library/settings`) restent **admin uniquement** (décision testée).
Portails hors RBAC : `/mine/*` (parent), `/educator/books` (staff).

### Portails hors RBAC (pas de permission, rôle + scope)
Certains endpoints ne passent jamais par `require_permission`, par décision :
- **Messagerie** : `get_admin` / `get_parent` uniquement (staff exclu partout).
- **Socle staff** (`require_roles(STAFF)` seul, scopé au groupe mené) :
  `GET /children/my-group`, `/attendance/daily/my-group`,
  `/gallery/my-uploads`, `/library/educator/books`.
- **Portails parent** : `/parents/me/children`, `/reports/mine/*`,
  `/gallery/mine`, `/library/mine/*` (`get_parent`).
- **Notifications push** : self-service (`get_current_user`, ses propres
  abonnements uniquement) — aucune permission `notifications:*` n'est
  nécessaire ; `GET /vapid-public-key` est public (clé publique uniquement).
- **Blog public** : `/public/blog/*` sans authentification (vitrine).

### Route legacy — `POST /auth/users`
Route historique de création d'utilisateurs (`require_roles(SUPERADMIN,
ADMIN)`), sans granularité `staff:write` / `parents:write`. Créer le
personnel via `POST /staff` et les parents via `POST /parents` (permissions
fines). Conservée pour compatibilité, pas pour l'usage courant.

### Gating côté frontend (masquage, jamais une sécurité)

Le backend reste la seule autorité (un staff en deep-link sur une page
interdite reçoit 403). Le frontend masque pour éviter les impasses :

- **Codes centraux** : `PermissionCode` + `PERMISSION_GROUPS`
  (`types/rbac.ts`, miroir du backend) — jamais de littéral en dur dans le
  nouveau code ; le dialogue de création de rôle groupe les permissions par
  module (avec repli « Autres » pour tout code backend inconnu d'ici).
- **Navigation staff** : `STAFF_MODULE_ITEMS` (`components/dashboard/nav-items.ts`,
  `permissions: PermissionCode[]`, `requireAll?`) filtrée dans
  `useNavItems()` — même logique réutilisée sur `/dashboard/staff`
  (cartes modules, avec `requireAll` respecté partout).
- **Pattern de page** : `const canWrite = user?.role === 'admin' ||
  permissions.has('...:write')` (`useMyPermissions()` — l'admin reçoit tout
  le catalogue via `GET /rbac/me`, donc le test couvre les deux rôles).
  Appliqué aux boutons créer/modifier/désactiver des pages enfants, parents,
  personnel (dont l'onglet « Rôles RBAC », **admin uniquement**), organisation,
  bibliothèque (write/lend séparés, paramètres admin uniquement), menus
  (`menus:write` sur les cellules + boutons) et aux onglets présences
  (dashboard/journal/export → `attendance:read`, QR → `:write`, scanner →
  `:scan`, onglet par défaut = premier permis).
- **Pages `new`** (enfants/parents/personnel) : garde anti deep-link —
  message « Droits insuffisants » au lieu du formulaire.
- **Galerie staff** : `source` forcée à `report`, sélecteur masqué (la
  messagerie reste hors RBAC, 403 sinon).
- **Ne pas gater** : portails parent (`/mine/*`, hors RBAC), socle staff,
  messagerie (admin/parent par rôle), pages publiques.

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
(`welcome_parent.html`). Il s'en sert tel quel : plus aucun changement n'est
imposé au premier login (cf. § Authentification), l'email l'y invite seulement.
Les enfants assignés **doivent appartenir au même établissement** (404 sinon).

### Reset de mot de passe — « administré », spécifique aux parents
`POST /parents/{id}/reset-password` avec `{new_password}` :
- l'admin/staff **saisit** le nouveau mot de passe
- il est envoyé au parent par email (`parent_password_reset.html`)
- le parent s'en sert tel quel — aucune redéfinition n'est imposée, à la
  différence du flux `/auth/password-reset` qui, lui, fait saisir le nouveau
  mot de passe derrière un lien.

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
créateur + email de bienvenue (`welcome_staff.html`) ; reset administré
(mot de passe fourni, envoyé, sans redéfinition imposée) ;
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

**Journée locale de bout en bout** : le bucket « jour » est la journée
[00:00, 24:00) **dans le fuseau configuré** de l'établissement (convertie en
UTC avec DST via `_local_day_bounds`), jamais minuit UTC — dashboards, journal,
export et `verify` partagent ce découpage. Les heures affichées (export,
dashboards) sont converties dans ce fuseau (`_to_local`) ; les réponses
dashboards/journal exposent `timezone` pour que le frontend affiche la même
heure que celle qui a décidé du retard.

**Anti-rebond au scan** : même personne + même geste dans les 60 dernières
secondes → **409** (double-clic ou badge présenté 2 fois) — un geste différent
reste accepté aussitôt.

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
- **Versionnage + rotation sans casse** : jetons préfixés `v1:` (anciens jetons
  sans préfixe toujours acceptés) ; `QR_KEY_PREVIOUS` (ancienne valeur de
  `SECRET_KEY`, cf. `.env.example`) garde les anciens badges lisibles pendant
  la réimpression — sans elle, toute rotation invalide tout d'un coup.
- Les endpoints QR renvoient `Cache-Control: private, max-age=3600` (tout jeton
  émis reste valide, inutile de régénérer l'image à chaque affichage).
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
POST /api/v1/attendance/scan/verify               # Valide un QR + état du jour, sans écrire (attendance:scan)
POST /api/v1/attendance/scan                      # Enregistre un scan (attendance:scan)
POST /api/v1/attendance/absent-notifications     # Enquête manuelle d'absence (attendance:write) — ?date= (défaut aujourd'hui, jamais future), ?department_id= &section_id= : email + message conversation aux COMPTES PARENTS assignés aux enfants absents (aucune arrivée), pour connaître le motif. Anti-doublon journalier par enfant (Redis 48 h) : un second clic ne touche que les nouveaux absents. `child_id` = relance individuelle (renvoi forcé, 404 hors établissement, 422 si non absent). Best-effort double canal (comme les rappels biblio). Réponse : total_absent, notified (email_sent/message_sent par parent), skipped_no_parent, already_notified
POST /api/v1/attendance/events/manual             # Saisie manuelle arrivée/départ (attendance:write)
PATCH /api/v1/attendance/events/{event_id}        # Rectifie l'heure d'une ligne (attendance:write)
GET  /api/v1/attendance/events                    # Journal (attendance:read)
GET  /api/v1/attendance/daily/children            # ?date= &department_id= &section_id=
GET  /api/v1/attendance/daily/staff                # ?date=
GET  /PUT /api/v1/attendance/settings/departments/{department_id}   # attendance:write
GET  /PUT /api/v1/attendance/settings/general                        # fuseau + horaires staff
GET  /api/v1/attendance/settings/exempt-staff                        # ?exempt_only=
PATCH /api/v1/attendance/settings/exempt-staff/{staff_id}
GET  /PUT /DELETE /api/v1/attendance/settings/staff/{staff_id}       # horaire personnalisé staff
GET  /api/v1/attendance/export                      # ?format=&person_type=&date_from=&date_to=
                                                    #  &department_id=&section_id=&child_id=&staff_id=
```

Export agrégé PDF/Excel (statut par personne × jour, max 366 jours) :
`child_id` / `staff_id` (exclusifs, 422 sinon) restreignent à UNE personne
précise — 404 si hors établissement — et priment sur `person_type` /
département / section (le nom de fichier suit le périmètre effectif).
Heures affichées en heure locale établissement, extension `.xlsx` (l'enum API
reste `excel`), textes échappés pour le PDF, et **périmètre complet** : les
inactifs ayant scanné dans la période sont inclus (avec les mêmes filtres).

### Scan en deux temps — `verify` puis `scan`

Le flux de pointage gère **deux appels distincts**, pas un seul :
1. `POST /scan/verify` — **valide le QR sans rien écrire** (préfixé avant
   `/scan`, chemins différents sans ambiguïté de routage) : déchiffre le jeton,
   vérifie que la personne (enfant OU staff) est un membre **actif** de
   l'établissement courant (404 si inconnue ailleurs), et renvoie `person_type`,
   `matricule`, `display_name` + l'**état du jour** (`has_arrived` /
   `has_departed` / `has_meal` — `has_meal` toujours `false` pour un enfant).
2. `POST /scan` — n'enregistre l'événement qu'une fois la personne affichée et
   le type d'événement choisi côté UI.

L'état du jour sert à **suggérer le prochain geste** (indicateur clignotant sur
le bon bouton) :
- **Enfant** : `has_arrived && !has_departed → departure`, sinon `arrival`.
  Champs « accompagnateur » affichés uniquement après sélection d'un type.
- **Staff** : `!has_arrived → arrival` ; sinon `!has_meal → meal` ; sinon
  `!has_departed → departure` ; sinon `arrival`. Pas de champ accompagnateur.

Le backend, lui, **impose** la cohérence pendant le scan réel : il rejette
déjà 422 une cantine pour un enfant et un accompagnateur pour un staff. Le
`verify` n'ajoute aucune contrainte côté serveur — il ne fait qu'aider l'UI à
présenter le bon geste avant d'écrire. La vérification n'écrit **jamais**
d'événement (append-only préservé).

### Correction manuelle — édition directe de la ligne (décision produit)

Le journal reste append-only **pour les scans** (jamais d'UPDATE sur ce chemin),
mais une heure fausse ou un scan manquant se corrige **en touchant la ligne** —
décision explicite (alternative « nouvel event manuel avec flag » écartée) :

- `POST /events/manual` (`attendance:write`) : crée une arrivée/départ —
  cantine aussi pour le staff (seul l'enfant la refuse, 422) — avec
  `{person_type, child_id|staff_id, event_type, date, time}` —
  `date`+`time` interprétés dans le **fuseau de l'établissement**, heure future
  refusée (422, même repère local que la rectification). `scanned_by` =
  l'auteur de la correction. Mêmes gardes qu'au scan (personne active, pas de
  cantine enfant, pas d'accompagnateur staff).
- `PATCH /events/{event_id}` (`attendance:write`) : ne change que `scanned_at`
  (naïf = fuseau établissement, aware = normalisé, futur local = 422) —
  **type et personne inchangés**, la cohérence du journal est préservée.
  **Cohérence temporelle** : arrivée déplacée après le dernier départ du jour
  (ou départ avant la première arrivée) → 422. 404 inter-établissement.
- Pas de suppression de ligne : une heure ne s'efface pas, elle se rectifie.
- Le statut du jour étant calculé à la volée, la correction est **visible
  immédiatement** (dashboard, export, pré-remplissage des rapports quotidiens).
- Côté UI (`dashboard-tab.tsx`) : lignes cliquables (admin ou
  `attendance:write` uniquement — le dashboard reste lisible avec
  `attendance:read` seul), dialogue arrivée/départ pré-rempli (1re arrivée /
  dernier départ, même règle que le backend), PATCH si la ligne existe sinon
  création manuelle, vide = inchangé.

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
| Arrivée après l'horaire attendu + tolérance | `late` | écart en minutes |
| Arrivée dans les temps (+ tolérance) | `present` | `0` |
| **Staff exempté**, pas d'arrivée | `exempt` | `null` |
| **Staff exempté**, arrivée quand même | calculé normalement | idem |

`arrival_time` = **premier** événement `arrival` du jour ; `departure_time` =
**dernier** événement `departure` du jour (en cas de scans multiples/erreurs).

> ⚠️ Pas de gestion de calendrier (congés, jours fériés) dans cette version —
> volontairement simplifié à « jours ouvrés lun-ven ». Un enfant/staff absent un
> jour férié apparaîtra `absent`. Calendrier d'exception à trancher avec le
> métier si besoin (décision produit en suspens, pas un oubli).
>
> Le bucket « jour » est la journée locale de l'établissement (cf. « Modèle »
> ci-dessus) — plus de décalage UTC proche de minuit.

### Paramètres — fuseau horaire + asymétrie enfants/staff assumée

Un seul jeu de **paramètres généraux** par établissement
(`attendance_settings`, table singleton) — configurable par l'admin ou un
staff porteur de `attendance:write` :

- **`timezone`** (nom IANA, ex. `Africa/Porto-Novo`) : utilisé pour **les deux**
  calculs de retard (enfants ET staff) **et** tout le bucket « jour »
  (dashboards, journal, export, verify). Validé via `zoneinfo` à la saisie (422
  si le nom n'existe pas). Défaut implicite `UTC` tant que rien n'est configuré.
  Une valeur corrompue en base lève une 500 explicite (« reconfigurez ») au lieu
  d'un calcul faux silencieux.
- **`staff_expected_arrival_time` / `staff_expected_departure_time`** : **un
  seul horaire pour tout le personnel** de l'établissement — pas de découpe par
  département pour le staff (confirmé : *« Tous les personnels ont une même
  heure d'arrivée et de départ »*).
- **`late_grace_minutes`** (défaut 0 = aucun pardon) : tolérance en minutes
  avant qu'une arrivée tardive compte « en retard » — enfants comme staff,
  dashboards comme export. Migration `7ee86cf2ad2a`.
- Upserts **atomiques** (`ON CONFLICT`) sur les trois réglages : 2 PUT
  concurrents ne violent plus les contraintes d'unicité en 500.

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
`/attendance/settings/exempt-staff` — qui exige un compte **actif** (409
sinon : un flag sur un inactif serait invisible, la liste ne montrant que les
actifs).

### Horaires personnalisés par membre du personnel (table dédiée)

Au-delà de l'horaire général unique, chaque membre du personnel peut recevoir un
**horaire personnalisé** (`staff_attendance_schedules`, table dédiée — 1 ligne
par staff) qui **surcharge** l'horaire général pour le calcul de ses retards :

- `GET /attendance/settings/staff/{staff_id}` → **404 si aucun horaire
  personnalisé** (pas une erreur : c'est le signal « horaire général »).
- `PUT /attendance/settings/staff/{staff_id}` → **upsert** (crée ou remplace la
  ligne). `expected_departure_time` doit être **postérieur** à
  `expected_arrival_time` (422 sinon). Un staff d'un autre établissement → 404.
- `DELETE /attendance/settings/staff/{staff_id}` → supprime la ligne, le membre
  retombe sur l'horaire général. Idempotent : pas d'horaire personnalisé → 204
  quand même.

Priorité dans `get_staff_daily_status` et l'export : **horaire personnalisé
d'abord, sinon horaire général** (`staff_expected_arrival_time`). Même
mécanisme de repli pour les jours sans horaire personnalisé.
### Export agrégé PDF / Excel (`GET /attendance/export`)

Téléchargement d'un état des présences sur une période (`attendance:read`) —
une ligne **par personne et par jour**, statut calculé à la volée avec les
mêmes règles que les dashboards journaliers. Les lignes portent des **codes**
(`present`, `late`, `child`…), le rendu pose les libellés dans la langue du
document — cf. § « Internationalisation » :

- Query params : `format` (`pdf`|`excel` — la valeur enum est `excel`, pas
  `xlsx`), `person_type` (`children`|`staff`|`both`), `date_from`/`date_to`
  (ISO, **obligatoires**), `department_id`/`section_id` optionnels (filtrant
  les enfants uniquement — le staff n'est rattaché à aucun département).
- Période inversée (`date_from > date_to`) → 422. Écart > 366 jours → 422.
- **Périmètre complet** : les enfants **inactifs** du département sélectionné
  sont inclus s'ils ont un scan dans la période ; les actifs sans scan
  apparaissent `absent`/`not_expected`. Le personnel suit la même logique.
- Rendu : PDF paysage A4 via **reportlab** (tableau en-têtes Type / Nom /
  Matricule / Date / Statut / Arrivée / Départ / Retard / Cantine) ou classeur
  XLSX via **openpyxl** (dépendance ajoutée, `freeze_panes` + filtre auto).
  Générés via `asyncio.to_thread` (pattern `reports/pdf.py`).
- Réponse : `Content-Disposition: attachment` + nom de fichier
  `{presences|enfants|personnel}_{date_from}_{date_to}.{pdf|xlsx}` (suit le
  périmètre effectif si `child_id`/`staff_id`).
- `child_id` / `staff_id` (exclusifs, 422 sinon) restreignent à UNE personne
  (404 hors établissement) et priment sur `person_type`/département/section.
- Heures affichées en heure locale établissement, textes échappés pour le PDF.
- Consommé par l'onglet export du frontend, qui télécharge le blob et
  déclenche le téléchargement navigateur.

### Isolation
Toutes les opérations (scan, QR, dashboards, réglages) sont bornées à
`current_user.establishment_id`. Scanner ou consulter une personne d'un autre
établissement → **404**, y compris quand le matricule scanné existe réellement
mais ailleurs (le matricule seul ne suffit pas à identifier une personne hors
de son établissement). Même discipline pour les filtres : `department_id` /
`section_id` (dashboard), `child_id` / `staff_id` (journal) hors établissement
→ **404**, jamais un vide silencieux ; `date_from > date_to` (journal) → 422.

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
  manuelle (`ws_auth.py`), réplique de `get_current_user` (jeton `access`,
  non révoqué, compte actif).
  ⚠️ Ce contrôle a longtemps refusé en plus les comptes à `must_change_pwd`,
  alors que l'API REST ne l'imposait plus : un compte neuf n'avait donc pas de
  temps réel, sans erreur visible. Garder cette réplique alignée sur
  `get_current_user` fait partie de son entretien.
- **Défense en profondeur** : l'`Origin` du handshake, quand le navigateur en
  envoie un, est vérifié contre `settings.cors_origins` (CORSMiddleware ne
  s'applique PAS aux WebSocket — Starlette ne le fait qu'sur le scope `http` —
  donc cette vérification est la seule protection d'origine sur ce endpoint).
- **Rejet = fermeture avant `accept()`** : un jeton invalide/révoqué ou un rôle
  non éligible (staff/superadmin) ferme la connexion sans l'accepter (code
  `1008`). Côté client : **pas de reconnexion sur 1008** (sinon boucle
  infinie), backoff exponentiel + jitter sinon (1s→30s), reconnexion immédiate
  au retour `online`. Selon le serveur ASGI, ça se traduit soit par un refus HTTP direct du handshake
  (`InvalidStatus`, observé avec uvicorn), soit par une fermeture juste après
  (`ConnectionClosed`, code `1008`) — les deux prouvent la même chose : jamais
  de session WS utilisable sans jeton admin/parent valide.
- **Heartbeat applicatif** : le client envoie `{"type":"ping"}` toutes les 25 s,
  le serveur répond `{"type":"pong"}` (seul contenu entrant traité, le reste
  est ignoré) ; sans pong sous 10 s le client force la fermeture → cycle
  reconnect + resync (détecte les connexions mortes NAT/proxy idle).
- **Resync au reconnect** : à chaque réouverture après coupure, le client
  invalide les clés `messaging/*`, `parent/conversation*`,
  `parent/announcements` — aucun trou permanent (le publish Redis étant
  best-effort).
- **Session DB éphémère** : la connexion n'ouvre une session DB QUE pour la
  phase d'authentification (+ get-or-create de la conversation côté parent),
  commit, puis referme — une connexion WS peut vivre des heures, hors de
  question de garder une connexion du pool ouverte tout ce temps.
- **Canaux abonnés** :
  | Rôle | Canaux |
  |---|---|
  | Parent | `messaging:estab:{id}:announcements` + `messaging:conv:{sa_conversation_id}` |
  | Admin | `messaging:estab:{id}:announcements` + `messaging:estab:{id}:admin` (agrégé : tous les messages de toutes les conversations, pour rafraîchir la liste en direct) |

### Notifications à la réception (conversations privées)

- **Push Web au destinataire** (`send_message`, best-effort) : aux admins si
  l'expéditeur est le parent, au seul parent de la conversation
  (`parent_ids={...}`) si l'expéditeur est un admin — couvre l'app fermée.
- **Temps réel applicatif** : `MessagingSocketProvider` est monté dans
  `dashboard/layout.tsx` (admin/parent uniquement — le serveur rejetterait les
  autres rôles), plus seulement sur les pages messagerie. `MessagingNotifier`
  (même niveau) affiche un **toast au destinataire** à chaque message reçu
  (nom + extrait, silence pour ses propres messages multi-onglets), sauf sur
  sa page messagerie où le fil est déjà en direct — et invalide les requêtes
  de compteurs pour garder les pastilles fraîches hors page messagerie.
- **Pastilles de non-lus** : par conversation côté admin (existait déjà) +
  sur l'entrée **Messagerie** de la navigation (sidebar + mobile) via
  `useMessagingUnread()` (somme côté admin, conversation unique côté parent,
  mêmes clés react-query que les onglets — aucune requête en double).
  `NavList` accepte `badges: Record<href, count>` (masquées à 0).
- **Fil de conversation** (`useConversationThread`, partagé admin/parent) :
  historique paginé vers le haut (`before_id`, ancrage du scroll, pastille
  « N nouveaux » quand on n'est pas en bas), `MediaPicker` multi-médias
  (max 15) avec aperçu avant envoi, édition inline de ses messages (fenêtre
  15 min, mention « modifié »), suppression douce (confirm `AlertDialog`,
  placeholder « Message supprimé »), retrait de ses pièces jointes (croix),
  temps réel `message_updated` / `message_deleted` appliqués au cache.
  `MessageBubble` rend la bulle + menu (survol) dans les deux portails.


### Endpoints REST
```
POST   /api/v1/messaging/announcements                     # admin
GET    /api/v1/messaging/announcements                     # admin ou parent (vue différente)
GET    /api/v1/messaging/announcements/{id}
PATCH  /api/v1/messaging/announcements/{id}                # admin — dont désactivation (soft)
POST   /api/v1/messaging/announcements/{id}/read           # parent

GET    /api/v1/messaging/conversations/me                  # parent — auto-créée si absente
GET    /api/v1/messaging/conversations/me/messages         # ?skip= &limit= &before_id= (curseur stable)
POST   /api/v1/messaging/conversations/me/messages
POST   /api/v1/messaging/conversations/me/read
PATCH  /api/v1/messaging/conversations/me/messages/{msg_id}            # édition auteur, 15 min
DELETE /api/v1/messaging/conversations/me/messages/{msg_id}            # suppression douce auteur (204, idempotent)
POST   /api/v1/messaging/conversations/me/messages/{msg_id}/attachments/batch          # lot, max 15
DELETE /api/v1/messaging/conversations/me/messages/{msg_id}/attachments/{att_id}       # retrait auteur

GET    /api/v1/messaging/conversations                     # admin — liste, triée par activité
POST   /api/v1/messaging/conversations                     # admin — ouvre (get-or-create) une conversation
                                                           #   avec un parent {parent_id, body?} ; body = 1er
                                                           #   message d'ouverture (optionnel) — 201
GET    /api/v1/messaging/conversations/{id}/messages       # admin — ?skip= &limit= &before_id=
POST   /api/v1/messaging/conversations/{id}/messages       # admin — répond « au nom de l'administration »
POST   /api/v1/messaging/conversations/{id}/read           # admin
PATCH  /api/v1/messaging/conversations/{id}/messages/{msg_id}          # édition auteur, 15 min
DELETE /api/v1/messaging/conversations/{id}/messages/{msg_id}          # suppression douce auteur
POST   /api/v1/messaging/conversations/{id}/messages/{msg_id}/attachments/batch        # lot, max 15
DELETE /api/v1/messaging/conversations/{id}/messages/{msg_id}/attachments/{att_id}     # retrait auteur

POST   /api/v1/messaging/announcements/{id}/attachments                     # admin — 1 média
POST   /api/v1/messaging/announcements/{id}/attachments/batch               # admin — lot (tout ou rien)
POST   /api/v1/messaging/conversations/me/messages/{msg_id}/attachments     # parent
POST   /api/v1/messaging/conversations/{id}/messages/{msg_id}/attachments   # admin
GET    /api/v1/messaging/attachments/{id}                                   # admin ou parent — téléchargement
```

### Diffusions — médias multiples (max 15, photos/vidéos/PDF)

Une diffusion peut porter jusqu'à **`MAX_ANNOUNCEMENT_ATTACHMENTS = 15`**
médias, quota imposé à l'upload unitaire comme en lot (**409** au-delà).
L'envoi en lot (`POST .../attachments/batch`, champ multipart `files`) est
**tout ou rien** : tous les fichiers sont lus et validés avant toute écriture
— un fichier invalide ou le dépassement du quota rejette le lot entier, sans
envoi partiel. Un événement temps réel `announcement_attachment` est publié
par pièce jointe (même contrat que l'unitaire). Depuis cette évolution, la
**vidéo est acceptée en diffusion** comme dans les conversations (plafond
`MESSAGING_MAX_VIDEO_MB`) — le frontend propose sélection multiple +
prévisualisation (miniatures photo, lecteur vidéo, fiche PDF) avant envoi,
côté création comme sur une diffusion existante.

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

### Conversations — édition, suppression douce, lot de médias

- **Édition** (`PATCH .../messages/{msg_id}`, variantes `/me` + `/{id}`) :
  **auteur uniquement** (403 sinon, même admin sur message parent et
  inversement), **fenêtre de 15 min** (`MESSAGE_EDIT_WINDOW`, 409 au-delà),
  corps revalidé (max 5000, vide accepté seulement si le message garde ≥ 1
  pièce jointe — 422 sinon). Pose `edited_at`, publie **`message_updated`**
  (message complet). Éditer un message supprimé → 409.
- **Suppression** (`DELETE .../messages/{msg_id}`, auteur uniquement, tout
  âge, **idempotente** — 204 même si déjà supprimé) : **douce** — la ligne est
  conservée (`is_deleted=True`, corps vidé, `body=null` + `attachments=[]` en
  réponse pour garder l'ordre et les accusés du fil), les **pièces jointes
  sont effacées** (lignes + fichiers). Publie **`message_deleted`**
  (`{conversation_id, message_id}`). Un message supprimé est **exclu des
  non-lus** (`_unread_count`, liste admin) et **non téléchargeable** (404).
- **Lot de médias** (`POST .../messages/{msg_id}/attachments/batch`, champ
  `files`) : même contrat tout-ou-rien que les diffusions, quota
  **`MAX_MESSAGE_ATTACHMENTS = 15` par message** (409 au-delà, y compris à
  l'upload unitaire qui passe par le même chemin). Réservé à l'auteur, message
  non supprimé (404 sinon). Un événement `attachment` est publié par pièce
  jointe (même contrat que l'unitaire).
- **Retrait d'une pièce jointe** (`DELETE .../messages/{msg_id}/attachments/{att_id}`,
  auteur uniquement) : fichier + ligne supprimés, republie **`message_updated`**
  (message rafraîchi — un seul type d'événement à gérer côté client). Refusé
  en 422 si c'est le dernier média d'un message sans texte (garde l'invariant
  « texte ou média »).
- **Pagination curseur** : `GET .../messages` accepte `before_id` (en plus de
  `skip/limit`, défaut 50, max 200) — messages strictement antérieurs au
  curseur `(created_at, id)`, ordre stable déterministe, total inchangé, 404
  sur curseur inconnu. Le verrouillage en écriture (`SELECT ... FOR UPDATE`)
  sérialise édition/suppression/uploads concurrents sur un même message.

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
  `image/svg+xml`) partout, et **tout MIME `video/*` est accepté dans les
  conversations privées ET les diffusions** (`_validate_upload(allow_video=True)`,
  plafond vidéo dédié) —
  le `content_type` déclaré par le client n'est **pas** vérifié par analyse du
  contenu (pas de sniffing des octets magiques) : simplification assumée,
  acceptable pour ce périmètre mais pas une garantie de sécurité forte contre
  un client qui mentirait délibérément sur le type.
- **Poussé en temps réel** comme un message : `{"type": "attachment", conversation_id, message_id, ...}`
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

Côté formulaire, le remplissage est aussi **visible avant soumission** :
`useAttendancePrefill` (`lib/reports/`, création + édition d'un brouillon)
interroge `GET /attendance/daily/children?date=` (ou `/daily/my-group` pour
une éducatrice sans `attendance:read`) dès que l'enfant et la date sont
choisis, et renseigne les champs `time` encore vides — une seule fois par
couple enfant/date, jamais d'écrasement d'une saisie manuelle.

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
- **Qui VOIT quoi (lecture)** : garde d'entrée en OU — admin, ou staff porteur
  d'au moins une permission du module (read, write ou validate) ; la sidebar
  affiche le module dès une permission, la garde ne peut pas être plus étroite
  (« page visible, données 403 » sinon). Périmètre ensuite :
  - groupe(s) mené(s) en intégralité (tous statuts) ;
  - **plus**, pour un porteur de `reports:validate` (ex. directrice SANS groupe
    mené, cas réel) : le soumis/validé de **tout** l'établissement — sinon le
    rôle validateur serait inutilisable (la validation elle-même est sans
    restriction de groupe). Les brouillons/rejetés d'autrui restent invisibles.

### ⚠️ Auto-publication quand l'auteur est admin — et ce que l'écran doit en dire

Quand `POST /reports/{id}/submit` est appelé par un **admin**, le rapport est
**validé et publié immédiatement dans le même appel** — pas de détour par
`submitted` en attente d'un validateur : personne n'est « au-dessus » de
l'admin pour approuver son propre rapport, l'aller-retour serait artificiel.
Décision explicitement confirmée avec l'utilisateur avant implémentation
(alternative envisagée : passer quand même par le circuit standard — écartée).
Un rapport soumis par un **staff** suit le circuit complet normal.

⚠️ **L'interface doit le DIRE, sinon la décision devient un piège.** Le bouton
portait « Soumettre » pour tout le monde et le toast annonçait « Rapport
soumis » — un établissement a publié le rapport d'un enfant en croyant
enregistrer ses modifications, et l'a découvert au statut. Pour un admin, le
bouton dit donc « Valider et publier », demande confirmation (les parents sont
prévenus par email et notification, c'est irréversible de leur point de vue), et
le toast lit le statut que l'API renvoie au lieu de le supposer. Même traitement
sur l'écran de création. Sous test : `test_reports_attachment_rules.py`.

### ⚠️ Les médias suivent la règle du contenu — l'écran aussi

`POST/DELETE /reports/{id}/attachments` passent par `_ensure_mutable` : l'admin à
tout statut, le staff en brouillon/rejeté seulement. La carte des médias de
l'écran de détail, elle, n'avait **aucune garde** : une éducatrice voyait
« Ajouter une photo » sur un rapport qu'elle avait soumis, cliquait, et recevait
un 409. Vu de l'établissement, ça ressemblait à un problème sur son compte —
d'autant que l'admin, lui, réussit toujours. Le formulaire du contenu juste
au-dessus se cachait déjà ; seule cette carte avait été oubliée.

Elle affiche désormais, à la place du bouton, la raison et le recours (faire
rejeter le rapport pour le reprendre). Masquer sans expliquer laisserait la même
question sans réponse.

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
GET/POST/DELETE /api/v1/reports/settings/departments/{id}/types[/{report_type}]  # GET : lecture ouverte (reports:read OU reports:write — le formulaire de création en a besoin) ; POST/DELETE : ADMIN uniquement (non délégable — une éducatrice porte reports:write mais ne configure pas les types actifs)

GET    /api/v1/reports/vocabulary         # reports:read — libellés (mood, behavior_tag, ...) DANS LA LANGUE DE L'APPELANT
                                          #   ⚠️ la locale doit faire partie de la clé de cache côté frontend
POST   /api/v1/reports                    # reports:write (+ règle de groupe pour le staff)
GET    /api/v1/reports                    # garde OU (read/write/validate) — scope auto par groupe si staff, + soumis/validé partout si reports:validate ; ?search= (nom/prénoms/matricule)
GET    /api/v1/reports/missing            # reports:read — NON SOUMIS pour la période contenant la date (?report_type=, défaut quotidien ; date défaut aujourd'hui, jamais future) : seuls les enfants ACTIFS dont le DÉPARTEMENT a ce type activé comptent (cohérent avec la création) ; l'admin voit d'un coup d'œil qui n'a rien soumis sans croiser les absences ; staff = ses groupes uniquement. has_draft = brouillon/rejeté en cours. Côté UI : 5e pill « Non soumis » sous chaque onglet de type (avec sélecteur de date)
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

Trois relations ORM pures (aucune migration, pas de nouvelle colonne) ont été
ajoutées pour permettre à `gallery/service.py` de remonter jusqu'à
l'enfant/parent/diffusion sans requête séparée par élément listé :
- `ReportAttachment.report` (`reports/models.py`)
- `Attachment.message` et `Message.conversation` (`messaging/models.py`)
- `Attachment.announcement` (`messaging/models.py`, pour la source `announcement`)

Les URL de téléchargement renvoyées par la galerie **pointent toujours vers
les endpoints authentifiés déjà existants** de chaque module d'origine
(`/reports/{id}/attachments/{id}`, `/reports/mine/{id}/attachments/{id}`,
`/messaging/attachments/{id}`) — la galerie ne sert jamais elle-même un
fichier, elle ne fait qu'agréger et filtrer.

### Trois sources traitées différemment — décision explicite

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
- **`source=announcement`** : médias des diffusions (jamais liés à un enfant
  précis, mais utiles établissement-wide). Filtrable par `department_id`
  (diffusion ciblée vers ce département **ou broadcast**, visible par tous)
  et par date ; `child_id`, `group_id`, `staff_id`, `report_type` l'excluent
  silencieusement comme pour les messages. Chaque item expose
  `announcement_id` + `announcement_title` (regroupement d'affichage) ; le
  téléchargement réutilise `/messaging/attachments/{id}`, dont le contrôle de
  périmètre existant s'applique tel quel.

### Accès — décision explicite

- **Admin** : galerie complète (rapports + messages + diffusions), toujours.
- **Staff** : nouvelle permission RBAC délégable `gallery:read` — mais
  **rapports uniquement**, jamais la messagerie (`source=message` ou
  `source=announcement` → 403), qui reste hors RBAC et hors d'atteinte du
  staff partout ailleurs dans l'application (cf. module Messagerie).
  Établissement entier une fois la permission accordée, **pas de scoping par
  groupe** (contrairement à `reports:read`) — modèle de délégation de
  confiance, comme `reports:validate`, pas un outil d'auto-consultation par
  groupe.
- **Parent** : rapports **validés** de ses enfants + messages de **sa propre
  conversation** + médias des diffusions **actives dans son périmètre**
  (broadcast, ou ciblées vers un département de l'un de ses enfants — une
  diffusion désactivée disparaît de sa galerie comme du portail).

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

Paramètres de `/gallery/media` : `source` (`report`/`message`/`announcement`),
`child_id`, `group_id`, `staff_id`, `department_id`, `report_type`,
`date_from`, `date_to`, `skip`, `limit`. Paramètres de `/gallery/mine` :
`source`, `child_id`, `skip`, `limit`.

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
GET    /api/v1/menus/{week_start}/translation?department_id=   # menus:write — FR + EN côte à côte
PATCH  /api/v1/menus/{week_start}/translation?department_id=   # menus:write — anglais relu à la main
                                      #   (seule écriture du module admise sur une semaine passée)

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
`weekly_menus` croisé deux fois avant diagnostic).

Même classe de problème, deuxième occurrence : `blog_gallery_categories.created_at`
créée sans `nullable=False` alors que le modèle la déclare NOT NULL
(`b71c4e02a9f3`). L'autogenerate proposait la correction à chaque revision ;
deux migrations successives ont dû l'écarter à la main pour ne pas l'embarquer
par mégarde, avant qu'elle soit enfin traitée dans sa propre révision
(`064cd5ec1350`).

**Ce contrôle n'est plus à la charge d'un humain** :
`tests/e2e/test_schema_drift.py` compare les métadonnées SQLAlchemy au schéma
réellement migré et échoue en nommant la table et la colonne fautives. Il
attrape les deux cas ci-dessus — modèle absent du registre comme migration
divergente. Un échec veut dire : modèle changé sans migration, migration
écrite de travers, ou module manquant au registre.

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

### Galerie du site vitrine — catégories libres (comme les étiquettes)

Les photos (`blog_gallery_photos`, upload = publication immédiate, suppression
définitive) sont classées par **catégories créées à la volée** (`blog_gallery_categories`,
nom unique par établissement — migration `b71c4e02a9f3`). L'ancien enum figé
`GalleryCategory` (6 codes en dur) est supprimé : à la migration, une catégorie
a été créée par ancien code retrouvé (libellés FR historiques), photos
rattachées, sans orphelin.

- CRUD complet `blog:write` : `POST/GET /blog/gallery/categories`,
  `PATCH/DELETE /blog/gallery/categories/{id}` (409 sur doublon, comme les
  étiquettes). Supprimer une catégorie **conserve les photos**, qui passent
  « sans catégorie » (`category_id` NULL, FK `ON DELETE SET NULL`).
- Upload `POST /blog/gallery` avec `category_id` (Form, **requis**, 404 si hors
  établissement) ; filtre `GET /blog/gallery?category_id=` ; la réponse expose
  `category: {id, name} | null`.
- Côté public : filtre `?category_id=` + `GET
  /public/blog/{code}/gallery/categories` (pastilles de filtre, seuls id+nom
  exposés). Le site vitrine (`galerie/page.tsx` + `GalleryExplorer`) charge ses
  pastilles depuis l'API — plus aucune catégorie en dur côté frontend
  (`GALLERY_CATEGORIES` / `GALLERY_PHOTO_CATEGORIES` supprimés).

### Endpoints
```
# Gestion (authentifiée, blog:write)
POST   /api/v1/blog/tags
GET    /api/v1/blog/tags
PATCH  /api/v1/blog/tags/{tag_id}
DELETE /api/v1/blog/tags/{tag_id}                       # suppression définitive

POST   /api/v1/blog/gallery/categories                  # nom libre, unique/établissement
GET    /api/v1/blog/gallery/categories
PATCH  /api/v1/blog/gallery/categories/{category_id}    # renommage (409 si doublon)
DELETE /api/v1/blog/gallery/categories/{category_id}    # définitive — photos conservées, sans catégorie
POST   /api/v1/blog/gallery                             # multipart category_id + file — publication immédiate
GET    /api/v1/blog/gallery                             # ?category_id= &skip= &limit=

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

## Module Bibliothèque (library)

Catalogue de livres multi-sections, prêts aux enfants, retours et rappels.
Permissions fines par geste (cf. section RBAC — granularité bibliothèque) :
lecture (`library:read`), catalogue (`library:write`), prêts (`library:lend`).

### Endpoints
```
GET/PUT  /api/v1/library/settings                       # ADMIN uniquement (non délégable)
POST     /api/v1/library/books                          # library:write
GET      /api/v1/library/books                          # library:read — ?section_id= &include_inactive= &skip= &limit=
GET      /api/v1/library/books/{id}                     # library:read
PATCH    /api/v1/library/books/{id}                     # library:write
DELETE   /api/v1/library/books/{id}                     # library:write — soft delete (409 si prêts en cours)
POST     /api/v1/library/lendings                       # library:lend — {book_id, child_id, borrowed_at?, due_date?}
GET      /api/v1/library/lendings                       # library:read — ?book_id= &child_id= &status=
POST     /api/v1/library/lendings/{id}/return           # library:lend (409 si déjà rendu)
POST     /api/v1/library/reminders/run                  # library:lend — relances (email + message conversation)

GET    /api/v1/library/mine/books                       # parent — sections des enfants
GET    /api/v1/library/mine/lendings                    # parent — ses prêts
GET    /api/v1/library/educator/books                   # staff — livres de sa section (hors RBAC)
```

### Pagination — 200, comme partout ailleurs
Le module plafonnait seul `limit` à **100** quand les dix autres acceptent 200,
et que le frontend demande 200 partout : `GET /library/lendings?limit=200`
(compteur « prêts en retard » du tableau de bord admin) renvoyait **422**, donc
un compteur qui ne se chargeait jamais sans rien afficher d'anormal. Les cinq
routes paginées sont alignées, et `test_library.py` le verrouille — bornes
testées par HTTP sur les deux routes de gestion, et contrôle à la source pour
les trois portails (un admin y reçoit 403 avant toute validation).

### Règles métier
- **Quantités** : `available_quantity` décrémenté à chaque prêt, restauré au
  retour ; prêt impossible sans exemplaire disponible (409), ni sur livre
  désactivé (409) ; `due_date < borrowed_at` → 422.
- **Rappels** (`POST /reminders/run`) : prêts en retard relancés une fois par
  jour max (anti-doublon `last_reminded_on`) — email best-effort + message
  injecté dans la conversation admin↔parent concernée.
- **Rôle socle « Bibliothécaire »** : attribué automatiquement (les 3
  permissions) — même pattern que le socle éducatrice.
- **Isolation** : tout est borné à `establishment_id` (404 inter-établissement) ;
  superadmin exclu (403).

---

## Internationalisation (FR / EN)

Les établissements sont bilingues, donc les parents aussi : **toute** la
plateforme suit la langue de l'utilisateur — interface, messages d'erreur,
emails, notifications push, documents générés, et jusqu'au contenu rédigé par
l'établissement (blog, menus). Un parent qui choisit l'anglais ne doit jamais
recevoir un email, un bulletin ni un message d'erreur en français.

### Règle de détection — l'inverse d'un repli classique

**Le français n'est servi QUE s'il est explicitement préféré.** Toute autre
langue — anglais, espagnol, wolof — donne de l'anglais. Un navigateur
anglophone qui accepte le français en second (`en, fr;q=0.5`) reste en anglais.

C'est volontairement l'inverse du défaut de `next-intl` (qui retombe sur la
locale par défaut pour toute langue non reconnue), et la même règle est
implémentée **deux fois, à l'identique** : `src/i18n/detect.ts` côté frontend,
`resolve_accept_language()` (`app/core/i18n.py`) côté backend. Les deux ne
regardent que la préférence la MIEUX notée, jamais la liste entière.

### Deux sources de langue, une seule règle de priorité

| Contexte | Source | Pourquoi |
|---|---|---|
| Visiteur anonyme | Cookie `NEXT_LOCALE`, à défaut `Accept-Language` | Pas de compte à interroger |
| Utilisateur connecté | **`users.locale`** (colonne, `PATCH /auth/me/locale`) | Son choix explicite prime |
| Email, PDF, push | **`users.locale` du DESTINATAIRE**, passé en paramètre | Sort du cycle requête/réponse : le destinataire n'est pas l'appelant |

⚠️ **Côté navigateur, hors composant React : `clientLocale()`**
(`src/i18n/client-locale.ts`) — **le préfixe d'URL d'abord, le cookie ensuite.**

Quatre modules doivent connaître la langue sans pouvoir appeler `useLocale()`
(ils tournent dans des `catch`, des rappels asynchrones ou au niveau module) :
`lib/utils/locale-format.ts` (toutes les dates), `lib/utils/api-error.ts`
(replis d'erreur), `lib/push-subscription.ts`, et `lib/api/client.ts` qui pose
l'en-tête `Accept-Language` de **chaque** requête.

Les quatre lisaient le cookie **seul**, chacun avec sa propre copie de la
regex. C'était faux : avec `localePrefix: 'as-needed'`, on peut parfaitement se
trouver sur `/en/...` SANS cookie — lien partagé, favori, cookie expiré,
navigation privée. Constaté en recette : « JEUDI 1 OCTOBRE 2026 » en tête d'un
tableau de bord anglais, mois des anniversaires en français, et surtout
`Accept-Language: fr` envoyé au backend depuis une page anglaise. Le préfixe
d'URL est ce qui a décidé de la langue de la page : c'est donc lui qui fait foi.

(`manifest.ts` reste au cookie + `Accept-Language` : il est servi hors du
segment `[locale]`, il n'a aucune URL d'où déduire la langue.)

⚠️ **`users.locale` prime sur `Accept-Language` dès qu'on est authentifié** —
c'est vérifié par test en envoyant délibérément l'en-tête contraire
(`test_i18n.py::test_account_locale_wins_over_accept_language`). Un compte
basculé en anglais reçoit de l'anglais même avec `Accept-Language: fr`.


**Côté frontend, la résolution suit trois sources, dans cet ordre**
(`resolveLocale`, `src/i18n/detect.ts`) — un préfixe d'URL l'emportant sur tout,
puisqu'il exprime une intention explicite :

1. **le cookie `NEXT_LOCALE`** — choix fait DANS CE NAVIGATEUR, par le sélecteur ;
2. **`users.locale`**, lu dans le cookie de session `lprds-auth` — choix fait
   sur le COMPTE, valable sur tous les appareils ;
3. **`Accept-Language`** — une déduction, jamais un choix.

⚠️ **Le compte passe après le cookie, et c'est délibéré.** Le sélecteur de
langue enregistre le compte par un appel réseau asynchrone *pendant* qu'il
navigue déjà vers la nouvelle langue : faire primer le compte renverrait
l'utilisateur d'où il vient à chaque bascule — et définitivement si l'appel
échoue, puisqu'il est best-effort. C'est contre-intuitif, donc explicitement
sous garde (`check-locale-resolution.mjs`, qui échoue si l'ordre s'inverse).

Ce que le compte corrige, c'est **l'absence de cookie** : cookies effacés,
nouvel appareil, navigation privée. On retombait alors sur `Accept-Language`,
donc une préférence explicitement enregistrée cédait devant un réglage de
navigateur — et l'interface pouvait s'afficher en français pendant que l'API,
qui obéit au compte, répondait en anglais.

`PATCH /auth/me/locale` est sous `get_current_user`, comme toutes les routes
authentifiées.

### Deux surfaces pour changer de langue, une seule mécanique

`useLocaleSwitch()` (`src/i18n/use-locale-switch.ts`) porte le geste — cookie,
appel au compte, navigation — et rien d'autre ne doit le réimplémenter : l'ordre
des écritures est subtil (cf. ci-dessus) et deux copies finiraient par diverger.

- **`LocaleSwitcher`** (en-tête de la vitrine et de tous les espaces) : un menu
  déroulant globe + code, remplaçant le commutateur segmenté « FR | EN ». Les
  noms de langue y sont écrits **dans leur propre langue** (« English », jamais
  « Anglais ») : c'est la seule forme qu'un locuteur reconnaît depuis l'autre
  interface, et c'est la convention de tous les sélecteurs du Web.
- **`LanguageSettingsCard`** (`components/dashboard/`, montée dans
  `ProfileSettingsTab`, donc présente dans les **quatre** espaces) : le même
  geste, mais présenté comme un RÉGLAGE. Une bascule dans l'en-tête se lit
  « montre-moi cette page en anglais » ; un réglage se lit « je suis
  anglophone ». La carte dit explicitement ce que l'en-tête laissait supposer :
  ce choix gouverne aussi les emails, les bulletins PDF et les notifications —
  tout ce qui part du serveur quand personne n'est devant l'écran, et qui ne
  peut donc pas lire un cookie.
- Pas de bouton « Enregistrer » : l'enregistrement est l'effet du choix. Une
  validation en deux temps créerait un état où la langue affichée diffère de la
  langue cochée, ce qui n'a aucun sens pour un réglage dont l'effet est d'être
  immédiatement visible.

⚠️ **`DropdownMenuLabel` est le `Menu.GroupLabel` de Base UI : il exige un
`DropdownMenuGroup` au-dessus de lui.** Sans ce parent, le menu lève à
l'ouverture (« MenuGroupContext is missing »). Ni le nom — qui évoque un simple
titre — ni les types ne le disent : le défaut passe `pnpm type-check` ET
`pnpm build`, et ne se voit qu'en dépliant le menu pour de vrai. Piège vécu.

### Frontend — `next-intl`, préfixe EN seulement

```
src/i18n/
├── routing.ts      # LOCALES, DEFAULT_LOCALE, localePrefix 'as-needed', isAppLocale/asAppLocale
├── detect.ts       # prefersFrench() / resolveLocale() — la règle ci-dessus
├── navigation.ts   # ⚠️ SEULE source autorisée de Link/useRouter/usePathname/redirect
├── request.ts      # chargement des catalogues
└── metadata.ts     # localePath() / localeAlternates() (hreflang)

messages/{fr,en}/   # 19 domaines, ~1830 clés par langue
```

- **`localePrefix: 'as-needed'`** : le français garde les URL actuelles
  (`/a-propos`, `/dashboard/admin`), l'anglais prend `/en/*`. Aucun lien,
  favori ni référencement existant ne casse.
- **⚠️ `next/link` et `next/navigation` sont INTERDITS** dans les pages :
  importer depuis `@/i18n/navigation`, sinon les liens perdent le préfixe
  `/en` **silencieusement** (pas d'erreur, juste un visiteur anglophone
  ramené en français). Une règle ESLint l'interdit.
- **`middleware.ts`** cumule trois responsabilités dans un ordre imposé :
  résolution de langue → redirection de détection → garde auth/rôle **sur le
  chemin débarrassé de son préfixe**. Sans ce débarras, `/en/dashboard/admin`
  ne correspondrait à aucune règle et serait accessible sans session.
- **Vocabulaire métier anglais — correspondance 1:1 avec le français**, sur
  décision de l'utilisateur. `section` → **`section`**, `groupe` → **`group`**
  (d'où le slug `/en/our-sections`).
  ⚠️ L'anglais faisait auparavant un **double décalage** : `Section` rendu par
  « group » et `Group` par « class ». Il fallait le défaire des deux côtés en
  même temps, certaines phrases portant les deux termes (« un seul groupe actif
  par section »). Une substitution automatique s'y casse les dents — casse,
  pluriels et chevauchements — et le catalogue se contredisait déjà lui-même
  (`rbac.json` disait « sections and groups » quand `organization.json` disait
  « groups and classes »). Les 71 entrées ont été réécrites à la main, puis
  l'absence de décalage résiduel vérifiée dans les deux sens, par comparaison
  automatique du français et de l'anglais clé par clé.
  ⚠️ **Cette correction n'avait d'abord porté que sur les catalogues du
  frontend** : `app/locales/en.py` est resté en arrière, si bien que
  l'interface disait « section » là où l'API répondait « group » pour la même
  chose (9 entrées). La parité des clés et des paramètres ne pouvait pas le
  voir — les deux chaînes existaient et portaient les mêmes `{…}`. D'où
  `test_i18n.py::test_business_vocabulary_matches_one_to_one`, qui contrôle la
  correspondance TERME à terme : une entrée française parlant de « groupe »
  doit dire « group » et jamais « class », et inversement pour « section ».
  (« en classe », le lieu, n'est pas l'entité « groupe » : seul le mot employé
  pour TRADUIRE `groupe`/`section` est contrôlé.)
  ⚠️ **Ne jamais interpoler un nom d'entité écrit en dur dans un message
  traduit.** `organization/service.py` composait son 404 avec
  `{"departments": "Département", …}`, donc « Département not found in this
  establishment » pour un lecteur anglophone. Les quatre libellés
  (`organization.unit.*`) sont au catalogue, avec un repli explicite plutôt
  qu'une clé devinée depuis `__tablename__` — `t()` renverrait la clé telle
  quelle.
  Les noms de sections restent en français (Étoile, Nuage, Soleil,
  Petite/Moyenne/Grande Section) : ce sont des noms propres. `crèche` →
  `nursery`, `garderie` → `after-school care`, `maternelle` → `preschool`.
  L'établissement accueille **de 3 mois à 6 ans** — borne confirmée par
  l'utilisateur. Deux endroits annonçaient « 3 mois à 8 ans » (sous-titre de la
  page des sections, option d'âge du formulaire de contact) ; corrigés dans les
  deux langues. Toutes les bornes concordent désormais : garderie 3–6 ans,
  Grande Section 5–6 ans, pied de page et statistiques 3 mois à 6 ans.

- **Slugs traduits pour les pages PUBLIQUES** (`src/i18n/slugs.ts`) :
  `/a-propos` ↔ `/en/about`, `/galerie` ↔ `/en/gallery`, etc. L'espace connecté
  garde ses chemins (`/en/dashboard/admin`) : ces URL ne se partagent pas et ne
  s'indexent pas.
  - ⚠️ **`pathnames` de next-intl a été écarté sciemment.** Le déclarer rend le
    typage de `href` strict pour TOUTE l'application : 56 routes à énumérer et
    61 `href` dynamiques à convertir en `{pathname, params}` — cent cinquante
    points d'appel, dont tout l'espace connecté, pour sept URL publiques.
  - Le mécanisme tient en trois endroits : `marketingPath()` pour les liens
    sortants, le middleware pour la réécriture entrante, `localePath()` pour
    `hreflang` et le plan du site.
  - La forme non canonique (`/en/a-propos`) **redirige en 308** vers le slug
    anglais : deux URL pour une page, c'est du contenu dupliqué.
  - ⚠️ La réécriture doit reporter les en-têtes de `next-intl`, pas seulement
    changer le chemin. Deux pièges s'y cumulent, et chacun a son symptôme :
    lui passer la main rend `next()` sur la requête d'origine (404 muet) ;
    réécrire seul perd l'en-tête de locale, et `requestLocale` retombe sur le
    français — page au **titre anglais et au corps français**, que seule une
    vraie page ouverte à l'écran révèle.
  - `check-marketing-slugs.mjs` garde l'ensemble : carte cohérente avec les
    routes réelles, et aucun lien qui court-circuite `marketingPath` — ni en
    littéral (`href="/galerie"`), ni en indirect (`href={item.href}` depuis
    `MARKETING_NAV`, la forme qui a échappé deux fois à la première version).

### Backend — catalogues plats + ContextVar

```
app/core/i18n.py    # Locale, t(), current_locale(), coerce_locale(), format_long_date()
app/locales/{fr,en}.py   # 334 clés par langue : errors, emails, push, reports,
                         # date, validation, conversations, import, attendance, children
```

**Pourquoi une ContextVar plutôt qu'un paramètre `locale` partout** : les
`HTTPException` sont levées au fond des services, loin du routeur qui connaît
la requête. Propager la locale dans chaque signature aurait touché presque
toutes les fonctions du backend pour un seul paramètre. Une `ContextVar` est
isolée par tâche asyncio (deux requêtes concurrentes ne se marchent pas
dessus) et traverse les `await`.

Elle est posée **deux fois par requête** : d'abord depuis `Accept-Language`
(middleware HTTP), puis affinée par `users.locale` dès l'authentification.

```python
t("errors.children.not_found")                     # langue de la requête
t("emails.welcome.subject", user.locale, name=...)  # langue imposée
```

**Passer la locale explicitement pour tout ce qui sort du cycle
requête/réponse** — un email part vers UN destinataire, dans SA langue, qui
n'est pas celle de l'admin qui a déclenché l'envoi.

Repli : clé absente → tentative en français → à défaut la clé elle-même, avec
un avertissement journalisé. Une chaîne manquante dégrade l'affichage, elle ne
casse jamais une réponse HTTP.

### Emails — un environnement Jinja2 par langue

`app/modules/{auth,attendance,library,reports}/templates/{fr,en}/` — les 8
templates sont dédoublés, choisis d'après `users.locale` du destinataire. Les
environnements Jinja2 sont construits au chargement du module (un par langue) :
le rendu ne fait plus qu'indexer.

### Notifications push — rendues PAR destinataire

Un même événement (diffusion, rapport validé) touche des parents de langues
différentes : la locale **ne peut pas** être résolue en amont. Les services
passent des **clés** (`title_key`, `body_key`, `body_params`) et
`notifications/service.py` rend `t(key, locale)` **à l'intérieur** de la boucle
d'envoi.

### Documents générés — locale en paramètre EXPLICITE

| Document | Fichier | Langue |
|---|---|---|
| Bulletin annuel (PDF) | `reports/pdf.py` | `users.locale` du parent |
| Export présences (PDF + Excel) | `attendance/export.py` | Compte de l'appelant |
| Modèle / export enfants (XLSX, CSV) | `children/export.py` | Langue de la requête |

Jamais `current_locale()` ici : le rendu part dans un thread
(`asyncio.to_thread`), hors du contexte de la requête, et s'adresse souvent à
quelqu'un d'autre que l'appelant.

⚠️ **Les EN-TÊTES de colonnes de l'import/export enfants ne sont PAS
traduits** — ce sont les identifiants du format d'échange (`IMPORT_COLUMNS`),
reconnus tels quels à la relecture. Un export anglais à en-têtes anglais ne
serait pas réimportable, alors que le round-trip export → import est la raison
d'être du format. Seuls l'aide, les titres de feuille et le nom du fichier
suivent la langue.

### Codes stables : l'API ne parle aucune langue (deux exceptions)

Principe déjà posé ailleurs dans ce fichier (« la base ne dépend jamais du
texte affiché »), étendu à l'API :

- `GET /rbac/permissions` renvoie **le code seul**, plus de `label`. Ces
  libellés n'alimentent aucun document : ils vivent dans
  `messages/{locale}/rbac.json`.
- Le champ `statut` du rapport d'import enfants renvoie `created` / `updated` /
  `rejected`, plus « créé » / « mis à jour » / « rejeté » que le frontend
  comparait littéralement.
- Les lignes de l'export présences portent des codes (`present`, `child`…) ;
  le rendu pose les libellés.

**Exception assumée — `GET /reports/vocabulary`** renvoie des libellés
**traduits dans la langue de l'appelant**, parce que le PDF du bulletin annuel
lit exactement les mêmes 44 chaînes : une seconde copie côté frontend finirait
par diverger. ⚠️ **La locale doit donc faire partie de la clé de cache React
Query** — sans elle, un changement de langue continue de servir la réponse
précédente. Le hook `useReportVocabulary()` s'en charge.

**Exception assumée — `reports.period_label`** : la colonne conserve le
libellé français posé à la création, mais **ce n'est plus ce qui s'affiche**.
L'API et les documents le recalculent à la lecture depuis
`period_start`/`period_end` via `reports/service.py::period_label()`. Un
libellé figé en base ne peut pas suivre la langue du lecteur — or le même
rapport est lu par une éducatrice francophone et un parent anglophone.

### Contenu rédigé par l'établissement — traduction automatique

Blog et menus sont écrits **une seule fois, en français** ; la version anglaise
est générée puis **stockée** (`app/core/translation.py`, Claude Haiku 4.5 par
défaut). Jamais calculée à la lecture : le site vitrine doit rester instantané,
indexable, et debout quand l'API de traduction tombe.

**Deux moteurs, un seul contrat** (`TRANSLATION_PROVIDER`) :

| | `anthropic` (défaut) | `libretranslate` |
|---|---|---|
| Qualité | Meilleure, surtout sur le ton | Honnête sur du français courant, en retrait sur les tournures |
| Coût | Payant à l'appel | **Gratuit, sans limite** |
| Dépendance | Clé API, connexion sortante | Un conteneur à faire tourner |
| Confidentialité | Le contenu part chez un tiers | Auto-hébergé : **rien ne quitte le serveur** |
| Exige | `ANTHROPIC_API_KEY` | `LIBRETRANSLATE_URL` |

Les deux respectent le même contrat — même nombre d'éléments en sortie qu'en
entrée, même ordre, `TranslationUnavailable` sur tout échec — si bien que la
mémoire, le dédoublonnage, le repli et les trois invariants ci-dessous valent
pour l'un comme pour l'autre. Changer de moteur ne demande qu'une variable.

LibreTranslate se lance avec le profil dédié du compose, hors du démarrage
normal (l'image embarque les modèles de langue, plusieurs Go) :

```bash
docker compose --profile translate up -d
# puis, dans backend/.env :
#   TRANSLATION_PROVIDER=libretranslate
#   LIBRETRANSLATE_URL=http://libretranslate:5000
```

⚠️ **Un appel HTTP par élément** côté LibreTranslate, à dessein : le tableau
dans `q` existe sur les versions récentes mais n'est pas garanti sur une
instance quelconque, et un tableau refusé ferait échouer tout le lot. La
mémoire dédoublonne déjà en amont, et une instance locale répond en quelques
dizaines de millisecondes.

⚠️ **La mémoire est partagée entre moteurs** : une entrée produite par Claude
est resservie telle quelle sous LibreTranslate, et inversement. C'est voulu —
on ne retraduit pas ce qui l'est déjà, et la cohérence d'un libellé d'une
semaine à l'autre prime sur l'homogénéité de style entre moteurs.

**Trois invariants, chacun sous test (`tests/e2e/test_translation.py`) :**

1. **L'humain a le dernier mot** — pour le blog ET pour les menus, avec une
   granularité différente parce que l'unité éditoriale diffère.
   - **Blog** : `articles.translation_status` (`pending` → `auto` →
     `manual` / `failed`) porte l'état de l'ARTICLE entier. Tant qu'il vaut
     `auto`, modifier le texte français relance la traduction ; dès qu'un
     rédacteur a corrigé l'anglais (`manual`), la machine n'y touche plus, même
     après dix modifications du français. Seul
     `POST /articles/{id}/retranslate` — un geste explicite — reprend la main.
   - **Menus** : pas de statut de semaine, un **marquage par CRÉNEAU** dans la
     branche `manual` du JSONB (`{jour: {créneau: true}}`). Geler les 20
     créneaux parce qu'un seul plat a été relu empêcherait de traduire ceux
     ajoutés le lendemain — or un menu se remplit jour après jour. Un créneau
     marqué n'est ni renvoyé au modèle ni écrasé ; il perd son marquage dès que
     **son** plat français change (la correction portait sur un autre plat,
     l'afficher serait un contresens — même raisonnement que `_salvage_english`).
2. **Best-effort strict.** Un échec ne bloque jamais une publication ni un
   enregistrement de menu : statut `failed`, repli français à la lecture,
   bouton « Retraduire ». Même politique que la messagerie, à l'opposé du mot
   de passe temporaire (qui bloque parce qu'il EST le seul canal de
   délivrance).
3. **Mémoire de traduction** (`translation_memory`, clé
   `(source_hash, source_locale, target_locale)`) : les menus répètent les
   mêmes plats chaque semaine, une entrée déjà vue ne repart jamais au modèle.
   Au-delà du coût, c'est ce qui garantit qu'un plat est traduit **pareil**
   d'une semaine à l'autre. Table **globale**, pas scopée par établissement :
   « riz au gras » se traduit pareil partout, et c'est un cache linguistique
   sans donnée personnelle.
   ⚠️ N'ayant aucune FK vers `establishments`, elle échappe au
   `TRUNCATE ... CASCADE` de `conftest.py` — vidée explicitement, sinon une
   entrée posée par un test fait sauter l'appel du suivant.

   ⚠️ **Une correction de menu est écrite dans la mémoire** (`is_correction`,
   `ON CONFLICT DO UPDATE`), et c'est ce qui donne son sens au point 1. Sans
   cette écriture, corriger « riz au gras » cette semaine ne servirait à rien :
   la semaine suivante relirait l'entrée posée par la machine et réafficherait
   la même erreur. La machine, elle, n'écrase jamais une entrée existante
   (`ON CONFLICT DO NOTHING`) — l'humain seul peut le faire.
   Deux conséquences assumées : la mémoire étant **globale**, une correction
   vaut pour tous les établissements (cohérent avec le choix d'origine, et une
   relecture humaine vaut mieux qu'une sortie de modèle) ; et `is_correction`
   existe pour qu'un futur rejeu de la mémoire (changement de prompt) puisse
   régénérer l'automatique **sans effacer** le travail de relecture.

**Rapports** : `content_en` (JSONB) porte la version anglaise des seuls champs
de **texte libre**, dans la même arborescence que `content` — notes de santé,
fait marquant, activités, observations par domaine, et la colonne `summary`
via `summary_en`. Les énumérations gardent leurs codes stables, déjà rendus
dans la langue du lecteur par les catalogues et `GET /reports/vocabulary`.

C'est le texte le plus personnel de la plateforme : le laisser en français
revenait à refuser au parent anglophone ce que l'établissement écrit sur son
propre enfant. Le **PDF du bulletin annuel** suit la même règle — il part déjà
dans la langue du parent, son contenu aussi.

- Repli **par CHAMP**, jamais par rapport : un bulletin dont une observation
  manque en anglais affiche les cinq autres traduites.
- En cas d'échec, les champs dont le français n'a pas bougé gardent leur
  traduction ; ceux dont le français a changé la perdent — afficher
  l'observation d'une période révolue sur un enfant serait pire qu'un repli.
- ⚠️ **`translation_pending`**, drapeau DÉRIVÉ recalculé à chaque tentative,
  existe pour que le balayage de reprise reste exact ET bon marché. Les menus
  s'en passent (fenêtre de quelques lignes) ; ici le volume grandit d'un
  rapport par enfant et par jour. Un `content_en IS NULL` n'aurait pas été
  exact : il rate les rapports **partiellement** traduits, ceux qu'une panne en
  cours de modification laisse derrière elle. Sous test, prouvé par sabotage.
- ⚠️ **Piège JSONB** : sans `none_as_null=True`, SQLAlchemy écrit un `null`
  JSON (la valeur) et non un NULL SQL — `WHERE content_en IS NULL` ne ramène
  alors rien alors que la colonne paraît vide côté Python. Piège vécu.

**Diffusions** : `title_en` / `body_en`. Une diffusion part à TOUS les parents
de l'établissement, anglophones compris ; la notification push elle-même part
dans la langue de chaque destinataire (`body_by_locale`), car elle est souvent
la seule chose qu'on lit d'une diffusion.

⚠️ La **vue de gestion garde le français**, même pour un admin dont le compte
est en anglais : c'est ce qu'il a écrit et ce que son formulaire réaffiche. Lui
renvoyer l'anglais lui ferait écraser la source au premier enregistrement.
`title_en` / `body_en` sont exposés à côté, pour corriger sans confondre.
Pas de colonne de statut : la règle est celle des créneaux de menu — une
correction vaut tant que le texte français ne bouge pas.

**Bibliothèque** : `books.description_en` (migration `c4a1f0d93e77`). C'était
le dernier contenu saisi qu'un parent anglophone recevait en français — la
description s'affiche telle quelle dans son portail.

- **Titre et auteur ne sont jamais traduits** : ce sont des noms propres.
  Rendre « Le Petit Prince » par « The Little Prince » renverrait le parent
  vers un livre que l'établissement n'a pas en rayon.
- **Pas de colonne de statut**, comme pour les diffusions : une correction vaut
  tant que le texte français ne bouge pas. Une `description_en` **vidée**
  explicitement signifie « régénère » — même contrat que l'écran de relecture
  des menus, et c'est ce qui évite qu'un formulaire postant toujours son champ
  ne grave une chaîne vide dans la mémoire de traduction.
- La vue de **gestion** garde le français et expose `description_en` à côté ;
  les portails **parent et éducateur** reçoivent `description` déjà dans la
  langue du lecteur, et `description_en` à `null` (l'afficher deux fois n'aurait
  aucun sens).
- `library/tasks.py` balaie les fiches actives à description française sans
  anglais — ce qui rattrape aussi **l'existant**, les lignes antérieures à la
  colonne. Sans ce balayage, un parent anglophone les lirait en français jusqu'à
  ce qu'un admin rouvre la fiche, c'est-à-dire en pratique jamais.

⚠️ **Les conversations privées ne sont PAS traduites** — décision explicite.
Traduire un échange en direct changerait la nature de la fonctionnalité :
l'admin verrait-il en français le message anglais du parent ? C'est le seul
contenu rédigé que la plateforme laisse tel quel.

**Menus** : le JSONB `content` est un arbre `{langue: {jour: {créneau: plat}}}`
(migration `5e16d04b9050`, l'existant remonté sous `fr`). `_localized()` sait
encore lire l'ancienne forme à plat — une donnée JSONB n'a pas de schéma imposé
par la base. Le repli est **par créneau**, pas par semaine : un plat ajouté
pendant une panne s'affiche en français sans faire basculer toute la semaine.
En cas d'échec sur une modification, les traductions dont le texte français
n'a pas bougé sont **conservées** ; celles dont le français a changé sont
écartées (afficher la traduction d'un plat remplacé serait pire qu'un repli).

**Écran de relecture des menus** (`GET`/`PATCH /menus/{week_start}/translation`,
`menus:write`) : français et anglais côte à côte. Trois choix à connaître —
- l'anglais renvoyé est celui qui est **stocké**, sans le repli créneau par
  créneau servi partout ailleurs : cet écran doit montrer les TROUS, c'est ce
  qu'on y cherche ;
- le corps **remplace** la branche anglaise en entier (même contrat que
  `PATCH /menus/{week_start}`) — un créneau laissé vide perd sa traduction et
  son marquage, donc repasse à la machine ;
- **aucune garde « semaine passée »**, contrairement à toutes les autres
  écritures du module. La règle « on ne réécrit jamais l'historique » protège
  ce qui a été SERVI ; une traduction ne dit rien de plus sur le repas. L'interdire
  rendrait incorrigible une erreur repérée le vendredi.

**Reprise planifiée** (`blog/tasks.py`, `menus/tasks.py`, `reports/tasks.py`,
`library/tasks.py`, beat horaire) : la
traduction étant best-effort, un incident passager laissait derrière lui du
contenu que plus personne ne reprenait — le bouton « Retraduire » suppose que
quelqu'un revienne voir l'article. Les deux tâches balaient ce qui est resté
en arrière.
- **Blog** : articles `published` + actifs en `pending`/`failed`, les plus
  anciens d'abord (avec une limite par passage, servir les plus récents ferait
  attendre indéfiniment un article coincé derrière un flux de publications).
  Les **brouillons sont exclus** : invisibles du public, souvent jamais publiés.
- **Menus** : pas de statut à interroger, l'état se lit dans le JSONB
  (`needs_translation()` : un créneau français sans anglais, hors créneaux
  relus à la main). Fenêtre limitée à la **semaine en cours et aux suivantes**,
  les seules qu'un parent puisse lire.
- Les deux ne font **rien** si `TRANSLATION_ENABLED` est faux — sans ce garde,
  chaque passage poserait `failed` sur des articles parfaitement sains.
- ⚠️ Compromis assumé : **aucune limite de tentatives**. Un article qui
  échouerait à chaque passage serait réessayé indéfiniment. Plafonner
  rouvrirait le trou qu'on vient de combler (un contenu abandonné en silence) ;
  le coût reste borné par `limit` × la fréquence du beat.

**Vocabulaires libres — étiquettes d'article et catégories de galerie**
(`blog_tags.name_en`, `blog_gallery_categories.name_en`, migration
`356af593e71c`) : ces deux listes sont créées à la volée par l'établissement et
s'affichent **sur le site vitrine** (les pastilles de filtre de `/actualites` et
`/galerie`). Elles restaient en français sur les pages anglaises.

- Traduction à la création et à chaque **renommage**, best-effort : un échec
  laisse `name_en` à NULL et la lecture publique retombe sur le français.
  Créer une étiquette ne dépend pas d'un service de traduction.
- **Pas de statut `manual` ici**, à la différence des articles. Un `name_en`
  fourni explicitement vaut correction et part dans `translation_memory`, qui
  le restituera à la prochaine traduction du même libellé — y compris pour un
  autre établissement. Pour un nom de deux mots qui revient partout, la mémoire
  tient le rôle du drapeau, et la correction profite à tous.
- ⚠️ Les routes publiques renvoient `name` **déjà dans la langue demandée**
  (`?locale=`), prêt à afficher ; `name_en` n'est exposé que pour l'écran de
  gestion, où le rédacteur édite le français et corrige l'anglais à côté.
  Les trois listes concernées sont `/tags`, `/gallery/categories` et
  `/gallery` (catégorie embarquée dans chaque photo).

**Blog public** : `GET /public/blog/{code}/articles?locale=en`. Le `?locale=`
fait foi — une réponse publique indexable doit dépendre de l'URL seule — avec
repli sur `Accept-Language` pour un lien nu, et sur le français pour une valeur
inconnue (une page vitrine ne renvoie pas 422 à un visiteur). La réponse porte
`locale`, la langue **réellement servie** : quand la traduction manque, le site
affiche le français **avec une mention explicite** plutôt que de laisser le
visiteur croire à un bug.

⚠️ `TRANSLATION_ENABLED=false` par défaut, **y compris en test** : personne ne
doit appeler une API payante pour avoir cloné le repo. La suite substitue un
faux traducteur déterministe — aucun appel réseau.

### Trois gardes de lint i18n — aucune ne suffit seule

`pnpm lint` les enchaîne toutes trois (plus `check-password-policy`, qui ne
relève pas de l'i18n). Chacune couvre un angle mort des deux autres,
et **toutes trois portent sur des défauts silencieux** : rien ne casse, le
type-check passe, la page s'affiche — en français au milieu d'une interface
anglaise.

| Garde | Ce qu'elle attrape | Angle mort des autres |
|---|---|---|
| `check-messages.mjs` | Clé appelée absente du catalogue ; valeur d'énumération sans libellé | Une chaîne en dur n'appelle aucune clé |
| `check-hardcoded-text.mjs` | Texte visible en dur dans le JSX (`JsxText` + `placeholder`/`title`/`alt`/`aria-label`) | Un message Zod vit dans un argument de fonction, pas dans le JSX |
| `check-zod-messages.mjs` | Messages de validation Zod écrits en français | Invisible pour les deux autres, mais s'affiche sous le champ fautif |

Les noms propres (« Les Petits Rayons de Soleil », « LPRDS ») sont en
ALLOWLIST : ajouter tout nouveau nom propre plutôt que le traduire.

Côté backend, `tests/e2e/test_i18n.py` impose la parité : mêmes clés dans les
deux catalogues, **mêmes paramètres d'interpolation** (un `{seconds}` oublié en
anglais n'échoue pas, il affiche la chaîne non interpolée), aucune chaîne vide,
et chaque valeur du vocabulaire des rapports traduite des deux côtés.

### Ajouter une chaîne — la marche à suivre

**Frontend** : ajouter la clé dans `messages/fr/<domaine>.json` **et**
`messages/en/<domaine>.json` (le garde `satisfies Messages` impose la parité),
puis `t('...')`. Un nouveau domaine doit être **enregistré dans
`messages/{fr,en}/index.ts`** — un domaine absent des deux langues ne peut pas
être détecté par le `satisfies`, et la page affiche les clés brutes (piège
vécu).

**Backend** : ajouter la clé dans `app/locales/fr.py` **et** `en.py`, puis
`t("clé")`. Pour une énumération exposée par l'API, ajouter aussi son libellé
frontend sous le groupe correspondant, et le déclarer dans `ENUM_GROUPS` de
`check-messages.mjs`.

**Pluriels et accords** : pluriels ICU côté frontend
(`{count, plural, one {# enfant} other {# enfants}}`), deux clés distinctes
côté backend (cf. `conversations.library_reminder.overdue_one|many`). La règle
de pluriel appartient à la langue, jamais à l'appelant — pas de `+ "s"` en
Python ni en TypeScript.

**Dates** : `format_long_date()` côté backend (l'ORDRE des segments vient du
catalogue via `date.long`, pas du code) ; `useFormatter` / `intlLocale()` côté
frontend. Jamais de `strftime("%A %d %B %Y")` — il dépend de la locale
*système* du conteneur, souvent `C`, donc anglais quoi qu'on demande.

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
# Rotation des badges QR : ancienne SECRET_KEY le temps de réimprimer (vide = aucune)
QR_KEY_PREVIOUS=
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
# Notifications push Web (PWA Phase 2) — clés VAPID (privée JAMAIS exposée au frontend)
VAPID_PRIVATE_KEY=<vapid privée>
VAPID_PUBLIC_KEY=<vapid publique>
VAPID_SUBJECT=mailto:no-reply@lespetitsrayonsdesoleil.fr
# Traduction automatique du contenu saisi (blog, menus) — cf. section
# « Internationalisation ». Best-effort strict : un échec ne bloque jamais une
# publication, le site vitrine retombe sur le français.
# ⚠️ Laisser à false en dev ET en test — sinon chaque publication d'article et
# chaque enregistrement de menu appelle une API payante.
TRANSLATION_ENABLED=false
# Moteur : "anthropic" (payant, meilleure qualité) ou "libretranslate"
# (open source, auto-hébergeable, gratuit) — même contrat, cf. ci-dessus.
TRANSLATION_PROVIDER=anthropic
ANTHROPIC_API_KEY=
TRANSLATION_MODEL=claude-haiku-4-5
# Moteur gratuit — service "libretranslate" du compose, profil "translate".
LIBRETRANSLATE_URL=
# Uniquement pour une instance PUBLIQUE qui l'exige ; inutile en auto-hébergé.
LIBRETRANSLATE_API_KEY=
# Au-delà, la requête n'attend plus : statut `pending`, l'utilisateur relance
# depuis l'interface (« Retraduire »).
TRANSLATION_TIMEOUT_SECONDS=20
```

### Frontend — `lprds-frontend/.env`
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=LPRDS - Gestion Crèche
# Code court unique de l'établissement (préfixe de matricule, ex. LPRDS) —
# sert de scope aux endpoints PUBLICS du site vitrine (/api/v1/public/blog/{code}/…)
NEXT_PUBLIC_ESTABLISHMENT_CODE=LPRDS
# Version du bundle, lue AU BUILD (pas au runtime) — sert au sondage
# /version.json qui déclenche le rechargement automatique après déploiement.
# ⚠️ En prod Docker, la fixer (ex. hash git) AVANT `docker compose up --build`.
NEXT_PUBLIC_APP_VERSION=
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
pnpm lint      # eslint + check-messages + check-hardcoded-text + check-zod-messages
               #   + check-locale-resolution + check-marketing-slugs
               #   + check-private-routes + check-password-policy
pnpm build

# Ajouter un composant shadcn
pnpm dlx shadcn@latest add <composant>
```

#### Les trois gardes i18n de `pnpm lint`

Aucune ne suffit seule : elles couvrent trois angles disjoints, et une chaîne
non traduite ne casse jamais rien — ni au type-check, ni à l'exécution.
(`pnpm lint` enchaîne une quatrième garde, `check-password-policy`, qui porte
sur la politique de mot de passe et non sur la traduction.)

| Script | Vérifie | Sans lui |
|---|---|---|
| `scripts/check-messages.mjs` | Toute clé `t('…')` appelée existe au catalogue français | `next-intl` affiche le chemin de la clé tel quel à l'écran |
| `scripts/check-hardcoded-text.mjs --strict` | Aucun texte visible n'est écrit en dur dans le JSX | La chaîne s'affiche telle quelle quelle que soit la langue choisie |
| `scripts/check-zod-messages.mjs --strict` | Aucun message de validation Zod n'est écrit en dur | Le message s'affiche en français sous le champ fautif, au premier formulaire mal rempli |

Le troisième cible les **positions où Zod attend un message** (`.min()`,
`.regex()`, `.refine()`, `message:`, `required_error:`…) — un message vit dans
un argument de fonction, jamais dans le JSX, donc le deuxième ne peut
structurellement pas le voir. Cibler la position plutôt que le fichier évite de
confondre un message avec une valeur d'énumération ou un nom de champ.

⚠️ **`check-hardcoded-text.mjs` a été réécrit après TROIS faux « aucune
occurrence »** — c'est la leçon la plus chère du chantier i18n :

1. l'analyse se faisait ligne à ligne, donc un paragraphe JSX écrit sur
   plusieurs lignes était invisible (toute la page `/offline`) ;
2. la détection reposait sur les accents et une poignée de mots-outils, donc
   « Hors ligne », « Retour », « Annuler » passaient — 78 chaînes ;
3. même élargie, elle ratait les mots isolés sans accent — « Repas »,
   « Personnel », « Oui », « Non », « Tableau de bord » — 148 chaînes.

Les trois échecs venaient de la même racine : **deviner du texte avec une
expression régulière sur du code**. Le fichier est donc désormais analysé par
le compilateur TypeScript (`ts.createSourceFile`), et seuls les nœuds qui sont
réellement du texte affiché sont examinés. La position suffisant à qualifier le
défaut, la question « ce texte est-il français ? » ne se pose plus : **tout**
littéral en position visible est signalé, anglais compris. C'est ce qui ferme
la classe de bug au lieu d'en corriger un symptôme de plus.

Une `ALLOWLIST` en tête de script porte les noms propres, sigles et formats
(LPRDS, PDF, Excel, JPG…) : un fragment n'est signalé que s'il reste des
lettres une fois ces jetons retirés. Lancés sans `--strict`, les scripts
listent sans échouer.

⚠️ **`VISIBLE_ATTRS` ne couvrait que les attributs HTML** (`placeholder`,
`title`, `alt`, `aria-label`). Or les composants du projet passent leur texte
par des **props** — `<ConfirmDialog description=… confirmLabel=…>`,
`<PageHeader description=…>` — et sept chaînes françaises y vivaient, dont six
dans des dialogues de confirmation : désactiver un parent ou un membre du
personnel, retirer une photo de galerie, un document d'enfant, prévenir les
parents d'absents. Toutes s'affichaient en français dans une interface
anglaise. La garde regardait exactement au bon endroit avec une liste trop
courte d'un cran ; `description`, `subtitle`, `confirmLabel`, `cancelLabel` et
`emptyLabel` l'ont rejointe, et le critère reste le même — le NOM qualifie le
défaut, la forme de la valeur (littéral, gabarit) n'a pas à être devinée.

Trois de ces sept chaînes avaient leur clé **déjà présente dans les deux
catalogues**, simplement jamais appelée (`status.confirmBody` côté parents et
personnel, `dashboard.notifyBody` côté présences) : la traduction existait, le
code l'ignorait. Un catalogue complet ne prouve rien tant que personne ne
vérifie qu'il est lu.

⚠️ **Angles morts restants, connus et non couverts** — dans les deux cas la
frontière entre texte affiché et valeur technique (classes CSS, identifiants,
paramètres d'API) n'est pas décidable par la position seule :

1. les littéraux passés dans une expression JSX (`{cond ? 'Oui' : 'Non'}`) —
   les **gabarits**, eux, sont désormais couverts dès qu'ils sont en position
   d'attribut visible ;
2. les **valeurs par défaut de paramètres** — `StatusPill` affichait « Actif »
   dans tout l'espace admin anglophone à cause de
   `activeLabel = 'Actif'`, et douze de ses treize appels ne passaient rien.
   Un composant qui affiche du texte doit le **traduire lui-même**, les props
   ne servant qu'à préciser (la bibliothèque dit « disponible »).

Les occurrences connues sont traitées ; un relevé par AST des valeurs par
défaut littérales ne laisse plus que des valeurs techniques.

⚠️ **Un schéma Zod constant au niveau module ne peut pas appeler `t`** (le hook
n'existe qu'à l'intérieur du composant). Le patron du projet est une fabrique :
`const makeSchema = (t: T) => z.object({…})`, `type Form =
z.infer<ReturnType<typeof makeSchema>>`, puis
`zodResolver(makeSchema(t))` au point d'appel.

La parité fr/en, elle, est tenue par le type : `messages/en/index.ts` porte un
`satisfies Messages` dérivé du français, donc une clé ajoutée d'un seul côté
casse `pnpm type-check`. Ajouter une clé = la poser dans **les deux**
catalogues.

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

⚠️ **`translation_memory` n'a aucune FK vers `establishments`** (cache
linguistique global, pas une donnée métier) : le `CASCADE` ci-dessus ne
l'atteint pas, elle est donc vidée explicitement. Sans ça, une entrée posée par
un test fait sauter l'appel de traduction du suivant — au point de masquer un
échec attendu (piège vécu). Toute future table hors graphe d'`establishments`
devra être ajoutée là.

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
    ├── test_attendance_correction.py      # correction manuelle (PATCH ligne + saisie manuelle, 403 sans write)
    ├── test_reports_workflow.py         # cycle de vie complet (soumission/validation/rejet)
    ├── test_reports_daily_content.py    # contenu structuré quotidien + pièces jointes
    ├── test_reports_bimensuel_content.py
    ├── test_reports_annuel_content.py   # + génération PDF
    ├── test_reports_attachment_rules.py # qui pose une photo et quand ; `submit`
    │                                    #   par un admin renvoie bien « validated »
    ├── test_gallery.py                  # agrégation rapports/messagerie, filtres RBAC
    ├── test_menus.py                    # lecture ouverte vs historique restreint
    ├── test_blog.py                     # workflow publication, soft delete, accès PUBLIC
    ├── test_i18n.py                     # catalogues symétriques, précédence users.locale,
    │                                    #   vocabulaire traduit, correspondance 1:1 section/groupe,
    │                                    #   libellé de période, exports bilingues
    ├── test_translation.py              # blog/menus/rapports/diffusions/descriptions de livres traduits,
    │                                    #   correction `manual` jamais écrasée,
    │                                    #   contrat du moteur LibreTranslate (sans réseau),
    │                                    #   repli sur échec, mémoire de traduction (faux traducteur),
    │                                    #   correction de menu propagée à la semaine suivante,
    │                                    #   reprise planifiée (tâches Celery appelées directement)
    ├── test_library.py                  # catalogue, prêts/retours, rappels + granularité read/write/lend,
    │                                     #   borne de pagination alignée sur le reste de l'API
    ├── test_messaging_scope_and_media.py # diffusions ciblées par départements, vidéo en conversations
    ├── test_messaging_edit_delete.py # édition (15 min, auteur), suppression douce, lot + quota 15,
    │                                 #   retrait PJ, pagination curseur before_id
    ├── test_hardening.py                # rate limiting /auth/login, format d'erreur uniforme
    └── test_schema_drift.py             # modèles ↔ schéma migré (cf. « Registre central »)
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

## Tâches planifiées — worker et beat

Deux services du compose, `worker` et `beat`, démarrés avec le reste
(`docker compose up`). Ils réutilisent l'image du backend mais **pas son
entrypoint**, qui migre, seede et lance uvicorn : `entrypoint: []` le neutralise
explicitement, sinon trois conteneurs migreraient la base en même temps.

| Tâche | Quand |
|---|---|
| `library.send_due_reminders_all` | 07:00 UTC |
| `blog.retry_missing_translations` | toutes les heures à :05 |
| `menus.retry_missing_translations` | :20 |
| `reports.retry_missing_translations` | :35 |
| `library.retry_missing_translations` | :50 |

⚠️ **`beat` est un service SÉPARÉ, jamais `worker --beat`.** Le beat est un
ordonnanceur : il ne doit exister qu'en un exemplaire. Fusionné au worker, il
repartirait avec chaque réplique, et passer les workers à deux doublerait chaque
rappel reçu par un parent. La séparation permet de monter les workers sans
jamais toucher au nombre d'ordonnanceurs.

⚠️ **`crontab()` et non un intervalle en secondes.** Le planning disait
`60*60*24` sous un commentaire annonçant « chaque matin à 07:00 » : un intervalle
part du DÉMARRAGE du beat, donc les rappels seraient tombés à l'heure du dernier
déploiement — 3 h du matin chez le parent si la mise en production avait eu lieu
à 3 h. Personne ne pouvait le voir tant que rien ne tournait. Les quatre
rattrapages sont décalés de quinze minutes : ils tapent le même fournisseur de
traduction, et un lot simultané est le moyen le plus sûr de s'y faire limiter.

Réglages du worker, et ce qu'ils supposent :
- `task_acks_late` + `worker_prefetch_multiplier=1` — un worker tué en plein
  envoi rend sa tâche à la file au lieu de la perdre. Tenable **parce que**
  toutes les tâches sont idempotentes par construction (anti-doublon journalier
  `last_reminded_on`, mémoire de traduction, balayages qui ne sélectionnent que
  ce qui manque). Une future tâche non idempotente devra le reconsidérer.
- `task_soft_time_limit` 10 min / `task_time_limit` 12 min — un balayage parti
  en vrille ne doit pas occuper le worker ni retarder les rappels du matin.
- `broker_connection_retry_on_startup` — en conteneur, le worker démarre souvent
  avant que Redis accepte des connexions. Celery réessaie aujourd'hui par
  défaut, plus en 6.0 ; sans ce réglage, `restart: unless-stopped` masquerait en
  boucle un worker qui sort une seconde trop tôt.
- L'état du beat vit dans le volume `lprds_celery_beat` : sans lui, chaque
  redémarrage repart d'une ardoise vierge et refait tomber les échéances passées
  — inoffensif grâce à l'idempotence, mais un parent recevrait un second rappel
  à chaque déploiement.
- `worker` et `beat` attendent `backend: service_healthy` (healthcheck sur
  `/health/ready`), pas `service_started` : l'entrypoint du backend est le seul à
  migrer, et une tâche partie avant aurait un schéma d'avance sur elle.

## ⚠️ Tâches Celery : jamais le moteur global

Une tâche Celery s'exécute par `asyncio.run(...)`, qui ouvre une boucle neuve
puis la ferme **à chaque passage**. Or une connexion asyncpg appartient à la
boucle qui l'a créée : réutiliser `AsyncSessionLocal` reviendrait, au deuxième
passage du beat, à piocher dans le pool une connexion rattachée à une boucle
fermée. Le premier passage marcherait, les suivants non — le pire profil de
panne qui soit, invisible en test comme au premier lancement.

Toute tâche passe donc par **`task_sessions()`** (`app/core/database.py`) :
moteur jetable, `NullPool`, refermé en sortie. Même raisonnement que le moteur
jetable de `tests/conftest.py`. Les cinq tâches (`library` ×2, `blog`, `menus`,
`reports`) l'utilisent.

---

## Docker

`Dockerfile` (image unique, `docker/entrypoint.sh` exécute `alembic upgrade
head` puis `python -m app.core.seed` avant `uvicorn`) + `docker-compose.yml`
(Postgres 16, Redis 7, backend — healthchecks, volumes nommés pour les
données Postgres et les fichiers uploadés).

```bash
docker compose up --build
```

Un quatrième service, `libretranslate`, est derrière le **profil `translate`** :
il ne démarre pas par défaut (son image embarque les modèles de langue,
plusieurs Go) et n'a de sens que si `TRANSLATION_PROVIDER=libretranslate`.

```bash
docker compose --profile translate up -d
```

`DATABASE_URL`/`REDIS_URL` sont **surchargées** dans `docker-compose.yml` vers
les noms de service Docker (`db`, `redis`) quoi que dise le `.env` local (qui
pointe vers `localhost` pour un usage hors conteneur) — évite le piège
classique « ça marche en local mais pas en conteneur ».

Deux services supplémentaires, `worker` et `beat`, portent les tâches
planifiées — cf. § « Tâches planifiées ».

> ⚠️ Le build de l'image n'a **pas** été exécuté dans l'environnement où ces
> fichiers ont été écrits. `docker compose config` valide la syntaxe et le
> graphe de services, et le worker comme le beat ont été lancés hors conteneur
> (tâche mise en file, exécutée, et échéance `crontab` déclenchée à la seconde
> attendue) — mais un vrai `docker compose up --build` reste à passer avant de
> s'y fier en CI/déploiement.

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
- **🌍 Jamais de texte destiné à l'utilisateur écrit en dur** — `HTTPException.detail`,
  `ValueError` de validateur Pydantic, corps d'email, libellé de document :
  tout passe par `t()` et les catalogues `app/locales/` (cf. §
  Internationalisation). Locale **explicite** dès que la sortie quitte le
  cycle requête/réponse (email, PDF, push)
- **UUIDs** pour toutes les clés primaires
- **Timestamps** `created_at` / `updated_at` sur tous les modèles
- **Politique de mot de passe centralisée** : utiliser le type `StrongPassword`
  de `auth/schemas.py`, ne pas redéfinir de validator (min 8 + majuscule + chiffre).
  Son miroir frontend est `passwordField()` (`lib/validation/password.ts`) — les
  deux doivent dire la même chose, sinon l'API refuse un mot de passe que le
  formulaire venait d'accepter. Durcir la règle = toucher ces **deux** fichiers,
  et eux seuls.
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
- **Validation Zod** sur tous les formulaires via `zodResolver` — les messages
  d'erreur passent par une **fabrique de schéma** prenant le traducteur
  (`makeXSchema = (t) => z.object({...})`), jamais de message écrit en dur
- **🔒 Champ mot de passe : `passwordField(tAuth)`**, et pour un formulaire
  avec confirmation **`passwordConfirmation(tAuth)`** (qui porte déjà le
  `.refine()` de concordance, `path: ['confirm']`) — tous deux dans
  `lib/validation/password.ts`, jamais une chaîne de `.min(8).regex(…)`
  recopiée. La règle vivait en **huit** exemplaires identiques (création et
  réinitialisation du personnel, des parents, des administrateurs
  d'établissement, premier mot de passe, profil) : huit occasions de la durcir
  à sept endroits sur huit. Le helper attend le traducteur du domaine
  **`auth`**, seul foyer des trois libellés (`auth.validation.password{Min,
  Upper,Digit}`) — d'où le second traducteur passé aux fabriques concernées :
  `makeSchema(t, tAuth)`. Ne pas recréer de `password*` dans un autre domaine.
  Des champs en plus s'ajoutent par `.extend()` — ce que Zod 4 autorise après un
  `.refine()` **en conservant** le raffinement (Zod 3 le perdait sans erreur) ;
  `scripts/check-password-policy.mjs` le vérifie, et **fait partie de
  `pnpm lint`**. Il importe un module TypeScript, donc exige le retrait de types
  natif de Node (22.18+) : sur un Node plus ancien il l'annonce et sort en
  succès plutôt que de casser le contrôle. Une garde correcte que personne ne
  lance ne protège rien — cf. les trois faux « zéro » de
  `check-hardcoded-text.mjs`
- **Imports** : toujours via alias `@/` (ex: `@/components/ui/button`)
- **🌍 Jamais de texte visible écrit en dur** — ni dans le JSX, ni dans un
  message Zod, ni dans un `placeholder`/`title`/`alt`/`aria-label`. Toute
  chaîne passe par les catalogues (cf. § Internationalisation). Trois gardes
  de lint le vérifient ; aucune ne suffit seule, et **le défaut est
  silencieux** : rien ne casse, la page s'affiche, simplement en français au
  milieu d'une interface anglaise
- **🌍 `next/link` et `next/navigation` sont interdits** — importer
  `Link`/`useRouter`/`usePathname`/`redirect` depuis `@/i18n/navigation`,
  sinon les liens perdent le préfixe `/en` sans la moindre erreur

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
- **Révocation de tokens** active (blacklist `jti` dans Redis, fail-closed en 503)
- **Jamais de mot de passe en clair dans un email** — c'est pourquoi la création
  d'admin via établissement n'envoie pas d'email
- **Rate limiting** actif sur `/auth/login` (compteur Redis par (IP, email) —
  cf. § « Anti brute-force »). Toujours absent sur `/auth/password-reset` et sur
  l'envoi de messages/fichiers : à implémenter, Redis est déjà branché

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
  - `send_message()` : push au DESTINATAIRE après publication — aux admins si
    l'expéditeur est le parent, au seul parent de la conversation
    (`parent_ids={...}`) si l'expéditeur est un admin (aperçu du texte, ou
    « Nouvelle pièce jointe » si corps vide)
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
