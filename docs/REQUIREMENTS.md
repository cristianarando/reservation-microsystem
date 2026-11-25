# 📋 System Requirements Specification & Traceability Matrix

This document defines the **Functional Requirements (FR)**, **Non-Functional Requirements (NFR)**, and the **Audited Bug Traceability Matrix** for the booking system.

---

## 1. Functional Requirements (FR)

| ID | Domain | Description | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **FR-01** | Catalog | Expose public service catalog with pricing, durations in minutes, and buffer times. | Loads in < 1s without requiring prior authentication. |
| **FR-02** | Availability | Calculate open booking slots in 30-min increments, excluding past hours and respecting lead time. | Current day never displays slots for past hours. |
| **FR-03** | Auto-Assign | Allow customers to select "Any Available Staff" (`ANY`) for automatic load balancing. | Assigns the first available specialist without collision. |
| **FR-04** | Atomic Booking | Confirm bookings with customer name, required phone number, email, and encrypted password. | Prevents race condition collisions and displays confirmation. |
| **FR-05** | Anti-Hoarding | Restrict customers to a maximum of 2 active concurrent upcoming bookings. | Rejects third booking attempt with clear explanatory notice. |
| **FR-06** | RBAC Scopes | Provide distinct roles: `CUSTOMER` (patient), `PROVIDER` (staff/doctor), and `ADMIN` (owner). | `PROVIDER` accounts cannot book appointments as customers in `/`. |
| **FR-07** | Weekly Shifts | Allow administrators to configure continuous or split working shifts per day of week. | Enforces $T_{end} > T_{start}$ and minimum 30-min duration. |
| **FR-08** | 1-Touch Overrides | Provide quick schedule blocks: "Late Arrival", "Early Departure", and "Close Day". | Creates `TimeOff` record and immediately disables public slots. |
| **FR-09** | Reopen Schedule | Allow administrators to remove a schedule override and restore open slots. | Working slots immediately become bookable again. |
| **FR-10** | Flexible Cancel | Customers can cancel bookings with at least 6 hours of advance notice. | If staff modified the appointment, cancellation is penalty-free. |
| **FR-11** | Anti-Troll Control | Record unexcused absences (`NO_SHOW`) and lock the account on the 2nd strike. | Blocked customers cannot book online and must contact clinic. |
| **FR-12** | White-Label & A11y | Allow business owners to customize branding, logo, WCAG-checked colors, IANA timezone, and staff label. | Dynamically adapts CSS variables, timezone engine, and push privacy. |
| **FR-13** | Self-Reschedule | Customers can reschedule upcoming appointments in 1 click up to 2 times respecting cancel notice. | Enforces `customerRescheduleCount < 2` atomically and refreshes reminders. |
| **FR-14** | Walk-In & Pass | Support staff walk-in/overbooking registration, QR digital passes, Google/ICS export & CSV/KPI reports. | Eliminates double-booking unless `isOverbooking=true` is explicitly selected. |

---

## 2. Non-Functional Requirements (NFR)

1. **NFR-01 Performance & Footprint:** `/api/availability` resolves slots in <100ms, while production Docker targets Oracle Cloud `E2.1.Micro` (1 GB RAM `linux/amd64`) with `NODE_OPTIONS="--max-old-space-size=384"` and `mem_limit: 650m`.
2. **NFR-02 Responsiveness & WCAG 2.1 AA:** Adaptive mobile-first Tailwind 4 layout with focus-trapped accessible dialogs (`AccessibleModal`), labeled controls, `>= 4.5:1` contrast validation, and `min-h-[44px]` interactive targets.
3. **NFR-03 Security:** Password hashing with `bcrypt` (10 salt rounds), purpose-scoped HMAC `HttpOnly` session cookies with `sessionVersion`, CSRF/origin checks, `TRUSTED_PROXY_HOPS` rate limiting, and RFC1918/metadata SSRF guards.
4. **NFR-04 Business Timezone Independence:** All slot generation, shift bounds, and day overrides resolve strictly in the configured IANA `BusinessSettings.timezone` (`src/lib/timezone.ts`).
5. **NFR-05 Progressive Web App (PWA) & Reminders:** Compliant `manifest.webmanifest`, network-first Service Worker, RFC 8291/8292 Web Push outbox, and idempotent 24h/2h appointment reminders.
6. **NFR-06 Defensive Validation & Atomic Concurrency:** Client + server validation paired with SQLite `BEGIN IMMEDIATE` write locks (`withImmediateLock`) and zero native `window.alert`/`window.confirm` dialogs.

---

## 3. Audited Bug Traceability Matrix

| Bug ID | Root Cause | Implemented Resolution | Status |
| :--- | :--- | :--- | :---: |
| **BUG-01** | Past appointment slots were shown on "TODAY" late in the evening. | Enforced local `new Date()` + `minLeadTimeMinutes` filtering in `slot-engine.ts`. | ✅ Resolved |
| **BUG-02** | "Today" button displayed tomorrow's date due to UTC ISO conversion. | Replaced `toISOString()` with local date formatting `formatLocalDateYYYYMMDD`. | ✅ Resolved |
| **BUG-03** | Full day closure offered moving affected appointments to 23:59:59. | Strictly disallowed `MOVE_TO_END` resolution strategy for `FULL_DAY_OFF`. | ✅ Resolved |
| **BUG-04** | Closed-day schedule overrides lacked an unblock/reopen action. | Added interactive `TimeOff` card with `🔓 Reopen schedule / Remove block` button. | ✅ Resolved |
| **BUG-05** | Past appointments accordion was hidden when `activeApts.length === 0`. | Decoupled history drawer rendering condition in `ClientApp.tsx`. | ✅ Resolved |
| **BUG-06** | Shift form permitted inverted time inputs (e.g., 20:00 to 19:00). | Added inline validation error and HTTP 400 rejection in `/api/admin/shifts`. | ✅ Resolved |
| **BUG-07** | Role inconsistency: Doctors could self-book appointments as patients. | Enforced RBAC invariant: Automatic redirect of `PROVIDER` accounts to `/admin`. | ✅ Resolved |
| **BUG-08** | Service catalog lacked an in-place editing modal for price and duration. | Added `✏️ Edit` button on each service card with pre-populated reactive modal. | ✅ Resolved |
| **BUG-09** | Date pill badge counted clinic-wide appointments instead of selected doctor. | Updated pill count query to filter by selected specialist + "Whole team" mode. | ✅ Resolved |
