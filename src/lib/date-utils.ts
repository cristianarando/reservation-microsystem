// src/lib/date-utils.ts
import { formatDateYYYYMMDDInTz, isValidTimeZone } from "@/lib/timezone";

/**
 * Returns date formatted as YYYY-MM-DD in the specified business IANA timezone
 * (or the user's local timezone when omitted).
 * IMPORTANT: Never use toISOString().split("T")[0] for booking calendar dates.
 */
export function formatLocalDateYYYYMMDD(
  d: Date = new Date(),
  timeZone?: string
): string {
  if (timeZone && isValidTimeZone(timeZone)) {
    return formatDateYYYYMMDDInTz(d, timeZone);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
