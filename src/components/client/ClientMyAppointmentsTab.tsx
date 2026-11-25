"use client";

import React, { useState } from "react";
import {
  Calendar,
  CalendarClock,
  CalendarPlus,
  Clock,
  Download,
  FileText,
  QrCode,
  User,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { PushNotificationToggle } from "@/components/ui/PushNotificationToggle";
import {
  buildAppointmentIcsContent,
  buildGoogleCalendarUrl,
  downloadAppointmentIcs,
} from "@/lib/calendar-export";
import { renderQrSvgDataUrl } from "@/lib/qr-svg";
import {
  isPastUntickedAppointment,
  isUpcomingActiveAppointment,
} from "@/lib/booking-rules";
import {
  formatSpanishDateInTz,
  formatSpanishTimeInTz,
  resolveBusinessTimeZone,
} from "@/lib/timezone";
import type { DevicePushState } from "@/lib/push-client";
import type {
  PortalAppointment,
  PortalBusinessSettings,
  PortalUser,
} from "@/types/portal";

interface ClientMyAppointmentsTabProps {
  currentUser?: PortalUser | null;
  settings?: PortalBusinessSettings | null;
  referenceNowIso?: string;
  userAppointments: PortalAppointment[];
  maxActiveAllowed: number;
  highlightedAppointmentId: string | null;
  pushState: DevicePushState;
  pushBusy: boolean;
  testingPush: boolean;
  pushMessage: string | null;
  showHistory: boolean;
  historyItems: PortalAppointment[];
  historyHasMore: boolean;
  historyTotalCount: number;
  historyLoadingMore: boolean;
  historyScrollRef: React.RefObject<HTMLDivElement | null>;
  historySentinelRef: React.RefObject<HTMLDivElement | null>;
  onDismissPushMessage: () => void;
  onTogglePush: () => void;
  onTestPush: () => void;
  onToggleHistory: () => void;
  onLoadMoreHistory: () => void;
  onOpenAuthModal: () => void;
  onBookNow: () => void;
  onAcknowledgeMove: (aptOrId: PortalAppointment | string) => void;
  onCancelAppointment: (aptId: string) => void;
  onRescheduleAppointment?: (apt: PortalAppointment) => void;
  onRepeatService: (apt: PortalAppointment) => void;
}

export function ClientMyAppointmentsTab({
  currentUser,
  settings,
  referenceNowIso,
  userAppointments,
  maxActiveAllowed,
  highlightedAppointmentId,
  pushState,
  pushBusy,
  testingPush,
  pushMessage,
  showHistory,
  historyItems,
  historyHasMore,
  historyTotalCount,
  historyLoadingMore,
  historyScrollRef,
  historySentinelRef,
  onDismissPushMessage,
  onTogglePush,
  onTestPush,
  onToggleHistory,
  onLoadMoreHistory,
  onOpenAuthModal,
  onBookNow,
  onAcknowledgeMove,
  onCancelAppointment,
  onRescheduleAppointment,
  onRepeatService,
}: ClientMyAppointmentsTabProps) {
  const [expandedQrId, setExpandedQrId] = useState<string | null>(null);
  const businessTz = resolveBusinessTimeZone(settings?.timezone);
  const listNow = referenceNowIso ? new Date(referenceNowIso) : new Date();
  const activeApts = userAppointments.filter((a) =>
    isUpcomingActiveAppointment(a, listNow)
  );
  const activeNoShowApts = userAppointments.filter(
    (a) => a.status === "NO_SHOW"
  );
  const historyTotal = Math.max(historyTotalCount, historyItems.length);
  const staffLabelLower =
    settings?.staffLabel?.toLowerCase() || "el profesional";

  const renderHistoryCard = (apt: PortalAppointment) => {
    const variant =
      apt.status === "NO_SHOW_ARCHIVED"
        ? {
            cardClass: "bg-zinc-100 border-zinc-200 text-zinc-600",
            badgeText: "📁 JUSTIFICADA / ARCHIVADA",
            badgeClass: "bg-zinc-300 text-zinc-800",
            borderClass: "border-zinc-200/80",
            repeatLabel: "📅 Volver a agendar",
            note: (
              <div className="mt-1 text-[11px] text-emerald-700 font-semibold">
                ✓ El consultorio reinició tu contador. Esta falta pasada está archivada y no afecta tu cuenta actual.
              </div>
            ),
          }
        : apt.status === "COMPLETED"
        ? {
            cardClass: "bg-emerald-50/70 border-emerald-200",
            badgeText: "✓ ATENDIDA",
            badgeClass: "bg-emerald-700 text-white",
            borderClass: "border-emerald-200/70",
            repeatLabel: "📅 Repetir servicio",
            note: null,
          }
        : isPastUntickedAppointment(apt, listNow)
        ? {
            cardClass: "bg-zinc-50 border-zinc-200",
            badgeText: "⏱️ FINALIZADA",
            badgeClass: "bg-zinc-700 text-white",
            borderClass: "border-zinc-200/80",
            repeatLabel: "📅 Repetir servicio",
            note: (
              <div className="mt-1 text-[11px] text-zinc-500">
                Horario pasado — archivada automáticamente sin ocupar tu límite activo.
              </div>
            ),
          }
        : apt.staffMoveReason
        ? {
            cardClass: "bg-amber-50/60 border-amber-200",
            badgeText: "✕ CANCELADA POR PROFESIONAL",
            badgeClass: "bg-amber-200 text-amber-900",
            borderClass: "border-zinc-200/80",
            repeatLabel: "📅 Volver a agendar",
            note: (
              <div className="mt-2 p-2 rounded-xl bg-white/80 border border-amber-200 text-[11px] text-amber-900">
                <b>Motivo indicado por {staffLabelLower}:</b> &quot;{apt.staffMoveReason}&quot;
              </div>
            ),
          }
        : {
            cardClass: "bg-zinc-100 border-zinc-200 text-zinc-600",
            badgeText: "✕ CANCELADA",
            badgeClass: "bg-zinc-300 text-zinc-700",
            borderClass: "border-zinc-200/80",
            repeatLabel: "📅 Volver a agendar",
            note: (
              <div className="mt-1 text-[11px] text-zinc-500 italic">
                Cancelada a solicitud del cliente.
              </div>
            ),
          };

    return (
      <div
        key={apt.id}
        data-testid="history-appointment-card"
        className={`p-3.5 rounded-[22px] border text-xs transition-all ${variant.cardClass}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-zinc-900">{apt.service?.name}</span>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${variant.badgeClass}`}
          >
            {variant.badgeText}
          </span>
        </div>

        <div className="mt-1.5 text-[11px] text-zinc-600 flex items-center gap-1.5 flex-wrap">
          <Calendar className="w-3.5 h-3.5 text-zinc-400" />
          <span>
            {formatSpanishDateInTz(new Date(apt.startAt), businessTz)} •{" "}
            {formatSpanishTimeInTz(new Date(apt.startAt), businessTz)}
          </span>
          {apt.staff?.displayName && <span>• con {apt.staff.displayName}</span>}
        </div>

        {variant.note}

        {apt.customerNotes && (
          <div className="mt-2 p-2 rounded-xl bg-white/75 border border-zinc-200/80 text-[11px] text-zinc-700 flex items-start gap-1.5">
            <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="font-bold text-zinc-600">Detalle: </span>
              <span className="break-words">{apt.customerNotes}</span>
            </div>
          </div>
        )}

        <div className={`mt-2.5 pt-2 border-t ${variant.borderClass} flex justify-end`}>
          <button
            type="button"
            onClick={() => onRepeatService(apt)}
            className="w-full sm:w-auto min-h-[36px] px-4 py-1.5 rounded-full bg-[#1F1F23] text-white font-bold text-xs sm:text-[11px] hover:bg-black transition-all flex items-center justify-center gap-1.5"
          >
            <span>{variant.repeatLabel}</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="px-5 md:px-8 pt-2 pb-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-bold text-[#1F1F23]">
          Tus Reservas Activas ({activeApts.length})
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {currentUser && (
            <PushNotificationToggle
              pushState={pushState}
              pushLoading={pushBusy}
              pushTestLoading={testingPush}
              idleLabel="Avísame si cambia mi cita"
              toggleTestId="my-appointments-push-btn"
              testBtnTestId="my-appointments-push-test-btn"
              onToggle={onTogglePush}
              onSendTest={onTestPush}
            />
          )}
          <span className="text-xs text-zinc-600 font-medium">
            Máx. {maxActiveAllowed} activas
          </span>
        </div>
      </div>

      {pushMessage && currentUser && (
        <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-700 flex items-center justify-between gap-2">
          <span>{pushMessage}</span>
          <button
            type="button"
            onClick={onDismissPushMessage}
            className="text-zinc-400 hover:text-zinc-700 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {!currentUser ? (
        <div className="py-8 px-4 text-center text-xs bg-zinc-50 rounded-3xl border border-zinc-200 space-y-2">
          <User className="w-8 h-8 mx-auto text-zinc-400" />
          <p className="font-semibold text-zinc-800 text-sm">
            Consulta tus reservas activas
          </p>
          <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
            Ingresa tu correo para ver tus citas agendadas y gestionar cancelaciones o reprogramaciones.
          </p>
          <button
            onClick={onOpenAuthModal}
            className="mt-3 px-5 py-2.5 rounded-full bg-[#1F1F23] text-white text-xs font-semibold hover:bg-black transition-all"
          >
            Ingresar con mi Correo
          </button>
        </div>
      ) : (
        <>
          {activeApts.length === 0 && activeNoShowApts.length === 0 && (
            <div className="py-8 text-center text-xs text-zinc-400 bg-zinc-50 rounded-3xl border border-zinc-200">
              <Calendar className="w-8 h-8 mx-auto text-zinc-300 mb-2" />
              <p className="font-semibold text-zinc-700">
                No tienes citas próximas pendientes
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Tu cuenta está al día (0 faltas activas).
              </p>
              <button
                onClick={onBookNow}
                className="mt-4 px-5 py-2.5 rounded-full bg-[#1F1F23] text-white text-xs font-semibold"
              >
                Reservar Ahora
              </button>
            </div>
          )}

          {activeApts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeApts.map((apt) => {
                const isPast = new Date(apt.endAt || apt.startAt) <= listNow;
                const isRescheduled = apt.status === "RESCHEDULED_BY_STAFF";
                const isHighlighted = highlightedAppointmentId === apt.id;

                return (
                  <div
                    key={apt.id}
                    data-appointment-id={apt.id}
                    className={`p-4 rounded-[26px] border transition-all ${
                      isRescheduled
                        ? "bg-amber-50 border-amber-300"
                        : "bg-[#F4F4F6] border-zinc-200"
                    } ${isHighlighted ? "ring-2 ring-[#1F1F23] shadow-md" : ""}`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-zinc-900 text-sm">
                        {apt.service?.name}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          isRescheduled
                            ? "bg-amber-500 text-white"
                            : "bg-[#1F1F23] text-white"
                        }`}
                      >
                        {isRescheduled ? "MODIFICADA" : "CONFIRMADA"}
                      </span>
                    </div>

                    <div className="mt-2.5 text-xs text-zinc-600 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                        <span>
                          {formatSpanishDateInTz(new Date(apt.startAt), businessTz, {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="font-semibold text-zinc-900">
                          {formatSpanishTimeInTz(new Date(apt.startAt), businessTz)}{" "}
                          ({apt.service?.durationMin} min)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-zinc-400" />
                        <span>
                          {settings?.staffLabel || "Profesional"}:{" "}
                          <b>{apt.staff?.displayName}</b>
                        </span>
                      </div>
                    </div>

                    {apt.customerNotes && (
                      <div className="mt-2.5 p-2.5 rounded-2xl bg-white/85 border border-zinc-200/80 text-xs text-zinc-700 flex items-start gap-2">
                        <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                            Tu nota / detalle:
                          </span>
                          <p className="text-xs text-zinc-800 break-words leading-snug mt-0.5">
                            {apt.customerNotes}
                          </p>
                        </div>
                      </div>
                    )}

                    {!isPast && (() => {
                      const startDate = new Date(apt.startAt);
                      const endDate = new Date(
                        apt.endAt ||
                          startDate.getTime() + (apt.service?.durationMin || 30) * 60_000
                      );
                      const refCode = apt.id.slice(-8).toUpperCase();
                      const businessLabel = settings?.name || "Mi Reserva";
                      const calTitle = `${apt.service?.name || "Cita"} — ${businessLabel}`;
                      const calDetails = [
                        `${settings?.staffLabel || "Profesional"}: ${apt.staff?.displayName || "Por asignar"}`,
                        `Código de cita: #${refCode}`,
                        apt.customerNotes ? `Nota: ${apt.customerNotes}` : "",
                      ]
                        .filter(Boolean)
                        .join("\n");
                      const gcalUrl = buildGoogleCalendarUrl({
                        title: calTitle,
                        startAt: startDate,
                        endAt: endDate,
                        details: calDetails,
                        location: settings?.addressText,
                      });
                      const isQrOpen = expandedQrId === apt.id;
                      const qrPayload = `REF:${refCode}|${formatSpanishDateInTz(startDate, businessTz)}|${formatSpanishTimeInTz(startDate, businessTz)}`;

                      return (
                        <div className="mt-3 pt-2.5 border-t border-zinc-200 space-y-2.5">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center flex-wrap gap-2">
                              {isRescheduled && (
                                <button
                                  type="button"
                                  onClick={() => onAcknowledgeMove(apt)}
                                  className="min-h-[36px] text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-full transition-all"
                                >
                                  ✓ Confirmar horario
                                </button>
                              )}
                              {apt.canReschedule && onRescheduleAppointment && (
                                <button
                                  type="button"
                                  onClick={() => onRescheduleAppointment(apt)}
                                  className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 hover:bg-black text-white text-xs font-bold transition-all"
                                >
                                  <CalendarClock className="w-3.5 h-3.5" />
                                  <span>Reprogramar</span>
                                </button>
                              )}
                              {apt.canCancel ? (
                                <button
                                  type="button"
                                  onClick={() => onCancelAppointment(apt.id)}
                                  className="min-h-[36px] px-2 text-xs text-red-700 font-bold hover:underline"
                                >
                                  {apt.isFreeCancellationBecauseOfStaff
                                    ? "Cancelar sin penalización"
                                    : "Cancelar cita"}
                                </button>
                              ) : (
                                <span className="text-xs text-zinc-600">
                                  No cancelable ({settings?.minCancelNoticeHours}h mín.)
                                </span>
                              )}
                            </div>

                            {settings?.phoneWhatsapp && (
                              <a
                                href={`https://wa.me/${settings.phoneWhatsapp.replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noreferrer"
                                className="min-h-[36px] text-xs font-bold text-[#1F1F23] flex items-center gap-1 hover:underline"
                              >
                                <WhatsAppIcon className="w-4 h-4 text-[#16A34A]" />
                                <span>WhatsApp</span>
                              </a>
                            )}
                          </div>

                          <div className="flex items-center flex-wrap gap-1.5">
                            <button
                              type="button"
                              aria-expanded={isQrOpen}
                              onClick={() =>
                                setExpandedQrId(isQrOpen ? null : apt.id)
                              }
                              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white hover:bg-zinc-100 border border-zinc-300 text-[11px] font-bold text-zinc-800 transition-all"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span>{isQrOpen ? "Ocultar QR" : "Pase QR"}</span>
                            </button>
                            <a
                              href={gcalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white hover:bg-zinc-100 border border-zinc-300 text-[11px] font-bold text-zinc-800 transition-all"
                            >
                              <CalendarPlus className="w-3.5 h-3.5" />
                              <span>Google Calendar</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                const ics = buildAppointmentIcsContent({
                                  uid: apt.id,
                                  title: calTitle,
                                  startAt: startDate,
                                  endAt: endDate,
                                  description: calDetails,
                                  location: settings?.addressText,
                                  organizerName: settings?.name,
                                });
                                downloadAppointmentIcs(`cita-${refCode.toLowerCase()}.ics`, ics);
                              }}
                              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white hover:bg-zinc-100 border border-zinc-300 text-[11px] font-bold text-zinc-800 transition-all"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>.ics</span>
                            </button>
                          </div>

                          {isQrOpen && (
                            <div className="p-3 rounded-2xl bg-white border border-zinc-200 flex items-center gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={renderQrSvgDataUrl(qrPayload, 2)}
                                alt={`Código QR de la cita ${refCode}`}
                                width={88}
                                height={88}
                                className="w-20 h-20 rounded-lg border border-zinc-200 bg-white shrink-0"
                              />
                              <div className="text-[11px] text-zinc-600 space-y-0.5 min-w-0">
                                <div className="font-bold text-zinc-900">
                                  Pase Digital #{refCode}
                                </div>
                                <p className="leading-snug">
                                  Preséntalo en recepción al llegar.
                                  {typeof apt.remainingReschedules === "number" && (
                                    <span className="block text-zinc-500 mt-0.5">
                                      Reprogramaciones disponibles:{" "}
                                      <b>{apt.remainingReschedules}</b>
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}

          {activeNoShowApts.length > 0 && (
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                  Inasistencias vigentes (Ciclo actual):
                </span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  {activeNoShowApts.length} de 2 permitidas
                </span>
              </div>

              {activeNoShowApts.map((apt, idx: number) => (
                <div
                  key={apt.id}
                  className="p-4 rounded-[26px] bg-amber-50 border border-amber-300 text-xs shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-900 text-sm">
                      {apt.service?.name}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-600 text-white">
                      ⚠️ FALTA ACTIVA ({idx + 1}/2)
                    </span>
                  </div>
                  <div className="mt-2 text-zinc-700">
                    📅 {formatSpanishDateInTz(new Date(apt.startAt), businessTz)} a las{" "}
                    <b>{formatSpanishTimeInTz(new Date(apt.startAt), businessTz)}</b>{" "}
                    con {apt.staff?.displayName}
                  </div>
                  {apt.customerNotes && (
                    <div className="mt-2 p-2 rounded-xl bg-white/85 border border-amber-200 text-[11px] text-zinc-700 break-words">
                      <b>Tu nota / detalle:</b> {apt.customerNotes}
                    </div>
                  )}
                  <p className="text-[11px] text-amber-800 mt-1 font-medium">
                    Esta falta contabiliza para el bloqueo automático. Si fue justificable, contáctanos por WhatsApp para archivarla y reiniciar tu contador.
                  </p>
                  {settings?.phoneWhatsapp && (
                    <div className="mt-3 pt-2 border-t border-amber-200 flex justify-end">
                      <a
                        href={`https://wa.me/${settings.phoneWhatsapp.replace(/\D/g, "")}?text=Hola,%20tuve%20un%20inconveniente%20justificable%20en%20mi%20cita%20y%20quisiera%20regularizar%20mi%20cuenta.`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-1.5 rounded-full bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 flex items-center gap-1"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5" />
                        <span>Justificar por WhatsApp</span>
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {historyTotal > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={onToggleHistory}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-2xl bg-zinc-100 hover:bg-zinc-200/80 border border-zinc-200 text-xs font-bold text-zinc-700 flex items-center justify-between gap-3 text-left transition-all"
              >
                <span className="min-w-0 leading-snug">
                  📂 Historial de citas pasadas y archivo ({historyTotal})
                </span>
                <span className="text-[11px] text-zinc-500 whitespace-nowrap shrink-0">
                  {showHistory ? "Ocultar ▲" : "Ver historial ▼"}
                </span>
              </button>

              {showHistory && (
                <div className="space-y-3 pt-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500 px-1">
                    <span>
                      Mostrando <b>{historyItems.length}</b> de{" "}
                      <b>{historyTotal}</b> citas
                    </span>
                    {historyHasMore && (
                      <span>Desliza hacia abajo para cargar más ↓</span>
                    )}
                  </div>

                  <div
                    ref={historyScrollRef}
                    data-testid="history-scroll-container"
                    className="max-h-[360px] overflow-y-auto pr-1 space-y-3 rounded-2xl"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {historyItems.map((apt) => renderHistoryCard(apt))}
                    </div>

                    <div
                      ref={historySentinelRef}
                      className="pt-1 pb-2 flex flex-col items-center gap-2"
                    >
                      {historyLoadingMore ? (
                        <div className="flex items-center gap-2 py-2.5 text-xs font-semibold text-zinc-600">
                          <span className="w-4 h-4 border-2 border-[#1F1F23] border-t-transparent rounded-full animate-spin" />
                          <span>Cargando citas anteriores...</span>
                        </div>
                      ) : historyHasMore ? (
                        <button
                          type="button"
                          onClick={onLoadMoreHistory}
                          className="px-4 py-2 rounded-full bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 text-xs font-bold text-[#1F1F23] transition-all"
                        >
                          Cargar más historial (quedan{" "}
                          {Math.max(historyTotal - historyItems.length, 1)})
                        </button>
                      ) : (
                        historyItems.length > 6 && (
                          <div className="text-[11px] text-zinc-400 font-medium py-1">
                            ✓ Has llegado al final de tu historial ({historyTotal} citas)
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
