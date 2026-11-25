"use client";

import React, { useId } from "react";
import { AccessibleModal } from "@/components/ui/AccessibleModal";
import { Button } from "@/components/ui/Button";
import { formatLocalDateYYYYMMDD } from "@/lib/date-utils";
import { formatSpanishTimeInTz, resolveBusinessTimeZone } from "@/lib/timezone";
import {
  getDayScheduleStatus,
  getSuggestedOverrideTime,
  validateScheduleOverride,
} from "@/lib/validation/acceptance-criteria";
import type {
  PortalAppointment,
  PortalBusinessSettings,
  PortalStaffMember,
} from "@/types/portal";

export interface ImprevistoModalState {
  open: boolean;
  type: "LATE_START" | "EARLY_LEAVE" | "FULL_DAY_OFF";
  timeStr: string;
  reason: string;
  staffId?: string;
}

interface ImprevistoModalProps {
  imprevistoModal: ImprevistoModalState;
  setImprevistoModal: React.Dispatch<React.SetStateAction<ImprevistoModalState>>;
  agendaDateStr: string;
  selectedStaffId: string;
  isOwnerAdmin: boolean;
  staffList: PortalStaffMember[];
  settings?: PortalBusinessSettings | null;
  allAppointments: PortalAppointment[];
  resolveOverrideTargets: (targetId: string) => PortalStaffMember[];
  onQuickImprevisto: (resolution?: string, overrideStaffId?: string) => void;
}

export function ImprevistoModal({
  imprevistoModal,
  setImprevistoModal,
  agendaDateStr,
  selectedStaffId,
  isOwnerAdmin,
  staffList,
  settings,
  allAppointments,
  resolveOverrideTargets,
  onQuickImprevisto,
}: ImprevistoModalProps) {
  const titleId = useId();
  const staffSelectId = useId();
  const timeInputId = useId();
  const reasonInputId = useId();

  if (!imprevistoModal.open) return null;

  const now = new Date();
  const businessTz = resolveBusinessTimeZone(settings?.timezone);
  const activeModalStaffId = imprevistoModal.staffId || selectedStaffId;
  const modalValidation = validateScheduleOverride({
    type: imprevistoModal.type,
    dateStr: agendaDateStr,
    timeStr: imprevistoModal.timeStr,
    targets: resolveOverrideTargets(activeModalStaffId),
    isAllTargets: activeModalStaffId === "ALL",
    now,
  });

  const openModalAlternatives = isOwnerAdmin
    ? staffList.filter(
        (st) =>
          st.id !== activeModalStaffId &&
          !getDayScheduleStatus({
            dateStr: agendaDateStr,
            targets: [st],
            now,
          }).isDayClosedAlready
      )
    : [];

  const activeDateAptsAllStaff = allAppointments.filter((a) => {
    const aStr = formatLocalDateYYYYMMDD(new Date(a.startAt), businessTz);
    return (
      aStr === agendaDateStr &&
      (a.status === "CONFIRMED" || a.status === "RESCHEDULED_BY_STAFF")
    );
  });

  const modalTargetApts = activeDateAptsAllStaff.filter((a) =>
    activeModalStaffId === "ALL" ? true : a.staffId === activeModalStaffId
  );

  const otherStaffWithApts =
    activeModalStaffId !== "ALL"
      ? activeDateAptsAllStaff.filter((a) => a.staffId !== activeModalStaffId)
      : [];

  const onClose = () =>
    setImprevistoModal((prev) => ({ ...prev, open: false }));

  return (
    <AccessibleModal
      isOpen={imprevistoModal.open}
      onClose={onClose}
      labelledBy={titleId}
      maxWidthClass="max-w-sm"
      className="rounded-[32px] p-5 sm:p-6"
    >
      <h3 id={titleId} className="text-base font-bold text-zinc-900">
        {imprevistoModal.type === "LATE_START" && "🌅 Entrar más tarde hoy"}
        {imprevistoModal.type === "EARLY_LEAVE" &&
          "🎂 Salir antes / Cumpleaños"}
        {imprevistoModal.type === "FULL_DAY_OFF" && "🏖️ Cerrar día completo"}
      </h3>
      <p className="text-xs text-zinc-500 mt-1">
        Configura el bloqueo temporal para el <b>{agendaDateStr}</b>.
      </p>

      <div className="mt-4 space-y-3">
        {!modalValidation.valid && (
          <div className="p-3 rounded-2xl bg-red-50 border border-red-300 text-xs text-red-900 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-red-800">
              <span>🔒 Bloqueo no disponible</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              {modalValidation.error}
            </p>
            {openModalAlternatives.length > 0 &&
              modalValidation.status.isDayClosedAlready && (
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  {openModalAlternatives.map((st) => {
                    const altStatus = getDayScheduleStatus({
                      dateStr: agendaDateStr,
                      targets: [st],
                      now,
                    });
                    return (
                      <Button
                        key={st.id}
                        size="sm"
                        variant="primary"
                        onClick={() =>
                          setImprevistoModal({
                            ...imprevistoModal,
                            staffId: st.id,
                            timeStr: getSuggestedOverrideTime(
                              imprevistoModal.type,
                              altStatus,
                              now
                            ),
                          })
                        }
                        className="rounded-full text-[10px] py-1 px-2.5 min-h-[28px]"
                      >
                        Cambiar a {st.displayName} (hasta {altStatus.latestEndStr})
                      </Button>
                    );
                  })}
                </div>
              )}
          </div>
        )}

        {isOwnerAdmin && staffList.length > 1 && (
          <div>
            <label
              htmlFor={staffSelectId}
              className="text-[10px] font-bold text-zinc-500 uppercase block mb-1"
            >
              ¿A qué agenda aplica este cierre / imprevisto?
            </label>
            <select
              id={staffSelectId}
              value={activeModalStaffId}
              onChange={(e) => {
                const nextStaffId = e.target.value;
                const nextStatus = getDayScheduleStatus({
                  dateStr: agendaDateStr,
                  targets: resolveOverrideTargets(nextStaffId),
                  isAllTargets: nextStaffId === "ALL",
                  now,
                });
                setImprevistoModal({
                  ...imprevistoModal,
                  staffId: nextStaffId,
                  timeStr: getSuggestedOverrideTime(
                    imprevistoModal.type,
                    nextStatus,
                    now
                  ),
                });
              }}
              className="w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-xs bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 cursor-pointer"
            >
              {staffList.map((st) => {
                const stCount = activeDateAptsAllStaff.filter(
                  (a) => a.staffId === st.id
                ).length;
                const stDayStatus = getDayScheduleStatus({
                  dateStr: agendaDateStr,
                  targets: [st],
                  now,
                });
                const stClosedNote = stDayStatus.isDayClosedAlready
                  ? ` · ${stDayStatus.closedBadge || "Cerrado"}`
                  : "";
                return (
                  <option key={st.id} value={st.id}>
                    {st.displayName} ({stCount} cita{stCount === 1 ? "" : "s"}{" "}
                    hoy{stClosedNote})
                  </option>
                );
              })}
              <option value="ALL">
                👥 Todo el equipo / Cerrar clínica (
                {activeDateAptsAllStaff.length} cita
                {activeDateAptsAllStaff.length === 1 ? "" : "s"} hoy)
              </option>
            </select>
          </div>
        )}

        {isOwnerAdmin &&
          modalValidation.valid &&
          modalTargetApts.length === 0 &&
          otherStaffWithApts.length > 0 && (
            <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-300 text-[11px] text-amber-950 space-y-2">
              <div>
                ⚠️ <b>Atención:</b> El profesional seleccionado tiene{" "}
                <b>0 citas</b> para el {agendaDateStr}, pero{" "}
                <b>{otherStaffWithApts[0].staff?.displayName}</b> tiene{" "}
                <b>{otherStaffWithApts.length} cita(s) activa(s)</b> hoy.
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    setImprevistoModal({
                      ...imprevistoModal,
                      staffId: otherStaffWithApts[0].staffId,
                    })
                  }
                  className="rounded-full text-[10px] py-1 px-2.5 min-h-[28px]"
                >
                  Cambiar a {otherStaffWithApts[0].staff?.displayName}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setImprevistoModal({
                      ...imprevistoModal,
                      staffId: "ALL",
                    })
                  }
                  className="rounded-full border-amber-300 text-amber-950 hover:bg-amber-100 text-[10px] py-1 px-2.5 min-h-[28px]"
                >
                  👥 Cerrar todo el equipo
                </Button>
              </div>
            </div>
          )}

        {modalTargetApts.length > 0 && (
          <div className="p-2.5 rounded-2xl bg-red-50 border border-red-200 text-[11px] text-red-950 space-y-1">
            <div className="font-bold">
              📋 {modalTargetApts.length} cita(s) activa(s) en esta fecha:
            </div>
            {modalTargetApts.slice(0, 3).map((a) => (
              <div key={a.id} className="text-[10px] text-red-800">
                • {formatSpanishTimeInTz(new Date(a.startAt), businessTz)} —{" "}
                <b>{a.customer?.name}</b> ({a.service?.name})
              </div>
            ))}
          </div>
        )}

        {imprevistoModal.type !== "FULL_DAY_OFF" && (
          <div>
            <label
              htmlFor={timeInputId}
              className="text-[10px] font-bold text-zinc-500 uppercase block"
            >
              {imprevistoModal.type === "LATE_START"
                ? "Atenderé a partir de las:"
                : "Cerrar atención a partir de las:"}
            </label>
            <input
              id={timeInputId}
              type="time"
              disabled={modalValidation.status.isDayClosedAlready}
              value={imprevistoModal.timeStr}
              onChange={(e) =>
                setImprevistoModal({
                  ...imprevistoModal,
                  timeStr: e.target.value,
                })
              }
              className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 disabled:bg-zinc-100 disabled:text-zinc-500 disabled:cursor-not-allowed"
            />
            {modalValidation.status.hasShiftsOnDay &&
              !modalValidation.status.isDayClosedAlready && (
                <span className="text-[10px] text-zinc-500 block mt-1">
                  Horario regular de esta fecha:{" "}
                  {modalValidation.status.earliestStartStr} -{" "}
                  {modalValidation.status.latestEndStr}
                </span>
              )}
          </div>
        )}

        <div>
          <label
            htmlFor={reasonInputId}
            className="text-[10px] font-bold text-zinc-500 uppercase block"
          >
            Motivo (Visible si hay que avisar a pacientes)
          </label>
          <input
            id={reasonInputId}
            type="text"
            disabled={modalValidation.status.isDayClosedAlready}
            value={imprevistoModal.reason}
            onChange={(e) =>
              setImprevistoModal({
                ...imprevistoModal,
                reason: e.target.value,
              })
            }
            placeholder="Ej. Cumpleaños / Trámite personal"
            className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 text-base sm:text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 disabled:bg-zinc-100 disabled:text-zinc-500 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {modalTargetApts.length > 0 && imprevistoModal.type !== "LATE_START" && (
          <Button
            variant="danger"
            size="pill"
            disabled={!modalValidation.valid}
            onClick={() => onQuickImprevisto("CANCEL_ALL")}
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white border-transparent shadow-sm"
          >
            ⛔ Cerrar día, cancelar {modalTargetApts.length} cita(s) y notificar
          </Button>
        )}

        <div className="flex gap-2">
          <Button
            variant="primary"
            size="pill"
            disabled={!modalValidation.valid}
            onClick={() => onQuickImprevisto()}
            className="flex-1 py-3"
          >
            Aplicar Bloqueo
          </Button>
          <Button
            variant="secondary"
            size="pill"
            onClick={onClose}
            className="py-3 px-4"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </AccessibleModal>
  );
}
