"use client";

import React from "react";
import {
  AlertTriangle,
  Sun,
  Sunset,
  Coffee,
  Calendar,
  Clock,
  Pencil,
  Phone,
  FileText,
  Check,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { formatLocalDateYYYYMMDD } from "@/lib/date-utils";
import { isTimeOffOnDate } from "@/lib/timeoff-utils";
import {
  getDayScheduleStatus,
  getSuggestedOverrideTime,
} from "@/lib/validation/acceptance-criteria";
import type {
  PortalAppointment,
  PortalStaffMember,
  PortalUser,
} from "@/types/portal";

type AptFilterId = "pending" | "completed" | "noshow" | "all";

interface AdminAgendaTabProps {
  agendaDateStr: string;
  onChangeAgendaDate: (dateStr: string) => void;
  selectedStaffId: string;
  onSelectStaffId: (staffId: string) => void;
  selectedStaff?: PortalStaffMember;
  staffList: PortalStaffMember[];
  currentUser?: PortalUser | null;
  isOwnerAdmin: boolean;
  allAppointments: PortalAppointment[];
  dayAppointments: PortalAppointment[];
  adminAptFilter: AptFilterId;
  onChangeAptFilter: (filter: AptFilterId) => void;
  resolveOverrideTargets: (targetId: string) => PortalStaffMember[];
  onOpenImprevistoModal: (modal: {
    open: boolean;
    type: "LATE_START" | "EARLY_LEAVE" | "FULL_DAY_OFF";
    timeStr: string;
    reason: string;
    staffId?: string;
  }) => void;
  onOpenVacationModal: (modal: {
    open: boolean;
    staffId: string;
    startDate: string;
    endDate: string;
    reason: string;
  }) => void;
  onOpenShiftsEditor: (
    targetStaffObj?: PortalStaffMember,
    focusDayOfWeek?: number
  ) => void;
  onDeleteTimeOff: (timeOffId: string) => void;
  onCancelAllDayAppointments: (targetApts: PortalAppointment[]) => void;
  onStatusChange: (
    aptId: string,
    status: string,
    blockCustomer?: boolean,
    customReason?: string
  ) => void;
  onOpenNoShowModal: (apt: PortalAppointment) => void;
  getWhatsAppCancelUrl: (apt: PortalAppointment) => string;
  getWhatsAppNoShowUrl: (apt: PortalAppointment) => string;
}

export function AdminAgendaTab({
  agendaDateStr,
  onChangeAgendaDate,
  selectedStaffId,
  onSelectStaffId,
  selectedStaff,
  staffList,
  currentUser,
  isOwnerAdmin,
  allAppointments,
  dayAppointments,
  adminAptFilter,
  onChangeAptFilter,
  resolveOverrideTargets,
  onOpenImprevistoModal,
  onOpenVacationModal,
  onOpenShiftsEditor,
  onDeleteTimeOff,
  onCancelAllDayAppointments,
  onStatusChange,
  onOpenNoShowModal,
  getWhatsAppCancelUrl,
  getWhatsAppNoShowUrl,
}: AdminAgendaTabProps) {
  const now = new Date();
  const agendaStatus = getDayScheduleStatus({
    dateStr: agendaDateStr,
    targets: resolveOverrideTargets(selectedStaffId),
    isAllTargets: selectedStaffId === "ALL",
    now,
  });
  const isClosedDay = agendaStatus.isDayClosedAlready;
  const closedTag =
    agendaStatus.closedBadge ||
    (agendaStatus.isPastDate
      ? "Fecha pasada"
      : !agendaStatus.hasShiftsOnDay
      ? "Sin atención"
      : `Cerró ${agendaStatus.latestEndStr}`);
  const isVacationBtnDisabled =
    agendaStatus.closureCode === "VACATION" ||
    agendaStatus.closureCode === "FULL_DAY_OFF" ||
    agendaStatus.closureCode === "STAFF_PAUSED" ||
    agendaStatus.closureCode === "PARTIAL_BLOCKS_CLOSED";
  const openDoctorsToday = isOwnerAdmin
    ? staffList.filter(
        (st) =>
          st.id !== selectedStaffId &&
          !getDayScheduleStatus({
            dateStr: agendaDateStr,
            targets: [st],
            now,
          }).isDayClosedAlready
      )
    : [];

  const agendaDateObj = new Date(`${agendaDateStr}T00:00:00`);
  const dayOfWeek = agendaDateObj.getDay();
  const targets = resolveOverrideTargets(selectedStaffId);
  const isAll = selectedStaffId === "ALL";
  const dayStatus = getDayScheduleStatus({
    dateStr: agendaDateStr,
    targets,
    isAllTargets: isAll,
    now,
  });

  const focusedStaff = isAll
    ? staffList.find((s) => s.id === currentUser?.staffProfile?.id) ||
      targets.find((s) =>
        (s.workingShifts || []).some((sh) => sh.dayOfWeek === dayOfWeek)
      ) ||
      staffList[0]
    : targets[0] || selectedStaff;

  const dayShifts =
    !isAll && focusedStaff
      ? (focusedStaff.workingShifts || [])
          .filter((s) => s.dayOfWeek === dayOfWeek)
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
      : [];

  const baseScheduleText = isAll
    ? dayStatus.hasShiftsOnDay
      ? `${dayStatus.baseEarliestStartStr || dayStatus.earliestStartStr} - ${
          dayStatus.baseLatestEndStr || dayStatus.latestEndStr
        }`
      : "Sin atención"
    : dayShifts.length > 0
    ? dayShifts.map((s) => `${s.startTime} - ${s.endTime}`).join(" · ")
    : "Sin atención";

  const scheduleText = dayStatus.hasPartialBlockOnDay
    ? `${dayStatus.earliestStartStr} - ${dayStatus.latestEndStr}`
    : baseScheduleText;

  const hasHours = isAll ? dayStatus.hasShiftsOnDay : dayShifts.length > 0;
  const isBlockedByVacationOrDayOff =
    dayStatus.closureCode === "VACATION" ||
    dayStatus.closureCode === "FULL_DAY_OFF" ||
    dayStatus.closureCode === "PARTIAL_BLOCKS_CLOSED" ||
    dayStatus.closureCode === "STAFF_PAUSED";
  const showClosedTodayTag =
    !isBlockedByVacationOrDayOff &&
    dayStatus.isToday &&
    dayStatus.hasShiftsOnDay &&
    dayStatus.isDayClosedAlready;

  const activeStaffObj = staffList.find((s) => s.id === selectedStaffId);
  const dayBlocks = (
    selectedStaffId === "ALL"
      ? staffList.flatMap((st) => st.timeOffs || [])
      : activeStaffObj?.timeOffs || []
  ).filter((to) => isTimeOffOnDate(to, agendaDateStr));

  const pendingDayApts = dayAppointments.filter(
    (a) => a.status === "CONFIRMED" || a.status === "RESCHEDULED_BY_STAFF"
  );

  const filteredApts = dayAppointments.filter((a) => {
    if (adminAptFilter === "pending")
      return a.status === "CONFIRMED" || a.status === "RESCHEDULED_BY_STAFF";
    if (adminAptFilter === "completed") return a.status === "COMPLETED";
    if (adminAptFilter === "noshow") return a.status === "NO_SHOW";
    return true;
  });

  const otherStaffActiveApts =
    isOwnerAdmin && selectedStaffId && selectedStaffId !== "ALL"
      ? allAppointments.filter((a) => {
          const aStr = formatLocalDateYYYYMMDD(new Date(a.startAt));
          return (
            aStr === agendaDateStr &&
            a.staffId !== selectedStaffId &&
            (a.status === "CONFIRMED" || a.status === "RESCHEDULED_BY_STAFF")
          );
        })
      : [];

  return (
    <div className="p-4 space-y-4">
      <div className="p-3 bg-zinc-100 rounded-[24px] border border-zinc-200 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            Acciones Rápidas de Imprevisto
          </span>
          <span className="text-[10px] text-zinc-400">
            {isClosedDay ? closedTag : "1-Toque"}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            disabled={isClosedDay}
            title={isClosedDay ? agendaStatus.reason : undefined}
            onClick={() =>
              onOpenImprevistoModal({
                open: true,
                type: "LATE_START",
                timeStr: getSuggestedOverrideTime(
                  "LATE_START",
                  agendaStatus,
                  now
                ),
                reason: `Llegaré más tarde (${agendaDateStr})`,
                staffId: selectedStaffId,
              })
            }
            className={`p-2.5 rounded-2xl border text-left transition-all ${
              isClosedDay
                ? "bg-zinc-50 border-zinc-200 text-zinc-400 opacity-60 cursor-not-allowed"
                : "bg-white border-zinc-300 text-zinc-800 hover:border-zinc-800 shadow-sm"
            }`}
          >
            <Sun
              className={`w-4 h-4 mb-1 ${
                isClosedDay ? "text-zinc-400" : "text-amber-500"
              }`}
            />
            <div className="text-xs font-bold leading-tight">
              Entro más tarde
            </div>
            <div className="text-[10px] text-zinc-400">
              {isClosedDay ? closedTag : "Hora de inicio"}
            </div>
          </button>

          <button
            type="button"
            disabled={isClosedDay}
            title={isClosedDay ? agendaStatus.reason : undefined}
            onClick={() =>
              onOpenImprevistoModal({
                open: true,
                type: "EARLY_LEAVE",
                timeStr: getSuggestedOverrideTime(
                  "EARLY_LEAVE",
                  agendaStatus,
                  now
                ),
                reason: `Cerrar temprano (${agendaDateStr})`,
                staffId: selectedStaffId,
              })
            }
            className={`p-2.5 rounded-2xl border text-left transition-all ${
              isClosedDay
                ? "bg-zinc-50 border-zinc-200 text-zinc-400 opacity-60 cursor-not-allowed"
                : "bg-white border-zinc-300 text-zinc-800 hover:border-zinc-800 shadow-sm"
            }`}
          >
            <Sunset
              className={`w-4 h-4 mb-1 ${
                isClosedDay ? "text-zinc-400" : "text-orange-500"
              }`}
            />
            <div className="text-xs font-bold leading-tight">Salgo antes</div>
            <div className="text-[10px] text-zinc-400">
              {isClosedDay ? closedTag : "Hora de cierre"}
            </div>
          </button>

          <button
            type="button"
            disabled={isClosedDay}
            title={isClosedDay ? agendaStatus.reason : undefined}
            onClick={() => {
              const isToday =
                agendaDateStr === formatLocalDateYYYYMMDD(new Date());
              onOpenImprevistoModal({
                open: true,
                type: "FULL_DAY_OFF",
                timeStr: "00:00",
                reason: isToday
                  ? "No atiendo hoy por descanso/imprevisto"
                  : `Cerrado el ${agendaDateStr} por descanso/imprevisto`,
                staffId: selectedStaffId,
              });
            }}
            className={`p-2.5 rounded-2xl border text-left transition-all ${
              isClosedDay
                ? "bg-zinc-50 border-zinc-200 text-zinc-400 opacity-60 cursor-not-allowed"
                : "bg-white border-red-300 text-zinc-800 hover:border-zinc-800 shadow-sm"
            }`}
          >
            <Coffee
              className={`w-4 h-4 mb-1 ${
                isClosedDay ? "text-zinc-400" : "text-purple-600"
              }`}
            />
            <div className="text-xs font-bold leading-tight">Cerrar día</div>
            <div
              className={`text-[10px] font-semibold ${
                isClosedDay ? "text-zinc-400" : "text-red-600"
              }`}
            >
              {isClosedDay
                ? closedTag
                : agendaDateStr === formatLocalDateYYYYMMDD(new Date())
                ? "No atender hoy"
                : `Cerrar ${agendaDateStr}`}
            </div>
          </button>

          <button
            type="button"
            disabled={isVacationBtnDisabled}
            title={isVacationBtnDisabled ? agendaStatus.reason : undefined}
            onClick={() =>
              onOpenVacationModal({
                open: true,
                staffId:
                  selectedStaffId === "ALL"
                    ? staffList[0]?.id || ""
                    : selectedStaffId,
                startDate: agendaStatus.isPastDate
                  ? formatLocalDateYYYYMMDD(now)
                  : agendaDateStr,
                endDate: "",
                reason: "",
              })
            }
            className={`p-2.5 rounded-2xl border text-left transition-all ${
              isVacationBtnDisabled
                ? "bg-zinc-50 border-zinc-200 text-zinc-400 opacity-60 cursor-not-allowed"
                : "bg-white border-amber-300 text-zinc-800 hover:border-zinc-800 shadow-sm"
            }`}
          >
            <div
              className={`text-sm leading-none mb-1 ${
                isVacationBtnDisabled ? "grayscale opacity-60" : ""
              }`}
            >
              🏖️
            </div>
            <div className="text-xs font-bold leading-tight">Vacaciones</div>
            <div
              className={`text-[10px] font-semibold ${
                isVacationBtnDisabled ? "text-zinc-400" : "text-amber-700"
              }`}
            >
              {isVacationBtnDisabled ? closedTag : "Rango de fechas"}
            </div>
          </button>
        </div>

        {isClosedDay && (
          <div className="p-2.5 rounded-2xl bg-white/80 border border-zinc-200 text-[11px] text-zinc-600 flex items-center justify-between gap-2 flex-wrap">
            <span>🔒 {agendaStatus.reason}</span>
            {openDoctorsToday.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {openDoctorsToday.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => onSelectStaffId(st.id)}
                    className="px-2.5 py-0.5 rounded-full bg-[#1F1F23] text-white text-[10px] font-bold hover:bg-black transition-all"
                  >
                    Ver {st.displayName}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Date Picker Bar */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="w-4 h-4 text-zinc-500" />
            <input
              type="date"
              value={agendaDateStr}
              onChange={(e) => onChangeAgendaDate(e.target.value)}
              className="font-bold text-base sm:text-sm bg-zinc-100 px-3 py-1.5 rounded-xl border border-zinc-300 text-zinc-800 focus:outline-none"
            />

            <div
              data-testid="agenda-day-schedule"
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-all ${
                isBlockedByVacationOrDayOff
                  ? "bg-red-50 border-red-200 text-red-900"
                  : !hasHours
                  ? "bg-zinc-50 border-zinc-200 text-zinc-500"
                  : showClosedTodayTag || dayStatus.hasPartialBlockOnDay
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : "bg-emerald-50/70 border-emerald-200 text-emerald-950"
              }`}
            >
              <Clock
                className={`w-3.5 h-3.5 flex-shrink-0 ${
                  isBlockedByVacationOrDayOff
                    ? "text-red-600"
                    : !hasHours
                    ? "text-zinc-400"
                    : showClosedTodayTag || dayStatus.hasPartialBlockOnDay
                    ? "text-amber-600"
                    : "text-emerald-700"
                }`}
              />
              {isBlockedByVacationOrDayOff ? (
                <span className="font-semibold flex items-center gap-1.5 flex-wrap">
                  <span className="font-extrabold">
                    {dayStatus.closureCode === "VACATION"
                      ? "🏖️ En vacaciones programadas"
                      : dayStatus.closureCode === "STAFF_PAUSED"
                      ? "🏖️ Agenda en pausa"
                      : "⛔ Día cerrado por bloqueo"}
                  </span>
                  {hasHours && (
                    <span className="text-[11px] font-medium text-red-700/80">
                      (Turno habitual: {baseScheduleText})
                    </span>
                  )}
                </span>
              ) : (
                <span className="font-semibold">
                  {isAll ? "Equipo: " : "Atención: "}
                  <span className="font-extrabold">{scheduleText}</span>
                </span>
              )}
              {dayStatus.hasPartialBlockOnDay && !isBlockedByVacationOrDayOff && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                  Horario ajustado
                </span>
              )}
              {showClosedTodayTag && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                  Ya cerró
                </span>
              )}
              {focusedStaff && !isBlockedByVacationOrDayOff && (
                <button
                  type="button"
                  onClick={() => onOpenShiftsEditor(focusedStaff, dayOfWeek)}
                  className="ml-0.5 px-2 py-0.5 rounded-lg bg-white hover:bg-zinc-100 border border-zinc-300 text-[11px] font-bold text-[#1F1F23] inline-flex items-center gap-1 shadow-2xs transition-all"
                  title={`Modificar horario de ${focusedStaff.displayName} para este día`}
                >
                  <Pencil className="w-2.5 h-2.5" />
                  <span>{hasHours ? "Modificar" : "Configurar"}</span>
                </button>
              )}
            </div>
          </div>

          <span className="text-xs font-semibold text-zinc-500 capitalize">
            {new Date(`${agendaDateStr}T00:00:00`).toLocaleDateString("es-ES", {
              weekday: "long",
            })}
          </span>
        </div>

        {/* Quick 7-Day Pills */}
        <div className="overflow-x-auto no-scrollbar pill-slider flex items-center gap-1.5 py-1">
          {Array.from({ length: 7 }).map((_, idx) => {
            const d = new Date();
            d.setDate(d.getDate() + idx);
            const dStr = formatLocalDateYYYYMMDD(d);
            const shortDays = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
            const dayLabel =
              idx === 0 ? "Hoy" : idx === 1 ? "Mañ" : shortDays[d.getDay()];
            const isSel = dStr === agendaDateStr;
            const count = allAppointments.filter((a) => {
              const aStr = formatLocalDateYYYYMMDD(new Date(a.startAt));
              const matchesStaff =
                !selectedStaffId ||
                selectedStaffId === "ALL" ||
                a.staffId === selectedStaffId;
              return (
                aStr === dStr &&
                matchesStaff &&
                (a.status === "CONFIRMED" || a.status === "RESCHEDULED_BY_STAFF")
              );
            }).length;

            return (
              <button
                key={dStr}
                type="button"
                onClick={() => onChangeAgendaDate(dStr)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${
                  isSel
                    ? "bg-[#1F1F23] text-white shadow-md"
                    : count > 0
                    ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                    : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
                }`}
              >
                <span>
                  {dayLabel} {d.getDate()}
                </span>
                {count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      isSel
                        ? "bg-emerald-400 text-zinc-900"
                        : "bg-emerald-600 text-white"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active TimeOffs */}
      {dayBlocks.length > 0 && (
        <div className="space-y-2">
          {dayBlocks.map((to) => {
            const s = new Date(to.startAt);
            const e = new Date(to.endAt);
            const isFullDay =
              s.getHours() === 0 &&
              s.getMinutes() === 0 &&
              e.getHours() === 23 &&
              e.getMinutes() >= 58;
            return (
              <div
                key={to.id}
                className="p-3.5 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-between gap-3 flex-wrap shadow-2xs"
              >
                <div className="flex items-start gap-2.5 text-xs">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-red-950">
                      {to.type === "VACATION"
                        ? `🏖️ Vacaciones programadas (${agendaDateStr})`
                        : isFullDay
                        ? `⛔ Día cerrado (${agendaDateStr})`
                        : `⏳ Horario bloqueado: ${s.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })} - ${e.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`}
                    </div>
                    <div className="text-[11px] text-red-800 mt-0.5">
                      Motivo:{" "}
                      <b>
                        {to.reason ||
                          (to.type === "VACATION"
                            ? "Vacaciones programadas"
                            : "Imprevisto de agenda")}
                      </b>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteTimeOff(to.id)}
                  className="px-3 py-1.5 rounded-full bg-white hover:bg-red-100 text-red-700 border border-red-300 text-[11px] font-bold transition-all shadow-2xs"
                >
                  🔓 Reabrir horario / Quitar bloqueo
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Appointments List */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5 flex-wrap">
            <span>Citas de la Fecha ({dayAppointments.length})</span>
            <span className="text-[11px] font-semibold text-zinc-400 normal-case">
              •{" "}
              {selectedStaffId === "ALL"
                ? "Todo el equipo"
                : staffList.find((s) => s.id === selectedStaffId)?.displayName ||
                  "doctor seleccionado"}
            </span>
          </h3>

          {pendingDayApts.length > 0 && (
            <button
              type="button"
              onClick={() => onCancelAllDayAppointments(pendingDayApts)}
              className="px-3 py-1 rounded-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-bold transition-all shadow-2xs"
            >
              ✕ Cancelar todas las de esta fecha ({pendingDayApts.length})
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pill-slider py-1">
          {[
            {
              id: "pending" as const,
              label: "Pendientes",
              count: dayAppointments.filter(
                (a) =>
                  a.status === "CONFIRMED" ||
                  a.status === "RESCHEDULED_BY_STAFF"
              ).length,
            },
            {
              id: "completed" as const,
              label: "✓ Atendidas",
              count: dayAppointments.filter((a) => a.status === "COMPLETED")
                .length,
            },
            {
              id: "noshow" as const,
              label: "⚠️ No asistió",
              count: dayAppointments.filter((a) => a.status === "NO_SHOW")
                .length,
            },
            {
              id: "all" as const,
              label: "Todas",
              count: dayAppointments.length,
            },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => onChangeAptFilter(f.id)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                adminAptFilter === f.id
                  ? "bg-[#1F1F23] text-white shadow-sm"
                  : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
              }`}
            >
              <span>{f.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  adminAptFilter === f.id
                    ? "bg-white/20 text-white"
                    : "bg-zinc-300 text-zinc-800"
                }`}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {filteredApts.length === 0 ? (
          <div className="space-y-3">
            {otherStaffActiveApts.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex items-center justify-between gap-3 flex-wrap shadow-2xs">
                <div className="text-xs text-amber-950 space-y-0.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>🔔</span>
                    <span>
                      Hay {otherStaffActiveApts.length} cita(s) activa(s) hoy (
                      {agendaDateStr}) con otro profesional:
                    </span>
                  </div>
                  <div className="text-[11px] text-amber-900">
                    {otherStaffActiveApts
                      .map(
                        (a) =>
                          `${a.staff?.displayName || "Doctor"} (${new Date(
                            a.startAt
                          ).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })} • ${a.customer?.name || "Cliente"})`
                      )
                      .join(" — ")}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {otherStaffActiveApts[0].staffId && (
                    <button
                      type="button"
                      onClick={() =>
                        onSelectStaffId(otherStaffActiveApts[0].staffId || "")
                      }
                      className="px-3 py-1.5 rounded-full bg-[#1F1F23] hover:bg-black text-white text-[11px] font-bold transition-all shadow-2xs"
                    >
                      Ver agenda de {otherStaffActiveApts[0].staff?.displayName}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectStaffId("ALL")}
                    className="px-3 py-1.5 rounded-full bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 text-[11px] font-bold transition-all"
                  >
                    👥 Ver todo el equipo
                  </button>
                </div>
              </div>
            )}

            <div className="py-7 px-4 text-center text-xs text-zinc-500 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-1.5">
              <div className="font-semibold text-zinc-700">
                No hay citas{" "}
                {adminAptFilter === "pending"
                  ? "pendientes de atender"
                  : adminAptFilter === "completed"
                  ? "atendidas"
                  : adminAptFilter === "noshow"
                  ? "con inasistencia"
                  : ""}{" "}
                para esta fecha ({agendaDateStr})
                {selectedStaffId && selectedStaffId !== "ALL" && (
                  <span>
                    {" "}
                    con{" "}
                    {
                      staffList.find((s) => s.id === selectedStaffId)
                        ?.displayName
                    }
                  </span>
                )}
                .
              </div>
              <p className="text-[11px] text-zinc-400">
                Si buscas una cita de otro día (ej. sábado), selecciónalo en los
                botones de fecha arriba (&quot;Mañ 7&quot;, etc.).
              </p>
            </div>
          </div>
        ) : (
          filteredApts.map((apt) => {
            const isPastTime = new Date(apt.startAt) < new Date();
            const isPending =
              apt.status === "CONFIRMED" ||
              apt.status === "RESCHEDULED_BY_STAFF";
            const isCompleted = apt.status === "COMPLETED";
            const isNoShow = apt.status === "NO_SHOW";
            const isCancelled = apt.status === "CANCELLED";

            return (
              <div
                key={apt.id}
                className={`p-4 rounded-3xl border shadow-sm space-y-2.5 transition-all ${
                  isCompleted
                    ? "border-emerald-300 bg-emerald-50/70"
                    : isNoShow
                    ? "border-amber-300 bg-amber-50/70"
                    : isCancelled
                    ? "border-zinc-200 bg-zinc-50 opacity-70"
                    : "border-zinc-200 bg-white"
                }`}
              >
                {isPending && isPastTime && (
                  <div className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-zinc-950 inline-flex items-center gap-1 shadow-sm">
                    <span>⏳</span>
                    <span>
                      Horario transcurrido • Requiere marcar Atendida o No se
                      presentó
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#1F1F23]">
                      {new Date(apt.startAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-xs text-zinc-500">
                      ({apt.service?.durationMin} min)
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-700">
                      {apt.service?.name}
                    </span>
                    {selectedStaffId === "ALL" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                        🩺 {apt.staff?.displayName}
                      </span>
                    )}
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isCompleted
                        ? "bg-emerald-600 text-white"
                        : isNoShow
                        ? "bg-amber-600 text-white"
                        : isCancelled
                        ? "bg-zinc-600 text-white"
                        : apt.status === "RESCHEDULED_BY_STAFF"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {isCompleted
                      ? "✓ ATENDIDA"
                      : isNoShow
                      ? "⚠️ NO ASISTIÓ"
                      : apt.status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-zinc-700">
                  <div>
                    Cliente: <b>{apt.customer?.name || "Cliente"}</b>
                    {(apt.customer?.noShowCount ?? 0) > 0 && (
                      <span className="ml-1 text-[11px] text-amber-700 font-semibold">
                        ({apt.customer?.noShowCount} inasistencia
                        {(apt.customer?.noShowCount ?? 0) > 1 ? "s" : ""})
                      </span>
                    )}
                  </div>
                  {apt.customer?.phone && (
                    <div className="flex items-center gap-2">
                      <a
                        href={`tel:${apt.customer.phone}`}
                        className="flex items-center gap-1 text-zinc-600 hover:text-black font-medium"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Llamar</span>
                      </a>
                      <a
                        href={`https://wa.me/${apt.customer.phone.replace(
                          /\D/g,
                          ""
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-semibold"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  )}
                </div>

                {apt.customerNotes && (
                  <div className="p-2.5 rounded-2xl bg-sky-50/80 border border-sky-200 text-xs text-sky-950 flex items-start gap-2">
                    <FileText className="w-3.5 h-3.5 text-sky-700 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-800 block">
                        Nota / detalle del cliente:
                      </span>
                      <p className="text-xs text-zinc-800 break-words leading-snug mt-0.5">
                        {apt.customerNotes}
                      </p>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-zinc-100 flex items-center justify-end gap-2 flex-wrap">
                  {isPending && (
                    <>
                      <button
                        onClick={() => onStatusChange(apt.id, "COMPLETED")}
                        className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Atendida</span>
                      </button>
                      <button
                        onClick={() => onOpenNoShowModal(apt)}
                        className="px-3 py-1.5 rounded-full bg-[#1F1F23] hover:bg-black text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>No se presentó</span>
                      </button>
                      <button
                        onClick={() => onStatusChange(apt.id, "CANCELLED")}
                        className="px-2.5 py-1.5 rounded-full bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => {
                          onStatusChange(apt.id, "CANCELLED");
                          window.open(getWhatsAppCancelUrl(apt), "_blank");
                        }}
                        className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
                        title="Cancela la cita y abre WhatsApp con el mensaje listo"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5" />
                        <span>Cancelar y avisar</span>
                      </button>
                    </>
                  )}

                  {isCompleted && (
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                        <Check className="w-4 h-4" /> Cita finalizada con éxito
                      </span>
                      <button
                        onClick={() => onStatusChange(apt.id, "CONFIRMED")}
                        className="px-3 py-1 rounded-full bg-zinc-100 text-zinc-700 text-xs hover:bg-zinc-200"
                      >
                        ↩ Revertir a pendiente
                      </button>
                    </div>
                  )}

                  {isNoShow && (
                    <div className="flex items-center justify-between w-full flex-wrap gap-2">
                      <span className="text-xs text-amber-800 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />{" "}
                        Inasistencia asentada
                      </span>
                      <div className="flex items-center gap-1.5">
                        <a
                          href={getWhatsAppNoShowUrl(apt)}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1"
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>
                        <button
                          onClick={() => onStatusChange(apt.id, "CONFIRMED")}
                          className="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 text-xs hover:bg-zinc-200"
                        >
                          ↩ Revertir
                        </button>
                      </div>
                    </div>
                  )}

                  {isCancelled && (
                    <a
                      href={getWhatsAppCancelUrl(apt)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
                      title="Avisar al cliente por WhatsApp con mensaje pre-redactado"
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5" />
                      <span>Avisar por WhatsApp</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
