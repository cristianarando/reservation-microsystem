// src/lib/timezone.ts
export const DEFAULT_BUSINESS_TIMEZONE = "America/La_Paz";

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz.trim()) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

export function resolveBusinessTimeZone(tz?: string | null): string {
  if (tz && isValidTimeZone(tz)) return tz.trim();
  return DEFAULT_BUSINESS_TIMEZONE;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    partsFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}

export function getDatePartsInTz(
  date: Date,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const safeTz = resolveBusinessTimeZone(timeZone);
  const parts = getPartsFormatter(safeTz).formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      map[p.type] = Number(p.value);
    }
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour === 24 ? 0 : map.hour,
    minute: map.minute,
    second: map.second,
  };
}

export function formatDateYYYYMMDDInTz(
  date: Date = new Date(),
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE
): string {
  const { year, month, day } = getDatePartsInTz(date, timeZone);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatTimeHHmmInTz(
  date: Date,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE
): string {
  const { hour, minute } = getDatePartsInTz(date, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Converts a calendar date ("YYYY-MM-DD") and wall-clock time ("HH:mm") in the specified IANA timezone
 * into an exact UTC Date instant (handles DST and offset differences regardless of server TZ).
 */
export function parseDateAndTimeInTz(
  dateStr: string,
  timeStr: string,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE
): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return new Date(NaN);
  }

  const safeTz = resolveBusinessTimeZone(timeZone);
  const utcGuessMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const guessParts = getDatePartsInTz(new Date(utcGuessMs), safeTz);
  const guessRenderedUtcMs = Date.UTC(
    guessParts.year,
    guessParts.month - 1,
    guessParts.day,
    guessParts.hour,
    guessParts.minute,
    guessParts.second,
    0
  );
  const offsetMs = guessRenderedUtcMs - utcGuessMs;
  const candidateMs = utcGuessMs - offsetMs;

  // Second pass handles exact DST transition boundaries
  const verifyParts = getDatePartsInTz(new Date(candidateMs), safeTz);
  const verifyRenderedUtcMs = Date.UTC(
    verifyParts.year,
    verifyParts.month - 1,
    verifyParts.day,
    verifyParts.hour,
    verifyParts.minute,
    verifyParts.second,
    0
  );
  const secondDelta = utcGuessMs - verifyRenderedUtcMs;
  return new Date(candidateMs + secondDelta);
}

export function getDayOfWeekInTz(
  dateStr: string,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE
): number {
  const noonInstant = parseDateAndTimeInTz(dateStr, "12:00", timeZone);
  if (isNaN(noonInstant.getTime())) return NaN;
  const weekdayShort = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveBusinessTimeZone(timeZone),
    weekday: "short",
  }).format(noonInstant);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekdayShort] ?? new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

export function getDayBoundsInTz(
  dateStr: string,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE
): { startOfDay: Date; endOfDay: Date } {
  const startOfDay = parseDateAndTimeInTz(dateStr, "00:00", timeZone);
  const nextMinute = parseDateAndTimeInTz(dateStr, "23:59", timeZone);
  const endOfDay = new Date(nextMinute.getTime() + 59_999);
  return { startOfDay, endOfDay };
}

export function addDaysYYYYMMDD(dateStr: string, deltaDays: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day + deltaDays, 12, 0, 0));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function diffDaysYYYYMMDD(targetDateStr: string, baseDateStr: string): number {
  const [ty, tm, td] = targetDateStr.split("-").map(Number);
  const [by, bm, bd] = baseDateStr.split("-").map(Number);
  if ([ty, tm, td, by, bm, bd].some((n) => !Number.isFinite(n))) return NaN;
  const targetMs = Date.UTC(ty, tm - 1, td);
  const baseMs = Date.UTC(by, bm - 1, bd);
  return Math.round((targetMs - baseMs) / 86_400_000);
}

export function formatSpanishDateInTz(
  date: Date | string,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
  }
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", {
    ...options,
    timeZone: resolveBusinessTimeZone(timeZone),
  });
}

export function formatSpanishTimeInTz(
  date: Date | string,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: resolveBusinessTimeZone(timeZone),
  });
}
