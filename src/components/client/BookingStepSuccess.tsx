"use client";

import React from "react";
import { Bell, CalendarPlus, Check, Download } from "lucide-react";
import { PushNotificationToggle } from "@/components/ui/PushNotificationToggle";
import { Button } from "@/components/ui/Button";
import {
  buildAppointmentIcsContent,
  buildGoogleCalendarUrl,
  downloadAppointmentIcs,
} from "@/lib/calendar-export";
import { renderQrSvgDataUrl } from "@/lib/qr-svg";
import type { DevicePushState } from "@/lib/push-client";
import {
  formatSpanishDateInTz,
  formatSpanishTimeInTz,
  resolveBusinessTimeZone,
} from "@/lib/timezone";
import type { PortalAppointment, PortalBusinessSettings } from "@/types/portal";

interface BookingStepSuccessProps {
  confirmedAppointment: PortalAppointment;
  settings?: PortalBusinessSettings | null;
  timezone?: string | null;
  pushState: DevicePushState;
  pushBusy: boolean;
  pushMessage: string | null;
  onTogglePush: () => void;
  onViewMyAppointments: () => void;
  onBackHome: () => void;
}

export function BookingStepSuccess({
  confirmedAppointment,
  settings,
  timezone,
  pushState,
  pushBusy,
  pushMessage,
  onTogglePush,
  onViewMyAppointments,
  onBackHome,
}: BookingStepSuccessProps) {
  const businessTz = resolveBusinessTimeZone(timezone || settings?.timezone);
  const startDate = new Date(confirmedAppointment.startAt);
  const endDate = new Date(
    confirmedAppointment.endAt || startDate.getTime() + 30 * 60_000
  );
  const shortCode = confirmedAppointment.id.slice(-8).toUpperCase();
  const qrPayload = `REF:${shortCode}|${formatSpanishDateInTz(startDate, businessTz)}|${formatSpanishTimeInTz(startDate, businessTz)}`;
  const qrDataUrl = renderQrSvgDataUrl(qrPayload, 2);

  const calendarTitle = `${confirmedAppointment.service?.name || "Cita"} — ${settings?.name || "Reserva"}`;
  const calendarDetails = `Profesional: ${confirmedAppointment.staff?.displayName || "Especialista"} | Ref: #${shortCode}`;
  const googleCalUrl = buildGoogleCalendarUrl({
    title: calendarTitle,
    startAt: startDate,
    endAt: endDate,
    details: calendarDetails,
    location: settings?.addressText,
  });

  const handleDownloadIcs = () => {
    const ics = buildAppointmentIcsContent({
      uid: confirmedAppointment.id,
      title: calendarTitle,
      startAt: startDate,
      endAt: endDate,
      description: calendarDetails,
      location: settings?.addressText,
      organizerName: settings?.name,
    });
    downloadAppointmentIcs(`cita-${shortCode}.ics`, ics);
  };
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
      <div className="my-4 flex items-center justify-center">
        <div className="w-36 h-36 rounded-full bg-zinc-100 flex items-center justify-center">
          <div className="w-24 h-24 rounded-full bg-[#A8A9AF]/50 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-[#1F1F23] text-white flex items-center justify-center shadow-lg">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-[#1F1F23]">¡Cita Confirmada!</h2>
      <p className="text-xs text-zinc-500 mt-1 max-w-[260px]">
        Tu horario ha quedado reservado exitosamente.
      </p>

      <div className="mt-6 w-full max-w-md bg-[#F4F4F6] rounded-[24px] p-4 text-left text-xs space-y-2 border border-zinc-200">
        <div className="flex justify-between gap-3">
          <span className="text-zinc-500 shrink-0">Servicio:</span>
          <span className="font-bold text-zinc-900 text-right break-words">
            {confirmedAppointment.service?.name}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-zinc-500 shrink-0">Con:</span>
          <span className="font-bold text-zinc-900 text-right break-words">
            {confirmedAppointment.staff?.displayName}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-zinc-500 shrink-0">Cuándo:</span>
          <span className="font-bold text-zinc-900 text-right">
            {formatSpanishDateInTz(new Date(confirmedAppointment.startAt), businessTz)}{" "}
            •{" "}
            {formatSpanishTimeInTz(new Date(confirmedAppointment.startAt), businessTz)}
          </span>
        </div>
        {confirmedAppointment.customerNotes && (
          <div className="pt-2 mt-1 border-t border-zinc-200/80 space-y-0.5">
            <span className="text-zinc-500 block text-[11px]">
              Tu nota / detalle:
            </span>
            <p className="font-semibold text-zinc-900 break-words leading-snug">
              {confirmedAppointment.customerNotes}
            </p>
          </div>
        )}

        <div className="pt-3 mt-2 border-t border-zinc-200/80 flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
              Pase Digital de Cita
            </span>
            <div className="font-mono font-bold text-sm text-zinc-900">
              #{shortCode}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <a
                href={googleCalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white hover:bg-zinc-100 border border-zinc-300 text-[11px] font-bold text-zinc-800"
              >
                <CalendarPlus className="w-3.5 h-3.5 text-emerald-700" />
                <span>Google Calendar</span>
              </a>
              <button
                type="button"
                onClick={handleDownloadIcs}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white hover:bg-zinc-100 border border-zinc-300 text-[11px] font-bold text-zinc-800"
              >
                <Download className="w-3.5 h-3.5 text-zinc-700" />
                <span>.ics (Apple/Outlook)</span>
              </button>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- Self-contained SVG DataURL QR ticket */}
          <img
            src={qrDataUrl}
            alt={`Código QR de la cita ${shortCode}`}
            className="w-20 h-20 rounded-xl border border-zinc-300 bg-white p-1 shrink-0"
          />
        </div>
      </div>

      <div className="mt-4 w-full max-w-md rounded-[22px] p-3.5 bg-zinc-50 border border-zinc-200 text-left text-xs space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Bell className="w-4 h-4 text-[#1F1F23] shrink-0" />
            <span className="font-bold text-zinc-900">
              {pushState === "subscribed"
                ? "Avisos activados en este dispositivo"
                : "Avísame si cambia mi cita"}
            </span>
          </div>
          <PushNotificationToggle
            variant="card"
            pushState={pushState}
            pushLoading={pushBusy}
            toggleTestId="client-push-toggle-btn"
            onToggle={onTogglePush}
          />
        </div>
        <p className="text-[11px] text-zinc-600 leading-snug">
          {pushState === "insecure_context"
            ? "Las notificaciones del navegador requieren acceder con HTTPS (ej. https://tudominio.com)."
            : pushState === "ios_needs_install"
            ? "En iPhone/iPad: pulsa Compartir -> Agregar a Pantalla de Inicio para recibir notificaciones aunque cierres Safari."
            : pushState === "denied"
            ? "El permiso de notificaciones está bloqueado en Chrome. Habilítalo desde el ícono de ajustes junto a la barra de direcciones."
            : "Recibe un aviso discreto en tu dispositivo si el establecimiento reprograma o cancela tu turno."}
        </p>
        {pushMessage && (
          <p className="text-[11px] font-semibold text-emerald-700">
            {pushMessage}
          </p>
        )}
      </div>

      <div className="mt-6 w-full max-w-md space-y-2.5">
        <Button
          variant="primary"
          size="lg"
          onClick={onViewMyAppointments}
          className="w-full rounded-full h-14 text-sm shadow-md"
        >
          Ver en Mis Citas
        </Button>
        <Button
          variant="secondary"
          size="pill"
          onClick={onBackHome}
          className="w-full h-12 text-xs"
        >
          Volver al Inicio
        </Button>
      </div>
    </div>
  );
}
