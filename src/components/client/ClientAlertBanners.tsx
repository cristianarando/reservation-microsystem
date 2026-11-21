"use client";

import React from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import type {
  PortalAppointment,
  PortalBusinessSettings,
  PortalNotification,
  PortalUser,
} from "@/types/portal";

interface ClientAlertBannersProps {
  step: 1 | 2 | 3 | 4 | 5;
  settings?: PortalBusinessSettings | null;
  currentUser?: PortalUser | null;
  rescheduledByStaff?: PortalAppointment;
  unreadCancelNotifs: PortalNotification[];
  unreadCancelNotif: PortalNotification | null;
  cancelledByStaff?: PortalAppointment;
  targetCancelledApt?: PortalAppointment;
  notifError: string | null;
  onAcknowledgeMove: (aptOrId: PortalAppointment | string) => void;
  onCancelAppointment: (aptId: string) => void;
  onDismissNotification: (notifId: string, aptId?: string) => void;
  onRescheduleAfterCancel: (apt?: PortalAppointment) => void;
}

export function ClientAlertBanners({
  step,
  settings,
  currentUser,
  rescheduledByStaff,
  unreadCancelNotifs,
  unreadCancelNotif,
  cancelledByStaff,
  targetCancelledApt,
  notifError,
  onAcknowledgeMove,
  onCancelAppointment,
  onDismissNotification,
  onRescheduleAfterCancel,
}: ClientAlertBannersProps) {
  const targetAptDate = targetCancelledApt?.startAt
    ? new Date(targetCancelledApt.startAt)
    : null;
  const targetTimeStr =
    targetAptDate && !isNaN(targetAptDate.getTime())
      ? targetAptDate.toLocaleTimeString("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
  const targetDateStr =
    targetAptDate && !isNaN(targetAptDate.getTime())
      ? targetAptDate.toLocaleDateString("es-ES", {
          weekday: "long",
          day: "numeric",
          month: "short",
        })
      : "";
  const targetServiceName = targetCancelledApt?.service?.name || "";
  const targetStaffName =
    targetCancelledApt?.staff?.displayName ||
    targetCancelledApt?.staff?.name ||
    "el profesional";
  const targetCancelReason = targetCancelledApt?.staffMoveReason || "";

  return (
    <>
      {notifError && (
        <div className="mx-5 mt-2 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
          {notifError}
        </div>
      )}

      {rescheduledByStaff && step !== 5 && (
        <div className="mx-5 mt-2 p-4 rounded-[24px] bg-[#1F1F23] text-white shadow-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400" />
            <div className="text-xs flex-1">
              <div className="font-bold text-sm">
                ¡Tu cita fue reprogramada por el profesional!
              </div>
              <p className="mt-1 text-zinc-300 leading-relaxed">
                El {rescheduledByStaff.staff?.displayName} movió tu turno para el{" "}
                <b>
                  {new Date(rescheduledByStaff.startAt).toLocaleDateString("es-ES", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  a las{" "}
                  {new Date(rescheduledByStaff.startAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </b>
                .
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => onAcknowledgeMove(rescheduledByStaff.id)}
                  className="bg-white text-zinc-900 font-bold px-3.5 py-2 rounded-full text-xs hover:bg-zinc-100"
                >
                  ✓ Aceptar horario
                </button>
                <button
                  onClick={() => onCancelAppointment(rescheduledByStaff.id)}
                  className="bg-white/15 hover:bg-white/25 text-white font-semibold px-3.5 py-2 rounded-full text-xs"
                >
                  Cancelar sin cargo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(unreadCancelNotif || cancelledByStaff) && (
        <div className="mx-5 mt-2 mb-2 p-4 rounded-[24px] bg-[#1F1F23] text-white shadow-lg border border-red-500/50">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
              ✕
            </div>
            <div className="text-xs flex-1">
              <div className="font-bold text-sm text-red-300 flex items-center justify-between flex-wrap gap-1">
                <span>
                  {unreadCancelNotif?.title &&
                  unreadCancelNotif.title !== "Tu cita fue cancelada por el profesional"
                    ? unreadCancelNotif.title
                    : targetTimeStr
                    ? `Se canceló tu cita de las ${targetTimeStr}${targetServiceName ? ` (${targetServiceName})` : ""}`
                    : "Tu cita fue cancelada por el profesional"}
                </span>
                {unreadCancelNotifs.length > 1 && (
                  <span className="bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                    Aviso 1 de {unreadCancelNotifs.length}
                  </span>
                )}
              </div>
              {targetCancelledApt ? (
                <p className="mt-1 text-zinc-200 leading-relaxed">
                  Tu cita de{" "}
                  <strong className="text-white font-semibold">
                    {targetServiceName || "servicio"}
                  </strong>{" "}
                  con{" "}
                  <strong className="text-white font-semibold">
                    {targetStaffName}
                  </strong>{" "}
                  programada para el{" "}
                  <span className="text-red-200 font-semibold">
                    {targetDateStr} a las {targetTimeStr}
                  </span>{" "}
                  tuvo que cancelarse debido a:{" "}
                  <span className="italic text-zinc-300 font-medium">
                    &quot;{targetCancelReason || "No atiendo hoy por descanso/imprevisto"}&quot;
                  </span>
                  .
                  <br />
                  <span className="text-zinc-400 mt-1 block">
                    Por favor elige un nuevo horario para reagendar tu atención cuando desees.
                  </span>
                </p>
              ) : unreadCancelNotif ? (
                <p className="mt-1 text-zinc-200 leading-relaxed">
                  {unreadCancelNotif.message}
                </p>
              ) : null}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    if (unreadCancelNotif) {
                      onDismissNotification(
                        unreadCancelNotif.id,
                        unreadCancelNotif.appointmentId || undefined
                      );
                    } else if (cancelledByStaff) {
                      onDismissNotification(cancelledByStaff.id, cancelledByStaff.id);
                    }
                    onRescheduleAfterCancel(targetCancelledApt);
                  }}
                  className="bg-white text-zinc-900 font-bold px-3.5 py-1.5 rounded-full text-xs hover:bg-zinc-100 shadow-sm transition-all"
                >
                  📅 Elegir nuevo horario
                </button>
                <button
                  onClick={() => {
                    if (unreadCancelNotif) {
                      onDismissNotification(
                        unreadCancelNotif.id,
                        unreadCancelNotif.appointmentId || undefined
                      );
                    } else if (cancelledByStaff) {
                      onDismissNotification(cancelledByStaff.id, cancelledByStaff.id);
                    }
                  }}
                  className="bg-white/15 hover:bg-white/25 text-white font-medium px-3.5 py-1.5 rounded-full text-xs transition-all"
                >
                  ✕ Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentUser?.isBlocked && (
        <div className="mx-5 mb-3 p-4 rounded-[24px] bg-red-600 text-white shadow-lg flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 flex-shrink-0 mt-0.5" />
          <div className="text-xs">
            <div className="font-bold text-sm">Reservas en línea restringidas</div>
            <p className="mt-0.5 text-white/90">
              Tu cuenta tiene restricciones para nuevas reservas debido a inasistencias previas sin aviso (
              {currentUser?.noShowCount || 2} faltas acumuladas).
            </p>
            {settings?.phoneWhatsapp && (
              <a
                href={`https://wa.me/${settings.phoneWhatsapp.replace(/\D/g, "")}?text=Hola,%20quisiera%20solicitar%20un%20turno%20y%20coordinar%20mi%20cita.`}
                target="_blank"
                rel="noreferrer"
                className="mt-2.5 inline-flex items-center gap-1.5 bg-white text-zinc-900 font-bold px-3.5 py-1.5 rounded-full shadow-sm text-xs"
              >
                <WhatsAppIcon className="w-4 h-4 text-[#16A34A]" />
                <span>Contactar por WhatsApp</span>
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}
