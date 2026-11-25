# System Architecture (C4 Models & Engineering Decisions)

This document outlines the software architecture of **Reservas App**, a multi-staff appointment booking and schedule management platform modeled with the **C4** approach.

---

## 1. Level 1: System Context Diagram

```mermaid
flowchart TD
    Customer["Customer / Patient\n(Web Browser / Mobile PWA)"]
    Provider["Provider / Specialist\n(Scoped /admin Portal)"]
    Admin["Business Owner / Admin\n(Full /admin Portal)"]

    System["Reservas App Platform\n(Next.js 16 Full-Stack Application)"]

    GoogleOAuth["Google OAuth 2.0\n(Optional Identity Provider)"]
    WhatsApp["WhatsApp Deep Links\n(wa.me client notices)"]
    MapsGeo["Google Maps & OpenStreetMap\n(Keyless iframe + Nominatim geocoding)"]
    PushServices["Browser Push Endpoints\n(FCM / Mozilla / Apple Web Push)"]

    Customer -->|"Browses catalog, books & manages appointments"| System
    Provider -->|"Manages personal agenda, shifts & overrides"| System
    Admin -->|"Configures branding, services, team & schedules"| System

    System -->|"Validates OAuth state & ID tokens"| GoogleOAuth
    System -->|"Builds pre-filled wa.me links"| WhatsApp
    System -->|"Embeds branch map & resolves addresses"| MapsGeo
    System -->|"Sends RFC 8292/8291 encrypted push payloads"| PushServices
```

---

## 2. Level 2: Container Diagram

```mermaid
flowchart LR
    Browser["User Browser / Mobile PWA\n(React 19 + Service Worker sw.js)"]

    subgraph NextServer["Next.js 16 Standalone Server (Node.js)"]
        SSRPages["SSR App Routes\n(/, /admin, /terminos, /privacidad,\nsitemap, manifest, OG images)"]
        APIRoutes["REST & SSE Route Handlers\n(/api/health, /api/bootstrap, /api/availability,\n/api/appointments/*, /api/admin/*,\n/api/auth/*, /api/events, /api/push/*)"]
        DomainLib["Core Services & Infrastructure\n(booking/schedule/staff/reminder-service,\nslot-engine, ssrf-guard, timezone, session, web-push)"]
        PrismaORM["Prisma ORM Client\n(WAL Pragmas + withImmediateLock)"]
    end

    subgraph DataStore["Persistence Layer"]
        DB[("Relational Database\nSQLite WAL (Docker/Dev)\nor PostgreSQL (Managed)")]
    end

    Browser -->|"HTTPS SSR / Assets"| SSRPages
    Browser -->|"REST JSON & EventSource SSE"| APIRoutes
    SSRPages -->|"Direct server preload"| DomainLib
    APIRoutes -->|"Rules, auth, SSE & outbox"| DomainLib
    DomainLib -->|"Typed queries & transactions"| PrismaORM
    PrismaORM -->|"SQL"| DB
```

---

## 3. Level 3: Component & Module Map

```mermaid
flowchart TD
    subgraph ClientUI["Frontend Components & Hooks (src/components & src/hooks)"]
        ClientApp["ClientApp.tsx + components/client/*\n(4-Step Booking Wizard, QR/Calendar, History)"]
        AdminApp["AdminApp.tsx + components/admin/*\n(Agenda KPIs, Walk-In, Shifts, Team, Settings)"]
        SharedModals["shared/RescheduleModal + ui/AccessibleModal"]
        MapsUI["BranchMap.tsx (Google Maps Embed)\nInteractiveMapPicker.tsx (Lazy Leaflet Picker)"]
        Hooks["Custom Hooks\n(admin/*, useAdminShifts, useAvailabilitySlots,\nuseClientRealtimeSync, usePushNotifications)"]
    end

    subgraph Controllers["Next.js 16 Proxy & Route Handlers (src/proxy.ts + src/app/api)"]
        HealthAPI["/api/health"]
        AvailabilityAPI["/api/availability"]
        AppointmentsAPI["/api/appointments/*\n(create, reschedule, cancel, ack-move, history)"]
        AdminAPI["/api/admin/*\n(appointments, day-override, shifts, staff,\nservices, settings, geocode, push/dispatch)"]
        AuthAPI["/api/auth/*\n(login, register, google, staff-invite, switch)"]
        RealtimeAPI["/api/events (SSE)\n/api/push/* (subscribe, reconcile, test)"]
    end

    subgraph Domain["Services & Security Modules (src/lib)"]
        Services["src/lib/services/*\n(booking, schedule, staff, reminder)"]
        SlotEngine["slot-engine.ts, timezone.ts & acceptance-criteria.ts\n(Slots, shifts, override bounds, IANA time)"]
        Lifecycle["booking-rules.ts & appointment-lifecycle.ts\n(2-reschedule cap, status guards, idempotency)"]
        Security["session.ts, api-guard.ts, ssrf-guard.ts, rate-limit.ts\n(Scoped HMAC cookies, CSRF, 1-hop proxy IP, SSRF)"]
        Delivery["realtime-events.ts & web-push.ts\n(Filtered SSE + RFC 8292/8291 Push Outbox)"]
    end

    ClientApp --> Hooks
    AdminApp --> Hooks
    ClientApp --> SharedModals
    AdminApp --> SharedModals
    ClientApp --> MapsUI
    AdminApp --> MapsUI

    Hooks --> AvailabilityAPI
    Hooks --> AppointmentsAPI
    Hooks --> AdminAPI
    Hooks --> AuthAPI
    Hooks --> RealtimeAPI

    AvailabilityAPI --> Services
    AppointmentsAPI --> Services
    AdminAPI --> Services
    Services --> SlotEngine
    Services --> Lifecycle
    Services --> Delivery
    Controllers --> Security
```

---

## 4. Level 4: Deployment Profiles

### Profile A: Containerized Single-Node (Oracle Cloud E2.1.Micro 1 GB AMD64 + GHCR + SQLite WAL)
- Multi-stage `Dockerfile` (`node:24-alpine` + `linux/amd64` + Next.js `output: "standalone"` + `NODE_OPTIONS="--max-old-space-size=384"`).
- GitHub Actions (`docker-publish.yml`) runs strictly after [`ci.yml`](../.github/workflows/ci.yml) passes and pushes to `ghcr.io/cristianarando/reservation-microsystem`.
- `docker-compose.yml` binds `127.0.0.1:3000:3000` (fronted by direct Nginx/Caddy with `TRUSTED_PROXY_HOPS=1`), limits memory (`mem_limit: 650m`, `memswap_limit: 900m`), probes `GET /api/health`, and mounts `./data:/app/data` for SQLite WAL + rotating backups (`docker-entrypoint.sh` + `prisma migrate deploy`).
- `src/instrumentation.ts` starts the 5-minute Web Push retry/reclaim and 24h/2h reminder outbox worker on Node runtime boot.

### Profile B: Serverless / Managed Cloud (Vercel + Managed PostgreSQL)
- Switch `prisma/schema.prisma` datasource to `"postgresql"` for Neon/Supabase/RDS clusters.
- Note: in-memory SSE subscribers (`realtime-events.ts`) and in-memory rate-limit buckets (`rate-limit.ts`) are scoped per Node instance and should be backed by a shared pub/sub + Redis store if horizontally scaled across multiple instances.

---

## 5. Key Architectural & Security Decisions

1. **Decoupled Pure Business Logic (`src/lib`):** `slot-engine.ts`, `booking-rules.ts`, `acceptance-criteria.ts`, and `input-validators.ts` have zero HTTP/React dependencies, enabling sub-second deterministic unit verification.
2. **Defense-in-Depth RBAC & Session Revocation:** Signed `HttpOnly` `SameSite=Lax` HMAC-SHA256 cookies verified via `timingSafeEqual`, paired with `User.sessionVersion` validation so password changes, privilege upgrades, or staff invite acceptances immediately invalidate prior sessions.
3. **Server-Side SSE Isolation:** `filterRealtimeEventForSubscriber()` strips or suppresses payloads on the server before writing to the SSE stream so unauthenticated visitors and non-owning customers/providers never receive cross-user PII.
4. **Transactional Outbox for Native Web Push:** Notifications and `PushDelivery` records are persisted inside the same Prisma transaction as the booking/cancellation/override mutation, avoiding lost pushes on transient endpoint failures while keeping lock-screen titles/bodies generic.
