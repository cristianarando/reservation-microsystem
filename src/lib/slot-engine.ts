// src/lib/slot-engine.ts
import { formatLocalDateYYYYMMDD } from "@/lib/date-utils";
import {
  formatTimeHHmmInTz,
  isValidTimeZone,
  parseDateAndTimeInTz,
} from "@/lib/timezone";

export { formatLocalDateYYYYMMDD };

export interface WorkingShiftModel {
  id: string;
  staffId: string;
  dayOfWeek: number;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
}

export interface TimeOffModel {
  id: string;
  staffId: string;
  startAt: Date;
  endAt: Date;
  type?: string;
  reason?: string | null;
}

export interface AppointmentModel {
  id: string;
  staffId: string;
  startAt: Date;
  endAt: Date;
  status: string;
}

export interface SlotEngineParams {
  dateStr: string; // "YYYY-MM-DD"
  shifts: WorkingShiftModel[];
  timeOffs: TimeOffModel[];
  appointments: AppointmentModel[];
  serviceDuration: number; // in minutes (duration + buffer)
  slotStepMin: number;     // e.g. 30 min
  leadTimeMin: number;     // e.g. 15 or 30 min
  now?: Date;
  timeZone?: string;
}

export function parseDateAndTime(
  dateStr: string,
  timeStr: string,
  timeZone?: string
): Date {
  if (timeZone && isValidTimeZone(timeZone)) {
    return parseDateAndTimeInTz(dateStr, timeStr, timeZone);
  }
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export function formatTimeHHmm(date: Date, timeZone?: string): string {
  if (timeZone && isValidTimeZone(timeZone)) {
    return formatTimeHHmmInTz(date, timeZone);
  }
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function computeAvailableSlotsForStaff({
  dateStr,
  shifts,
  timeOffs,
  appointments,
  serviceDuration,
  slotStepMin,
  leadTimeMin,
  now = new Date(),
  timeZone,
}: SlotEngineParams): string[] {
  const slots: string[] = [];
  const minAllowedStart = new Date(now.getTime() + leadTimeMin * 60_000);

  // Filter busy intervals for this date
  const busyIntervals = [
    ...timeOffs.map((t) => ({
      start: new Date(t.startAt).getTime(),
      end: new Date(t.endAt).getTime(),
    })),
    ...appointments
      .filter((a) => a.status === "CONFIRMED" || a.status === "RESCHEDULED_BY_STAFF")
      .map((a) => ({
        start: new Date(a.startAt).getTime(),
        end: new Date(a.endAt).getTime(),
      })),
  ];

  for (const shift of shifts) {
    const shiftStart = parseDateAndTime(dateStr, shift.startTime, timeZone);
    const shiftEnd = parseDateAndTime(dateStr, shift.endTime, timeZone);

    // Invariant AC-SHIFT-02: Start time must be strictly earlier than end time.
    if (shiftEnd.getTime() <= shiftStart.getTime()) {
      continue;
    }

    let cursor = shiftStart.getTime();
    const durationMs = serviceDuration * 60_000;
    const stepMs = Math.max(15, slotStepMin) * 60_000;

    while (cursor + durationMs <= shiftEnd.getTime()) {
      const candidateStart = cursor;
      const candidateEnd = cursor + durationMs;

      // 1. Lead time check
      const respectsLeadTime = candidateStart >= minAllowedStart.getTime();

      // 2. Overlap check with existing appointments or time-offs
      const hasOverlap = busyIntervals.some(
        (busy) => candidateStart < busy.end && candidateEnd > busy.start
      );

      if (respectsLeadTime && !hasOverlap) {
        slots.push(formatTimeHHmm(new Date(candidateStart), timeZone));
      }
      cursor += stepMs;
    }
  }

  return Array.from(new Set(slots)).sort();
}
