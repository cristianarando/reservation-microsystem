"use client";

import React from "react";
import { AlertTriangle, Check } from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { ToastItem } from "@/components/ui/ToastContainer";
import { STAFF_AVATAR_PRESETS, getRandomStaffAvatar } from "@/lib/avatars";
import { formatLocalDateYYYYMMDD } from "@/lib/date-utils";
import {
  getDayScheduleStatus,
  getSuggestedOverrideTime,
  validateScheduleOverride,
  validateVacationRange,
} from "@/lib/validation/acceptance-criteria";
import { StaffModalState } from "./AdminTeamTab";
import type {
  PortalAppointment,
  PortalBusinessSettings,
  PortalService,
  PortalStaffMember,
  ServiceModalDraft,
} from "@/types/portal";

export interface ImprevistoModalState {
  open: boolean;
  type: "LATE_START" | "EARLY_LEAVE" | "FULL_DAY_OFF";
  timeStr: string;
  reason: string;
  staffId?: string;
}

export interface ConflictDataState {
  open: boolean;
  conflicts: PortalAppointment[];
  blockStart: string;
  blockEnd: string;
  type: string;
  reason: string;
}

export interface VacationModalState {
  open: boolean;
  staffId: string;
  startDate: string;
  endDate: string;
  reason: string;
}

interface AdminOperationModalsProps {
  agendaDateStr: string;
  selectedStaffId: string;
  isOwnerAdmin: boolean;
  staffList: PortalStaffMember[];
  services: PortalService[];
  settings?: PortalBusinessSettings | null;
  allAppointments: PortalAppointment[];
  resolveOverrideTargets: (targetId: string) => PortalStaffMember[];
  imprevistoModal: ImprevistoModalState;
  setImprevistoModal: React.Dispatch<React.SetStateAction<ImprevistoModalState>>;
  onQuickImprevisto: (resolution?: string, overrideStaffId?: string) => void;
  conflictData: ConflictDataState | null;
  setConflictData: React.Dispatch<
    React.SetStateAction<ConflictDataState | null>
  >;
  vacationModal: VacationModalState;
  setVacationModal: React.Dispatch<React.SetStateAction<VacationModalState>>;
  onScheduleVacation: (resolution?: string) => void;
  serviceModal: ServiceModalDraft | null;
  setServiceModal: React.Dispatch<
    React.SetStateAction<ServiceModalDraft | null>
  >;
  staffModal: StaffModalState | null;
  setStaffModal: React.Dispatch<React.SetStateAction<StaffModalState | null>>;
  savingStaff: boolean;
  onCreateStaff: () => void;
  noShowModalData: PortalAppointment | null;
  setNoShowModalData: React.Dispatch<
    React.SetStateAction<PortalAppointment | null>
  >;
  onStatusChange: (
    aptId: string,
    status: string,
    blockCustomer?: boolean,
    customReason?: string
  ) => Promise<void>;
  getWhatsAppNoShowUrl: (apt: PortalAppointment) => string;
  showToast: (type: ToastItem["type"], title: string, message?: string) => void;
  onRefresh: () => void;
}

export function AdminOperationModals({
  agendaDateStr,
  selectedStaffId,
  isOwnerAdmin,
  staffList,
  services,
  settings,
  allAppointments,
  resolveOverrideTargets,
  imprevistoModal,
  setImprevistoModal,
  onQuickImprevisto,
  conflictData,
  setConflictData,
  vacationModal,
  setVacationModal,
  onScheduleVacation,
  serviceModal,
  setServiceModal,
  staffModal,
  setStaffModal,
  savingStaff,
  onCreateStaff,
  noShowModalData,
  setNoShowModalData,
  onStatusChange,
  getWhatsAppNoShowUrl,
  showToast,
  onRefresh,
}: AdminOperationModalsProps) {
  return (
    <>
      {imprevistoModal.open &&
        (() => {
          const now = new Date();
          const activeModalStaffId =
            imprevistoModal.staffId || selectedStaffId;
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
            const aStr = formatLocalDateYYYYMMDD(new Date(a.startAt));
            return (
              aStr === agendaDateStr &&
              (a.status === "CONFIRMED" || a.status === "RESCHEDULED_BY_STAFF")
            );
          });
          const modalTargetApts = activeDateAptsAllStaff.filter((a) =>
            activeModalStaffId === "ALL"
              ? true
              : a.staffId === activeModalStaffId
          );
          const otherStaffWithApts =
            activeModalStaffId !== "ALL"
              ? activeDateAptsAllStaff.filter(
                  (a) => a.staffId !== activeModalStaffId
                )
              : [];

          return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
              <div className="bg-white rounded-[32px] p-5 sm:p-6 max-w-sm w-full shadow-2xl relative max-h-[92dvh] overflow-y-auto">
                <h3 className="text-base font-bold text-zinc-900">
                  {imprevistoModal.type === "LATE_START" &&
                    "🌅 Entrar más tarde hoy"}
                  {imprevistoModal.type === "EARLY_LEAVE" &&
                    "🎂 Salir antes / Cumpleaños"}
                  {imprevistoModal.type === "FULL_DAY_OFF" &&
                    "🏖️ Cerrar día completo"}
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
                                <button
                                  key={st.id}
                                  type="button"
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
                                  className="px-2.5 py-1 rounded-full bg-[#1F1F23] text-white text-[10px] font-bold hover:bg-black"
                                >
                                  Cambiar a {st.displayName} (hasta{" "}
                                  {altStatus.latestEndStr})
                                </button>
                              );
                            })}
                          </div>
                        )}
                    </div>
                  )}

                  {isOwnerAdmin && staffList.length > 1 && (
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                        ¿A qué agenda aplica este cierre / imprevisto?
                      </label>
                      <select
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
                        className="w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-xs bg-white focus:outline-none cursor-pointer"
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
                              {st.displayName} ({stCount} cita
                              {stCount === 1 ? "" : "s"} hoy{stClosedNote})
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
                          <b>{otherStaffWithApts.length} cita(s) activa(s)</b>{" "}
                          hoy.
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() =>
                              setImprevistoModal({
                                ...imprevistoModal,
                                staffId: otherStaffWithApts[0].staffId,
                              })
                            }
                            className="px-2.5 py-1 rounded-full bg-[#1F1F23] text-white text-[10px] font-bold hover:bg-black"
                          >
                            Cambiar a {otherStaffWithApts[0].staff?.displayName}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setImprevistoModal({
                                ...imprevistoModal,
                                staffId: "ALL",
                              })
                            }
                            className="px-2.5 py-1 rounded-full bg-white border border-amber-300 text-amber-950 text-[10px] font-bold hover:bg-amber-100"
                          >
                            👥 Cerrar todo el equipo
                          </button>
                        </div>
                      </div>
                    )}

                  {modalTargetApts.length > 0 && (
                    <div className="p-2.5 rounded-2xl bg-red-50 border border-red-200 text-[11px] text-red-950 space-y-1">
                      <div className="font-bold">
                        📋 {modalTargetApts.length} cita(s) activa(s) en esta
                        fecha:
                      </div>
                      {modalTargetApts.slice(0, 3).map((a) => (
                        <div key={a.id} className="text-[10px] text-red-800">
                          •{" "}
                          {new Date(a.startAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          — <b>{a.customer?.name}</b> ({a.service?.name})
                        </div>
                      ))}
                    </div>
                  )}

                  {imprevistoModal.type !== "FULL_DAY_OFF" && (
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase block">
                        {imprevistoModal.type === "LATE_START"
                          ? "Atenderé a partir de las:"
                          : "Cerrar atención a partir de las:"}
                      </label>
                      <input
                        type="time"
                        disabled={modalValidation.status.isDayClosedAlready}
                        value={imprevistoModal.timeStr}
                        onChange={(e) =>
                          setImprevistoModal({
                            ...imprevistoModal,
                            timeStr: e.target.value,
                          })
                        }
                        className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-sm disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed"
                      />
                      {modalValidation.status.hasShiftsOnDay &&
                        !modalValidation.status.isDayClosedAlready && (
                          <span className="text-[10px] text-zinc-400 block mt-1">
                            Horario regular de esta fecha:{" "}
                            {modalValidation.status.earliestStartStr} -{" "}
                            {modalValidation.status.latestEndStr}
                          </span>
                        )}
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase block">
                      Motivo (Visible si hay que avisar a pacientes)
                    </label>
                    <input
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
                      className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 text-base sm:text-xs font-medium disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  {modalTargetApts.length > 0 &&
                    imprevistoModal.type !== "LATE_START" && (
                      <button
                        type="button"
                        disabled={!modalValidation.valid}
                        onClick={() => onQuickImprevisto("CANCEL_ALL")}
                        className="w-full py-3 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        ⛔ Cerrar día, cancelar {modalTargetApts.length} cita(s)
                        y notificar
                      </button>
                    )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!modalValidation.valid}
                      onClick={() => onQuickImprevisto()}
                      className="flex-1 py-3 rounded-full bg-[#1F1F23] text-white text-xs font-semibold hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Aplicar Bloqueo
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setImprevistoModal({ ...imprevistoModal, open: false })
                      }
                      className="py-3 px-4 rounded-full bg-zinc-100 text-zinc-700 text-xs font-semibold hover:bg-zinc-200"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {conflictData?.open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-[32px] p-5 sm:p-6 max-w-sm w-full shadow-2xl border-2 border-amber-500 max-h-[92dvh] overflow-y-auto">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-2">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-center text-zinc-900">
              ¡Conflicto de Citas Detectado!
            </h3>
            <p className="text-xs text-zinc-600 text-center mt-1 leading-relaxed">
              Tienes <b>{conflictData.conflicts.length} cita(s) agendada(s)</b>{" "}
              en el horario que deseas bloquear:
            </p>

            <div className="my-3 p-3 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs max-h-36 overflow-y-auto space-y-2">
              {conflictData.conflicts.map((c) => (
                <div
                  key={c.id}
                  className="pb-1.5 border-b border-zinc-200 last:border-0"
                >
                  <div className="font-bold text-zinc-900">
                    {c.customer?.name} ({c.service?.name})
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Hora:{" "}
                    {new Date(c.startAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    • Tel: {c.customer?.phone}
                  </div>
                  {c.customerNotes && (
                    <div className="mt-1 text-[11px] text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-2 py-1 break-words">
                      <b>Nota:</b> {c.customerNotes}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p className="text-[10px] text-zinc-500 text-center mb-4">
              ¿Qué deseas hacer con estas citas?
            </p>

            <div className="space-y-2">
              {conflictData.type === "LATE_START" ? (
                <button
                  onClick={() => onQuickImprevisto("MOVE_TO_END")}
                  className="w-full py-3 rounded-full bg-[#1F1F23] hover:bg-black text-white text-xs font-semibold shadow-md flex items-center justify-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Mover citas a la nueva hora de entrada y notificar</span>
                </button>
              ) : (
                <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 text-center">
                  Al cerrar el resto del día o la jornada completa, las citas
                  afectadas deben cancelarse para notificar a los pacientes y
                  permitirles elegir una nueva fecha.
                </div>
              )}

              <button
                onClick={() =>
                  conflictData.type === "VACATION"
                    ? onScheduleVacation("CANCEL_ALL")
                    : onQuickImprevisto("CANCEL_ALL")
                }
                className="w-full py-2.5 rounded-full bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold"
              >
                Cancelar citas afectadas y notificar al cliente
              </button>

              <button
                onClick={() => setConflictData(null)}
                className="w-full py-2 rounded-full text-zinc-500 text-xs font-medium hover:bg-zinc-100"
              >
                Volver atrás sin bloquear
              </button>
            </div>
          </div>
        </div>
      )}

      {vacationModal.open &&
        (() => {
          const vacTargetId = vacationModal.staffId || selectedStaffId;
          const vacTargets = resolveOverrideTargets(vacTargetId);
          const hasBothDates = Boolean(
            vacationModal.startDate && vacationModal.endDate
          );
          const vacCheck = validateVacationRange({
            startDate: vacationModal.startDate,
            endDate: vacationModal.endDate || vacationModal.startDate,
            targets: vacTargets,
            now: new Date(),
          });
          const canSubmitVacation = hasBothDates && vacCheck.valid;

          return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
              <div className="bg-white rounded-[32px] p-5 sm:p-6 max-w-sm w-full shadow-2xl relative border border-zinc-200 max-h-[92dvh] overflow-y-auto">
                <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-2 text-2xl">
                  🏖️
                </div>
                <h3 className="text-base font-bold text-center text-zinc-900">
                  Programar Vacaciones o Receso
                </h3>
                <p className="text-xs text-zinc-500 text-center mt-1">
                  Selecciona el rango de fechas. El sistema bloqueará
                  automáticamente nuevas reservas en ese periodo, mientras
                  sigues atendiendo con normalidad hoy.
                </p>

                <div className="mt-4 space-y-3 text-xs">
                  {vacationModal.startDate && !vacCheck.valid && (
                    <div className="p-3 rounded-2xl bg-red-50 border border-red-300 text-xs text-red-900 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-red-800">
                        <span>🔒 Rango no disponible</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        {vacCheck.error}
                      </p>
                    </div>
                  )}

                  {isOwnerAdmin && staffList.length > 1 && (
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                        Profesional
                      </label>
                      <select
                        value={vacationModal.staffId || selectedStaffId}
                        onChange={(e) =>
                          setVacationModal({
                            ...vacationModal,
                            staffId: e.target.value,
                          })
                        }
                        className="w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-xs bg-white focus:outline-none"
                      >
                        {staffList.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.displayName} (
                            {st.specialtyTitle || "Especialista"})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                        Desde (Inicio)
                      </label>
                      <input
                        type="date"
                        min={formatLocalDateYYYYMMDD(new Date())}
                        value={vacationModal.startDate}
                        onChange={(e) =>
                          setVacationModal({
                            ...vacationModal,
                            startDate: e.target.value,
                          })
                        }
                        className="w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                        Hasta (Retorno)
                      </label>
                      <input
                        type="date"
                        min={
                          vacationModal.startDate ||
                          formatLocalDateYYYYMMDD(new Date())
                        }
                        value={vacationModal.endDate}
                        onChange={(e) =>
                          setVacationModal({
                            ...vacationModal,
                            endDate: e.target.value,
                          })
                        }
                        className="w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                      Motivo / Nota (Opcional · visible para pacientes)
                    </label>
                    <input
                      type="text"
                      value={vacationModal.reason}
                      onChange={(e) =>
                        setVacationModal({
                          ...vacationModal,
                          reason: e.target.value,
                        })
                      }
                      placeholder="Ej. Vacaciones de verano / Viaje / Congreso"
                      className="w-full p-2.5 rounded-2xl border border-zinc-300 text-base sm:text-xs focus:outline-none"
                    />
                  </div>

                  {hasBothDates &&
                    vacCheck.valid &&
                    vacationModal.startDate <= vacationModal.endDate &&
                    (() => {
                      const totalDays =
                        Math.ceil(
                          (new Date(vacationModal.endDate).getTime() -
                            new Date(vacationModal.startDate).getTime()) /
                            (1000 * 60 * 60 * 24)
                        ) + 1;
                      return (
                        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-medium">
                          🏖️ Se{" "}
                          {totalDays === 1
                            ? "bloqueará 1 día"
                            : `bloquearán ${totalDays} días`}{" "}
                          para reservas en línea.
                        </div>
                      );
                    })()}
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    disabled={!canSubmitVacation}
                    onClick={() => onScheduleVacation()}
                    className="flex-1 py-3 rounded-full bg-[#1F1F23] hover:bg-black text-white text-xs font-semibold transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Confirmar Vacaciones
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setVacationModal((prev) => ({ ...prev, open: false }))
                    }
                    className="py-3 px-4 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {serviceModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-[32px] p-5 sm:p-6 max-w-md w-full shadow-2xl relative max-h-[92dvh] overflow-y-auto">
            <h3 className="text-base font-bold text-zinc-900">
              {serviceModal.id ? "Editar Servicio" : "Crear Nuevo Servicio"}
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              {serviceModal.id
                ? "Modifica el nombre, duración, precio y qué especialistas lo realizan."
                : "Agrega un servicio con su duración, precio y profesionales asignados."}
            </p>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block">
                  Nombre del Servicio
                </label>
                <input
                  type="text"
                  value={serviceModal.name}
                  onChange={(e) =>
                    setServiceModal({ ...serviceModal, name: e.target.value })
                  }
                  placeholder="Ej. Consulta General / Servicio Principal"
                  className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 font-semibold text-base sm:text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block">
                  Descripción (Opcional)
                </label>
                <input
                  type="text"
                  value={serviceModal.description}
                  onChange={(e) =>
                    setServiceModal({
                      ...serviceModal,
                      description: e.target.value,
                    })
                  }
                  placeholder="Detalle breve del servicio"
                  className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 text-base sm:text-xs focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase block">
                    Duración (min)
                  </label>
                  <input
                    type="number"
                    value={serviceModal.durationMin}
                    onChange={(e) =>
                      setServiceModal({
                        ...serviceModal,
                        durationMin: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase block">
                    Precio ({settings?.currencySymbol || "Bs"})
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={serviceModal.price}
                    onChange={(e) =>
                      setServiceModal({
                        ...serviceModal,
                        price: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-sm focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-200">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-bold text-zinc-700 uppercase block">
                    ¿Quiénes realizan este servicio?
                  </label>
                  <span className="text-[10px] text-zinc-500 font-bold">
                    {(serviceModal.staffIds || []).length} de {staffList.length}{" "}
                    asignados
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 mb-2">
                  Solo los profesionales marcados podrán recibir citas de este
                  servicio. A los demás se les bloqueará automáticamente.
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 bg-zinc-50 rounded-2xl border border-zinc-200">
                  {staffList.map((st) => {
                    const isChecked = (serviceModal.staffIds || []).includes(
                      st.id
                    );
                    return (
                      <label
                        key={st.id}
                        className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all ${
                          isChecked
                            ? "bg-white border border-zinc-300 shadow-2xs"
                            : "hover:bg-zinc-100/70"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const currentIds = serviceModal.staffIds || [];
                              const next = e.target.checked
                                ? [...currentIds, st.id]
                                : currentIds.filter((id) => id !== st.id);
                              setServiceModal({
                                ...serviceModal,
                                staffIds: next,
                              });
                            }}
                            className="w-4 h-4 rounded text-zinc-900 accent-zinc-900 cursor-pointer"
                          />
                          <span className="font-bold text-zinc-800 text-xs">
                            {st.displayName}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-medium">
                          {st.specialtyTitle || "Especialista"}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {(serviceModal.staffIds || []).length === 0 && (
                  <p className="text-[10px] text-amber-700 font-bold mt-1.5">
                    ⚠️ Si no seleccionas a ningún profesional, este servicio no se
                    mostrará para reservas en el portal.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={async () => {
                  if (
                    !serviceModal.name ||
                    serviceModal.name.trim().length < 3
                  ) {
                    showToast(
                      "warning",
                      "Nombre inválido",
                      "El nombre del servicio debe tener al menos 3 caracteres."
                    );
                    return;
                  }
                  if (
                    !serviceModal.durationMin ||
                    serviceModal.durationMin < 5 ||
                    serviceModal.durationMin > 480
                  ) {
                    showToast(
                      "warning",
                      "Duración inválida",
                      "La duración debe estar entre 5 y 480 minutos."
                    );
                    return;
                  }
                  if (serviceModal.price < 0) {
                    showToast(
                      "warning",
                      "Precio inválido",
                      "El precio no puede ser negativo."
                    );
                    return;
                  }
                  try {
                    const isEdit = Boolean(serviceModal.id);
                    const res = await fetch("/api/admin/services", {
                      method: isEdit ? "PUT" : "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        ...serviceModal,
                        staffIds: serviceModal.staffIds || [],
                      }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      showToast(
                        "error",
                        "No se pudo guardar",
                        data.error || "Error al guardar el servicio."
                      );
                      return;
                    }
                    setServiceModal(null);
                    showToast(
                      "success",
                      isEdit ? "¡Servicio Actualizado!" : "¡Servicio Creado!",
                      isEdit
                        ? "Los cambios del servicio y profesionales asignados se guardaron correctamente."
                        : "El nuevo servicio se ha añadido correctamente al catálogo."
                    );
                    onRefresh();
                  } catch (err: unknown) {
                    showToast(
                      "error",
                      "Error",
                      err instanceof Error ? err.message : "Error inesperado."
                    );
                  }
                }}
                className="flex-1 py-3 rounded-full bg-[#1F1F23] hover:bg-black text-white text-xs font-semibold"
              >
                {serviceModal.id ? "Guardar Cambios" : "Crear Servicio"}
              </button>
              <button
                onClick={() => setServiceModal(null)}
                className="py-3 px-4 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {staffModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-[32px] p-5 sm:p-6 max-w-sm w-full shadow-2xl relative border border-zinc-200 max-h-[92dvh] overflow-y-auto">
            <h3 className="text-base font-bold text-zinc-900">
              👨‍⚕️ Agregar Profesional al Equipo
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Pre-autoriza el correo de Google del nuevo doctor o empleado. Al
              iniciar sesión, tendrá acceso restringido solo a su agenda y
              horarios.
            </p>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-zinc-600 uppercase block">
                  Nombre Completo / Título *
                </label>
                <input
                  type="text"
                  value={staffModal.displayName}
                  onChange={(e) =>
                    setStaffModal({ ...staffModal, displayName: e.target.value })
                  }
                  placeholder="Ej. Lic. Marcos Paz / Valeria"
                  className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 font-semibold text-base sm:text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-600 uppercase block">
                  Especialidad o Cargo *
                </label>
                <input
                  type="text"
                  value={staffModal.specialty}
                  onChange={(e) =>
                    setStaffModal({ ...staffModal, specialty: e.target.value })
                  }
                  placeholder="Ej. Especialista Principal / Atención General"
                  className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 text-base sm:text-xs font-medium focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-600 uppercase block">
                  Correo de Google (Para Login del Empleado) *
                </label>
                <input
                  type="email"
                  value={staffModal.email}
                  onChange={(e) =>
                    setStaffModal({ ...staffModal, email: e.target.value })
                  }
                  placeholder="ejemplo@gmail.com"
                  className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 text-base sm:text-xs font-semibold focus:outline-none"
                />
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  Con este correo ingresará a su panel de atención.
                </span>
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-600 uppercase block">
                  Teléfono / WhatsApp del Profesional
                </label>
                <input
                  type="tel"
                  value={staffModal.phone}
                  onChange={(e) =>
                    setStaffModal({ ...staffModal, phone: e.target.value })
                  }
                  placeholder="+59170012345"
                  className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 text-base sm:text-xs font-medium focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase block">
                    Icono de Perfil (Estilo Ilustrado)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setStaffModal({
                        ...staffModal,
                        avatarUrl: getRandomStaffAvatar(staffModal.avatarUrl),
                      })
                    }
                    className="px-2 py-0.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[10px] font-bold transition-all"
                  >
                    🎲 Aleatorio
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {STAFF_AVATAR_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setStaffModal({ ...staffModal, avatarUrl: preset.url })
                      }
                      title={preset.label}
                      className={`w-11 h-11 rounded-full overflow-hidden border-2 transition-all bg-zinc-100 ${
                        staffModal.avatarUrl === preset.url
                          ? "border-[#1F1F23] scale-105 shadow-md"
                          : "border-transparent opacity-75 hover:opacity-100"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- Static SVG preset avatars */}
                      <img
                        src={preset.url}
                        alt={preset.label}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>

              {services.length > 0 && (
                <div className="pt-2 border-t border-zinc-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-bold text-zinc-700 uppercase block">
                      ¿Qué servicios realizará?
                    </label>
                    <span className="text-[10px] text-zinc-500 font-bold">
                      {(staffModal.serviceIds || []).length} de{" "}
                      {services.length}
                    </span>
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto p-2 bg-zinc-50 rounded-2xl border border-zinc-200">
                    {services.map((svc) => {
                      const isChecked = (staffModal.serviceIds || []).includes(
                        svc.id
                      );
                      return (
                        <label
                          key={svc.id}
                          className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all ${
                            isChecked
                              ? "bg-white border border-zinc-300 shadow-2xs"
                              : "hover:bg-zinc-100/70"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const currentIds = staffModal.serviceIds || [];
                                const next = e.target.checked
                                  ? [...currentIds, svc.id]
                                  : currentIds.filter((id) => id !== svc.id);
                                setStaffModal({
                                  ...staffModal,
                                  serviceIds: next,
                                });
                              }}
                              className="w-4 h-4 rounded text-zinc-900 accent-zinc-900 cursor-pointer"
                            />
                            <span className="font-bold text-zinc-800 text-xs">
                              {svc.name}
                            </span>
                          </div>
                          <span className="text-[10px] text-zinc-500 font-semibold">
                            {settings?.currencySymbol || "Bs"}
                            {svc.price}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={onCreateStaff}
                disabled={savingStaff}
                className="flex-1 py-3 rounded-full bg-[#1F1F23] hover:bg-black text-white text-xs font-bold shadow-md"
              >
                {savingStaff ? "Autorizando..." : "Autorizar y Crear Cuenta"}
              </button>
              <button
                onClick={() => setStaffModal(null)}
                className="py-3 px-4 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {noShowModalData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-[32px] p-5 sm:p-6 max-w-sm w-full shadow-2xl border-2 border-amber-400 max-h-[92dvh] overflow-y-auto">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3 text-2xl font-bold">
              ⚠️
            </div>
            <h3 className="text-base font-bold text-center text-zinc-900">
              Registrar Inasistencia
            </h3>
            <p className="text-xs text-zinc-600 text-center mt-1 leading-relaxed">
              El paciente o cliente no se presentó a su horario reservado.
            </p>

            <div className="my-3.5 p-3.5 bg-zinc-100 rounded-2xl text-xs space-y-1">
              <div className="font-bold text-zinc-900">
                {noShowModalData.customer?.name || "Cliente"} •{" "}
                {noShowModalData.customer?.phone || "Sin tel."}
              </div>
              <div className="text-zinc-600">
                {noShowModalData.service?.name} —{" "}
                {new Date(noShowModalData.startAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              {noShowModalData.customerNotes && (
                <div className="mt-1.5 p-2 rounded-xl bg-white border border-zinc-200 text-[11px] text-zinc-700 break-words">
                  <b>Nota del cliente:</b> {noShowModalData.customerNotes}
                </div>
              )}
              <div className="mt-2 pt-2 border-t border-zinc-200 flex items-center justify-between">
                <span className="text-zinc-500">Inasistencias registradas:</span>
                <span className="font-bold text-amber-800">
                  {noShowModalData.customer?.noShowCount || 0} acumulada(s)
                </span>
              </div>
              {(noShowModalData.customer?.noShowCount || 0) + 1 >= 2 && (
                <div className="mt-2.5 p-2 bg-red-100 border border-red-300 rounded-xl text-red-900 font-semibold text-[11px] leading-tight flex items-start gap-1.5">
                  <span>🛡️</span>
                  <div>
                    <b>Límite del sistema activado:</b> Al registrar esta falta
                    acumulará 2 inasistencias y su cuenta será{" "}
                    <b>bloqueada automáticamente</b> para nuevas reservas
                    online.
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 mt-4">
              <a
                href={getWhatsAppNoShowUrl(noShowModalData)}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
              >
                <WhatsAppIcon className="w-3.5 h-3.5" />
                <span>Avisar por WhatsApp y consultar motivo</span>
              </a>

              <button
                onClick={async () => {
                  await onStatusChange(noShowModalData.id, "NO_SHOW");
                  setNoShowModalData(null);
                }}
                className="w-full py-3 rounded-full bg-[#1F1F23] hover:bg-black text-white text-xs font-bold shadow-md transition-all"
              >
                ⚠️ Confirmar Inasistencia (+1 Falta)
              </button>

              <button
                onClick={async () => {
                  await onStatusChange(noShowModalData.id, "NO_SHOW", true);
                  setNoShowModalData(null);
                }}
                className="w-full py-2.5 rounded-full bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold transition-all"
              >
                🚫 Registrar y Bloquear Cuenta de Inmediato
              </button>

              <button
                onClick={() => setNoShowModalData(null)}
                className="w-full py-2 rounded-full text-zinc-500 text-xs font-semibold hover:text-zinc-800"
              >
                Volver atrás sin cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
