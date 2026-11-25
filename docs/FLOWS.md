# System Sequence Diagrams & Operational Flows

This document details the core transactional and operational workflows implemented in the application.

---

## 1. Availability Calculation Flow (`Slot Engine`)

Evaluates weekly shifts, active `TimeOff` overrides, existing appointments, and lead time rules to return valid non-colliding slots.

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer (Web/PWA)
    participant UI as ClientApp (React)
    participant API as GET /api/availability
    participant Engine as slot-engine.ts
    participant DB as Database (Prisma)

    Customer->>UI: Selects Service and Date
    UI->>API: GET /api/availability?serviceId=X&date=YYYY-MM-DD
    API->>DB: Fetch WorkingShifts for dayOfWeek
    API->>DB: Fetch overlapping TimeOffs (expose only publicNote)
    API->>DB: Fetch CONFIRMED / RESCHEDULED_BY_STAFF Appointments
    DB-->>API: Consolidated schedule data

    API->>Engine: computeAvailableSlotsForStaff(...)
    loop Each candidate step (slotStepMin)
        Engine->>Engine: Inside WorkingShift bounds?
        Engine->>Engine: >= now + effectiveLeadTimeMin?
        Engine->>Engine: Free of TimeOff & Appointment overlap?
    end
    Engine-->>API: Sorted available "HH:mm" slots
    API-->>UI: HTTP 200 { date, slots, notices }
    UI-->>Customer: Renders available slot buttons
```

---

## 2. Atomic Booking Flow with Auto-Assignment (`staffId="ANY"`)

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer
    participant UI as BookingStepConfirm
    participant API as POST /api/appointments
    participant DB as Prisma Transaction
    participant RT as SSE + Web Push

    Customer->>UI: Selects slot & submits booking form
    UI->>API: POST /api/appointments { staffId: "ANY", serviceId, date, time, ... }
    API->>API: Verify same-origin, rate limit & role (block PROVIDER)
    API->>DB: Begin atomic transaction
    DB->>DB: Check customer blocked state & active booking quota (< maxActiveBookings)
    DB->>DB: Filter active staff qualified for serviceId & inspect slots
    alt No specialist open at requested slot
        DB-->>API: Throw BookingConflictError (409)
        API-->>UI: HTTP 409 Conflict
    else Qualified specialist resolved
        DB->>DB: Create Appointment (status: "CONFIRMED")
        DB->>DB: Create idempotent Notification & enqueue PushDelivery rows
        DB-->>API: Commit transaction
        API->>RT: emitRealtimeEvent(...) + async dispatchPendingPushDeliveries()
        API-->>UI: HTTP 200 { appointment }
        UI-->>Customer: Renders confirmation screen
    end
```

---

## 3. Schedule Override & Conflict Resolution Flow (`/api/admin/day-override`)

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Doctor / Admin
    participant UI as AdminOperationModals
    participant API as POST /api/admin/day-override
    participant DB as Prisma Transaction
    participant RT as SSE + Web Push

    Staff->>UI: Requests LATE_START / EARLY_LEAVE / FULL_DAY_OFF / VACATION
    UI->>API: POST /api/admin/day-override { staffId, type, startAt, endAt, reason, publicNote }
    API->>API: Validate temporal bounds & staff ownership
    API->>DB: Query overlapping active Appointments
    alt Conflicts exist & no resolution supplied
        API-->>UI: HTTP 200 { needsResolution: true, conflicting }
        Staff->>UI: Chooses "CANCEL_ALL" (or "MOVE_TO_END" for late start)
        UI->>API: POST /api/admin/day-override { ..., resolution }
    end
    API->>DB: Atomic transaction: resolve conflicts (cancelAppointmentInTx / shift move) + create TimeOff
    DB-->>API: Commit + return realtime events
    API->>RT: Emit filtered SSE updates + dispatch Web Push
    API-->>UI: HTTP 200 { ok: true }

    opt Schedule Reopening
        Staff->>UI: Clicks reopen / remove block
        UI->>API: DELETE /api/admin/day-override?id=...
        API->>DB: Delete TimeOff record
        API->>RT: Emit SCHEDULE_UPDATED
        API-->>UI: HTTP 200 { ok: true }
    end
```

---

## 4. Appointment Cancellation & 2-Strike No-Show Flow

### Unified Cancellation (`cancelAppointmentInTx`)
Shared across `POST /api/appointments/[id]/cancel`, `PUT /api/admin/appointments/[id]/status`, and `POST /api/admin/day-override`:
- Sets `status = "CANCELLED"`, `cancelledBy = "STAFF" | "CUSTOMER"`, and `cancelledByUserId`.
- Idempotent if already `CANCELLED` (prevents duplicate `Notification` or `PushDelivery` records).
- Staff cancellations notify the customer; customer cancellations mark customer unread notices read and notify the assigned staff member (plus `notifyAllStaff` admins).

### 2-Strike No-Show Protection
```mermaid
sequenceDiagram
    autonumber
    actor Staff as Doctor / Admin
    participant UI as AdminAgendaTab
    participant API as PUT /api/admin/appointments/[id]/status
    participant DB as Database (Prisma)
    actor Customer as Customer

    Staff->>UI: Marks elapsed appointment as NO_SHOW
    UI->>API: PUT /api/admin/appointments/[id]/status { status: "NO_SHOW" }
    API->>API: validateAppointmentStatusTransition(prev, "NO_SHOW")
    API->>DB: Set status="NO_SHOW" and increment User.noShowCount
    alt noShowCount >= 2
        API->>DB: Set User.isBlocked = true
    end
    API-->>UI: HTTP 200 { appointment, customer }

    opt Blocked Customer Attempts Booking
        Customer->>API: POST /api/appointments
        API-->>Customer: HTTP 403 Forbidden
    end

    opt Admin Unlocks Customer
        Staff->>UI: CustomerControlTab -> Unlock user
        UI->>API: PUT /api/admin/users/[id]/toggle-block
        API->>DB: Reset noShowCount=0, isBlocked=false & archive strikes to "NO_SHOW_ARCHIVED"
        API-->>UI: HTTP 200 { ok: true, user }
    end
```

---

## 5. 1-Click Rescheduling, Walk-In/Overbooking & 24h/2h Reminders
- **1-Click Rescheduling (`POST /api/appointments/[id]/reschedule`)**: Executed inside `withImmediateLock`; customers can self-reschedule up to **2 times** (`customerRescheduleCount < 2`) respecting `minCancelNoticeHours` (or anytime when `allowFreeCancel = true`), whereas `ADMIN`/`PROVIDER` staff can move appointments freely with optional `allowOverbooking`. Rescheduling clears `reminder24hSentAt` and `reminder2hSentAt` so reminders match the updated timestamp.
- **Walk-In Reception (`POST /api/admin/appointments`)**: Lets `ADMIN` or scoped `PROVIDER` book walk-in customers quickly (creating/reusing a `@local.invalid` customer record when email is omitted) and optionally bypass slot occupancy with `isOverbooking = true`.
- **Automated Reminder Worker (`src/lib/services/reminder-service.ts`)**: Polls `[23h, 25h]` (`reminder24hSentAt`) and `[90m, 150m]` (`reminder2hSentAt`) windows every 5 minutes inside `startPushDispatcherWorker`, claiming rows atomically to avoid duplicate in-app or Web Push reminders across restarts.
