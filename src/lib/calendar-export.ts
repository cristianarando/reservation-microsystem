// src/lib/calendar-export.ts

function toUtcCompactStamp(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const iso = d.toISOString();
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildGoogleCalendarUrl(params: {
  title: string;
  startAt: Date | string;
  endAt: Date | string;
  details?: string | null;
  location?: string | null;
}): string {
  const dates = `${toUtcCompactStamp(params.startAt)}/${toUtcCompactStamp(params.endAt)}`;
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", params.title);
  url.searchParams.set("dates", dates);
  if (params.details) url.searchParams.set("details", params.details);
  if (params.location) url.searchParams.set("location", params.location);
  return url.toString();
}

export function buildAppointmentIcsContent(params: {
  uid: string;
  title: string;
  startAt: Date | string;
  endAt: Date | string;
  description?: string | null;
  location?: string | null;
  organizerName?: string | null;
}): string {
  const dtStamp = toUtcCompactStamp(new Date());
  const dtStart = toUtcCompactStamp(params.startAt);
  const dtEnd = toUtcCompactStamp(params.endAt);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ReservasApp//Agenda Digital//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(params.uid)}@reservas.local`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(params.title)}`,
  ];

  if (params.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(params.description)}`);
  }
  if (params.location) {
    lines.push(`LOCATION:${escapeIcsText(params.location)}`);
  }
  if (params.organizerName) {
    lines.push(`ORGANIZER;CN=${escapeIcsText(params.organizerName)}:MAILTO:noreply@reservas.local`);
  }

  lines.push(
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT60M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(`Recordatorio de cita: ${params.title}`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  );

  return lines.join("\r\n");
}

export function downloadAppointmentIcs(filename: string, icsContent: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
