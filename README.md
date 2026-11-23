# Reservas App — Multi-Staff Appointment Scheduling & Booking Platform

[![Live Demo](https://img.shields.io/badge/Live%20Demo-citas.cristianarando.dev-16a34a)](https://citas.cristianarando.dev)
[![CI](https://github.com/cristianarando/reservation-microsystem/actions/workflows/ci.yml/badge.svg)](https://github.com/cristianarando/reservation-microsystem/actions/workflows/ci.yml)
[![Docker Publish](https://github.com/cristianarando/reservation-microsystem/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/cristianarando/reservation-microsystem/actions/workflows/docker-publish.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16.4.5-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.x-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-6.x-2D3748?logo=prisma)](https://www.prisma.io/)
[![PWA Ready](https://img.shields.io/badge/PWA-Installable-purple?logo=pwa)](https://web.dev/progressive-web-apps/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A modular, white-label appointment management and online booking platform built for multi-professional service businesses (clinics, barbershops, salons, studios, and consulting practices).

**Live Deployment:**
- **Customer Booking Portal:** https://citas.cristianarando.dev
- **Admin & Staff Portal:** https://citas.cristianarando.dev/admin

> **Localization note:** User-facing UI copy and API validation messages are localized in Spanish for LATAM/Bolivia businesses; source code, tests, and technical documentation are maintained in English.

---

## Visual Showcase

| 1. Public Portal & Service Catalog (Desktop & Mobile) | 2. Real-Time Slot Picker & Availability Engine |
| :---: | :---: |
| ![Public Catalog](docs/screenshots/01-portal-cliente-catalogo.png) | ![Slot Picker](docs/screenshots/02-seleccion-horarios-slots.png) |
| **3. Atomic Booking Confirmation** | **4. Team Management & Granular RBAC** |
| ![Booking Confirmation](docs/screenshots/03-confirmacion-cita-qr.png) | ![Team Management](docs/screenshots/04-admin-equipo-permisos.png) |
| **5. Daily Calendar & 1-Touch Schedule Overrides** | **6. Weekly Shifts & Business Hours Configuration** |
| ![Daily Calendar](docs/screenshots/05-admin-agenda-imprevistos.png) | ![Weekly Shifts](docs/screenshots/06-admin-configuracion-horarios.png) |

---

## Core Capabilities

### Customer Booking Portal (`/`)
- **4-Step Booking Wizard:** Service selection → specialist selection → date and slot selection → customer identification and confirmation.
- **Load-Balanced Auto-Assignment (`ANY`):** Automatically assigns an available qualified professional when the customer selects any available staff member.
- **Self-Service "My Appointments" Hub:** Displays active, staff-rescheduled, and archived bookings with cursor-paginated infinite scroll (`/api/appointments/history`).
- **One-Tap WhatsApp Deep-Links:** Generates pre-filled `https://wa.me/` links with appointment date, time, service, and clinic details.
- **Installable PWA & Opt-In Web Push:** `manifest.webmanifest`, network-first service worker excluding private API/session responses from cache, and per-device push notification subscriptions with lock-screen privacy.

### Administrative & Operations Hub (`/admin`)
- **Role-Based Access Control (RBAC):**
  - `ADMIN`: Full access to business branding, catalog, branch location picker, weekly shifts, staff invitations, customer controls, and global calendar.
  - `PROVIDER`: Scoped workspace limited to their own appointments, attendance tracking, and personal schedule overrides (strictly blocked from self-booking as a customer on `/`).
- **Real-Time Live Sync (SSE):** Server-Sent Events (`/api/events`) with server-side per-role and per-staff payload filtering.
- **1-Touch Unplanned Schedule Overrides & Vacations:** Late arrival, early departure, full-day closure, vacation ranges, instant schedule reopening, and atomic conflict resolution (`MOVE_TO_END` or `CANCEL_ALL`).
- **Anti-Hoarding & 2-Strike No-Show Protection:** Configurable cap on active upcoming bookings per customer (`maxActiveBookings`) and automatic web-booking lock after 2 `NO_SHOW` strikes with admin unlock/archive workflow.
- **Dynamic White-Label & SEO/OG:** Configurable brand name, `staffLabel`, currency symbol, theme colors, dynamic `sitemap.xml`, `robots.txt`, JSON-LD metadata, and generated Open Graph / Twitter cards.

---

## Architectural Highlights & Engineering Decisions

1. **Zero-Dependency Native Web Push (`src/lib/web-push.ts`):** Implements RFC 8292 VAPID ES256 JWT signing and RFC 8291 `aes128gcm` payload encryption directly over Node's `node:crypto`, backed by a persistent `PushDelivery` outbox with deduplication (`eventKey`), `Retry-After` backoff, `410 Gone` subscription cleanup, stale-lease crash recovery, and lock-screen safe generic titles.
2. **Server-Side Filtered SSE (`src/lib/realtime-events.ts`):** Broadcasts live updates without leaking PII across tenants/roles—anonymous visitors only receive generic `SCHEDULE_UPDATED` invalidation signals, customers only receive details for their own appointments, and providers only receive events for their own `staffId`.
3. **Hardened Sessions & API Guards (`src/lib/session.ts`, `src/lib/api-guard.ts`):** HMAC-SHA256 `HttpOnly` cookies verified with `timingSafeEqual`, database-backed `sessionVersion` revocation on credential/role updates, staff invite token rotation, Google OAuth CSRF state nonces, `Origin` verification, rate limiting, and strict input/URL sanitization.
4. **Pure Decoupled Domain Engine (`src/lib/slot-engine.ts`, `src/lib/booking-rules.ts`, `src/lib/appointment-lifecycle.ts`):** Pure TypeScript functions handle slot generation, local-date arithmetic (avoiding UTC midnight drift), cancellation notice checks, and formal state transitions (`validateAppointmentStatusTransition`).
5. **Dual Deployment Profile (SQLite WAL vs. PostgreSQL):** Single-container Docker deployments enable SQLite `WAL` mode + `busy_timeout` (`src/lib/prisma.ts`) for simple single-node hosting with zero external DB ops; the Prisma schema can also switch to PostgreSQL for horizontal/serverless scaling.

---

## Repository Structure

```text
reservation-microsystem/
├── .github/workflows/
│   ├── ci.yml                     # TypeScript, ESLint, unit, security, and audit/Web Push CI
│   └── docker-publish.yml         # Multi-stage Docker build & publish to GHCR
├── docs/
│   ├── ARCHITECTURE.md            # C4 context, container, component & deployment diagrams
│   ├── DATABASE.md                # Relational schema, ERD, indexes & migration guide
│   ├── FLOWS.md                   # Sequence diagrams for availability, booking & overrides
│   ├── REQUIREMENTS.md            # Functional/non-functional specs & bug traceability matrix
│   └── screenshots/               # Portfolio screenshots
├── prisma/
│   ├── schema.prisma              # 11-model relational schema (SQLite / PostgreSQL)
│   └── seed.ts                    # Demo clinic, staff, services, shifts & appointments
├── public/
│   ├── avatars/                   # Default SVG avatars & brand fallback
│   └── sw.js                      # Service worker (PWA & Web Push click/display handlers)
├── src/
│   ├── app/
│   │   ├── api/                   # Route handlers (availability, appointments, admin, auth, events, push)
│   │   ├── admin/                 # Role-protected management portal (SSR preloaded)
│   │   ├── cookies|privacidad|terminos/ # Dynamic legal pages
│   │   ├── page.tsx               # Public booking portal (SSR preloaded)
│   │   └── manifest.ts|robots.ts|sitemap.ts|opengraph-image.tsx
│   ├── components/
│   │   ├── admin/                 # Modular admin tabs, header, modals & portal shell
│   │   ├── client/                # Modular 4-step wizard, history tab, auth modal & banners
│   │   ├── ui/                    # Reusable Button, Badge, Card, ConfirmModal, ToastContainer
│   │   ├── BranchMap.tsx          # Keyless Google Maps embed modal for customers
│   │   └── InteractiveMapPicker.tsx # Leaflet/OpenStreetMap location picker for admin
│   ├── hooks/                     # useAdminActions, useAdminShifts, useCustomerHistory, usePushNotifications, useToastQueue
│   ├── lib/                       # Domain engines, lifecycle, bootstrap, SSE, Web Push, SEO & security guards
│   └── types/portal.ts            # Shared TypeScript interfaces for client & admin portals
├── tests/
│   ├── acceptance-criteria.test.ts # 30 unit checks (shifts, slot engine, overrides, booking rules)
│   ├── security-validators.test.ts # 30 checks (XSS URLs, geo parsing, WhatsApp links, time-off dates)
│   ├── audit-and-webpush.test.ts   # 35 DB/crypto checks (SSE isolation, RFC 8291/8292, outbox retries)
│   ├── e2e-full-system.test.ts     # HTTP API & database integration suite against running server
│   └── playwright-suite.ts         # End-to-end Chromium browser verification
├── Dockerfile                      # Multi-stage Node 26 Alpine standalone image
├── docker-compose.yml              # Production Compose setup with persistent /app/data volume
└── deploy.sh                       # Pull-and-restart helper for prebuilt GHCR images
```

---

## Quick Start (Local Development)

### 1. Clone and install dependencies
```bash
git clone https://github.com/cristianarando/reservation-microsystem.git
cd reservation-microsystem
pnpm install
```

### 2. Configure environment variables
```bash
cp .env.example .env
```
Set a random 32+ byte secret for `SESSION_SECRET` (e.g., `openssl rand -hex 32`) when running in production.

### 3. Initialize database and seed demo data
```bash
pnpm db:setup
```

### 4. Start development server
```bash
pnpm dev
```
- **Customer Booking Portal:** `http://localhost:3000`
- **Admin & Staff Dashboard:** `http://localhost:3000/admin`

---

## Pre-configured Seed Accounts (Local Development)

| Role | Name | Email | Password | Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Admin / Owner** | Dr. Alejandro Vega | `alejandro@sonrisa.com` | `Admin123!` | Full business settings, catalog, team, and agenda |
| **Provider (Staff)** | Dra. Sofía Ríos | `sofia@sonrisa.com` | `Doctor123!` | Orthodontics specialist — personal agenda & shifts |
| **Provider (Staff)** | Dr. Marcos Paz | `marcos@sonrisa.com` | `Doctor123!` | Endodontics & emergency shifts — personal agenda |
| **Customer** | Carlos Mendoza | `carlos.cliente@gmail.com` | `Cliente123!` | Public booking wizard & appointment history |
| **Customer** | Lucía Valdez | `lucia.valdez@gmail.com` | `Cliente123!` | Secondary customer seed account |

---

## Automated Testing & Quality Checks

```bash
# TypeScript & ESLint verification
npx tsc --noEmit
pnpm lint

# 1. Pure domain unit tests (30 checks)
pnpm test

# 2. Security & utility validator tests (30 checks)
pnpm test:security

# 3. Audit, SSE isolation & native Web Push integration tests (35 checks, uses DB)
pnpm test:audit

# 4. Full-stack HTTP API integration suite (requires running server on :3000)
pnpm test:e2e

# 5. End-to-end Chromium suite (requires running server on :3000)
pnpm tsx tests/playwright-suite.ts

# Production build check
pnpm build
```

---

## Technical Documentation

- [System Architecture & C4 Models (`docs/ARCHITECTURE.md`)](docs/ARCHITECTURE.md)
- [Database Schema, ERD & Indexes (`docs/DATABASE.md`)](docs/DATABASE.md)
- [Operational Sequence Diagrams (`docs/FLOWS.md`)](docs/FLOWS.md)
- [System Requirements & Traceability Matrix (`docs/REQUIREMENTS.md`)](docs/REQUIREMENTS.md)

---

## Production Deployment

### Option A: Docker + GitHub Container Registry (SQLite WAL)
Pushes to `main` build and publish `ghcr.io/cristianarando/reservation-microsystem:latest` via [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml).
1. Copy `.env.example` to `.env` on your VM and set `SESSION_SECRET` and `NEXT_PUBLIC_APP_URL`.
2. Start the prebuilt container with persistent volume `./data:/app/data`:
   ```bash
   docker compose up -d
   ```
   On startup, `docker-entrypoint.sh` syncs the Prisma SQLite schema and launches Next.js standalone on port `3000`.

### Option B: Vercel + Serverless PostgreSQL
1. Provision a PostgreSQL database (e.g., Neon or Supabase) and set `DATABASE_URL`, `SESSION_SECRET`, and `NEXT_PUBLIC_APP_URL`.
2. Switch `datasource db` provider in `prisma/schema.prisma` from `"sqlite"` to `"postgresql"` and run `pnpm prisma db push`.
3. Import the repository into Vercel with build command `pnpm prisma generate && pnpm build`.

---

## License

Licensed under the **MIT License**. See [LICENSE](LICENSE).
