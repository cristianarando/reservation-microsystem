"use client";

import React from "react";
import {
  Clock,
  Save,
  Sparkles,
  Settings,
  AlertTriangle,
  AlertCircle,
  Plus,
  Trash2,
  Check,
} from "lucide-react";
import {
  ShiftValidationResult,
  timeToMinutes,
} from "@/lib/validation/acceptance-criteria";
import { EditableShift } from "@/hooks/useAdminShifts";
import type {
  PortalBusinessSettings,
  PortalStaffMember,
} from "@/types/portal";

interface AdminShiftsTabProps {
  selectedStaff?: PortalStaffMember;
  selectedStaffId: string;
  staffList: PortalStaffMember[];
  settings?: PortalBusinessSettings | null;
  isOwnerAdmin: boolean;
  isEditingShifts: boolean;
  setIsEditingShifts: (editing: boolean) => void;
  editingShiftsList: EditableShift[];
  editingHorizonDays: number;
  setEditingHorizonDays: (days: number) => void;
  editingLeadTimeMin: number;
  setEditingLeadTimeMin: (minutes: number) => void;
  savingShifts: boolean;
  highlightedShiftDay: number | null;
  shiftsValidation: ShiftValidationResult;
  onSelectStaffId: (staffId: string) => void;
  onStartEditingShifts: () => void;
  onSaveShifts: () => void;
  onToggleStaffActive: (staffId: string, newActiveState: boolean) => void;
  onOpenVacationModal: (modal: {
    open: boolean;
    staffId: string;
    startDate: string;
    endDate: string;
    reason: string;
  }) => void;
  onDeleteTimeOff: (timeOffId: string) => void;
  onApplyPreset: (type: "continua" | "partido") => void;
  onCopyMondayToWeek: () => void;
  onToggleDay: (day: number) => void;
  onAddShiftToDay: (day: number) => void;
  onUpdateShiftTime: (
    tempId: string,
    field: "startTime" | "endTime",
    val: string
  ) => void;
  onRemoveSpecificShift: (tempId: string) => void;
}

const WEEK_DAYS = [
  { day: 1, name: "Lunes" },
  { day: 2, name: "Martes" },
  { day: 3, name: "Miércoles" },
  { day: 4, name: "Jueves" },
  { day: 5, name: "Viernes" },
  { day: 6, name: "Sábado" },
  { day: 0, name: "Domingo" },
];

export function AdminShiftsTab({
  selectedStaff,
  selectedStaffId,
  staffList,
  settings,
  isOwnerAdmin,
  isEditingShifts,
  setIsEditingShifts,
  editingShiftsList,
  editingHorizonDays,
  setEditingHorizonDays,
  editingLeadTimeMin,
  setEditingLeadTimeMin,
  savingShifts,
  highlightedShiftDay,
  shiftsValidation,
  onSelectStaffId,
  onStartEditingShifts,
  onSaveShifts,
  onToggleStaffActive,
  onOpenVacationModal,
  onDeleteTimeOff,
  onApplyPreset,
  onCopyMondayToWeek,
  onToggleDay,
  onAddShiftToDay,
  onUpdateShiftTime,
  onRemoveSpecificShift,
}: AdminShiftsTabProps) {
  const myVacations = (selectedStaff?.timeOffs || []).filter(
    (to) =>
      to.type === "VACATION" ||
      new Date(to.endAt).getTime() - new Date(to.startAt).getTime() >
        24 * 3600 * 1000
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-zinc-200">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-900" />
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">
              Horarios de Atención Semanales
            </h2>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Configurando la agenda de: <b>{selectedStaff?.displayName}</b>
            {selectedStaff?.specialtyTitle
              ? ` (${selectedStaff.specialtyTitle})`
              : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isOwnerAdmin && !isEditingShifts && (
            <select
              value={selectedStaffId}
              onChange={(e) => {
                onSelectStaffId(e.target.value);
                setIsEditingShifts(false);
              }}
              className="text-base sm:text-xs font-bold bg-zinc-100 border border-zinc-300 text-zinc-800 rounded-full px-3 py-1.5 focus:outline-none max-w-full"
              title="Cambiar profesional para editar sus horarios"
            >
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          )}

          {!isEditingShifts ? (
            <button
              type="button"
              onClick={onStartEditingShifts}
              className="px-4 py-2 rounded-full bg-[#1F1F23] hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Modificar Horarios</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditingShifts(false)}
                className="px-3.5 py-2 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingShifts}
                onClick={onSaveShifts}
                className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingShifts ? "Guardando..." : "Guardar Cambios"}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Availability Card */}
      <div
        className={`p-4 rounded-3xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
          selectedStaff?.isActive
            ? "bg-emerald-50/80 border-emerald-200 text-emerald-950"
            : "bg-amber-50 border-amber-300 text-amber-950 shadow-sm"
        }`}
      >
        <div className="flex items-start sm:items-center gap-3">
          <span className="text-2xl flex-shrink-0">
            {selectedStaff?.isActive ? "🟢" : "🏖️"}
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm">
                {selectedStaff?.isActive
                  ? "Agenda Activa (Disponible para reservas)"
                  : "Modo Vacaciones / Agenda en Pausa"}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                  selectedStaff?.isActive
                    ? "bg-emerald-200 text-emerald-900"
                    : "bg-amber-200 text-amber-900"
                }`}
              >
                {selectedStaff?.isActive
                  ? "Visible al público"
                  : "Oculto para clientes"}
              </span>
            </div>
            <p className="text-xs opacity-85 mt-0.5">
              {selectedStaff?.isActive
                ? "Tu perfil está visible en el portal y los clientes pueden agendar en tus horarios habilitados."
                : "Estás temporalmente oculto del portal de reservas. Los clientes no pueden verte ni reservar citas contigo."}
            </p>
          </div>
        </div>

        {selectedStaff && (
          <button
            type="button"
            onClick={() =>
              onToggleStaffActive(selectedStaff.id, !selectedStaff.isActive)
            }
            className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 ${
              selectedStaff.isActive
                ? "bg-white hover:bg-amber-100 text-amber-900 border border-amber-300"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            }`}
          >
            {selectedStaff.isActive ? (
              <>
                <span>🏖️</span>
                <span>Pausar Agenda Inmediata</span>
              </>
            ) : (
              <>
                <span>🟢</span>
                <span>Reanudar Agenda (Volver a recibir citas)</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Scheduled Future Vacations Card */}
      <div className="p-4 rounded-3xl border border-zinc-200 bg-white shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-lg flex-shrink-0">
              🏖️
            </div>
            <div>
              <h3 className="font-bold text-sm text-zinc-900">
                Periodos de Vacaciones Programadas a Futuro
              </h3>
              <p className="text-xs text-zinc-500">
                Planifica tus vacaciones con anticipación (ej. bloquear enero o
                febrero). Seguirás atendiendo normalmente hoy hasta que comience
                tu periodo de receso.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              onOpenVacationModal({
                open: true,
                staffId: selectedStaff?.id || selectedStaffId,
                startDate: "",
                endDate: "",
                reason: "",
              })
            }
            className="flex-shrink-0 px-4 py-2 rounded-full bg-[#1F1F23] hover:bg-black text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
          >
            <span>+ Programar Vacaciones</span>
          </button>
        </div>

        {myVacations.length === 0 ? (
          <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-500 text-center">
            No tienes periodos de vacaciones programados. Puedes planificarlos
            con semanas o meses de anticipación.
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            {myVacations.map((vac) => {
              const startD = new Date(vac.startAt);
              const endD = new Date(vac.endAt);
              const diffDays =
                Math.ceil(
                  (endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)
                ) || 1;
              const isCurrent = startD <= new Date() && endD >= new Date();
              const isPast = endD < new Date();

              return (
                <div
                  key={vac.id}
                  className={`p-3 rounded-2xl border flex items-center justify-between text-xs flex-wrap gap-2 ${
                    isCurrent
                      ? "bg-amber-50 border-amber-300 text-amber-950 font-medium"
                      : isPast
                      ? "bg-zinc-50 border-zinc-200 text-zinc-400"
                      : "bg-blue-50/70 border-blue-200 text-blue-950"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">🏖️</span>
                    <div>
                      <div className="font-bold flex items-center gap-2 flex-wrap">
                        <span>
                          {vac.reason || "Vacaciones programadas"} ({diffDays}{" "}
                          {diffDays === 1 ? "día" : "días"})
                        </span>
                        {isCurrent && (
                          <span className="px-2 py-0.2 rounded-full bg-amber-200 text-amber-900 text-[10px] font-extrabold uppercase">
                            En curso ahora
                          </span>
                        )}
                        {!isCurrent && !isPast && (
                          <span className="px-2 py-0.2 rounded-full bg-blue-200 text-blue-900 text-[10px] font-extrabold uppercase">
                            Programada a futuro
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] opacity-80 mt-0.5">
                        📅 Del{" "}
                        {startD.toLocaleDateString("es-ES", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}{" "}
                        al{" "}
                        {endD.toLocaleDateString("es-ES", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                    </div>
                  </div>

                  {!isPast && (
                    <button
                      type="button"
                      onClick={() => onDeleteTimeOff(vac.id)}
                      className="px-3 py-1.5 rounded-full bg-white hover:bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold transition-all shadow-2xs"
                    >
                      🔓 Cancelar y reabrir fechas
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isEditingShifts && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900 animate-in fade-in">
          <Sparkles className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Modo Edición Activado:</span> Puedes
            encender o apagar días, ajustar horas de inicio y fin, o agregar
            turnos partidos (mañana y tarde). Al terminar, pulsa{" "}
            <b>Guardar Cambios</b> para que los pacientes vean los nuevos cupos
            disponibles.
          </div>
        </div>
      )}

      <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs text-zinc-600 space-y-3">
        <div className="font-bold text-zinc-900 flex items-center gap-1.5">
          <Settings className="w-4 h-4 text-zinc-600" />
          <span>Reglas de Antelación y Ventana de Reserva</span>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-white border border-zinc-200">
            <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
              Ventana máxima de reserva
            </label>
            {!isEditingShifts ? (
              <div className="font-bold text-sm text-zinc-900">
                {selectedStaff?.customHorizonDays ??
                  settings?.bookingHorizonDays ??
                  7}{" "}
                días de anticipación
              </div>
            ) : (
              <select
                value={editingHorizonDays}
                onChange={(e) => setEditingHorizonDays(Number(e.target.value))}
                className="w-full text-base sm:text-xs font-semibold bg-zinc-50 border border-zinc-300 rounded-lg p-2 focus:outline-none"
              >
                <option value={3}>3 días hacia adelante</option>
                <option value={7}>7 días (1 semana - Recomendado)</option>
                <option value={14}>14 días (2 semanas)</option>
                <option value={21}>21 días (3 semanas)</option>
                <option value={30}>30 días (1 mes)</option>
                <option value={60}>60 días (2 meses)</option>
              </select>
            )}
            <span className="text-[10px] text-zinc-400 block mt-1">
              Los pacientes solo podrán agendar dentro de esta ventana de
              tiempo.
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white border border-zinc-200">
            <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
              Margen mínimo de aviso previo
            </label>
            {!isEditingShifts ? (
              <div className="font-bold text-sm text-zinc-900">
                {(selectedStaff?.customLeadTimeMin ??
                  settings?.minLeadTimeMinutes ??
                  30) === 0
                  ? "Sin anticipación (En cualquier momento / Inmediato)"
                  : `${
                      selectedStaff?.customLeadTimeMin ??
                      settings?.minLeadTimeMinutes ??
                      30
                    } minutos antes`}
              </div>
            ) : (
              <select
                value={editingLeadTimeMin}
                onChange={(e) => setEditingLeadTimeMin(Number(e.target.value))}
                className="w-full text-base sm:text-xs font-semibold bg-zinc-50 border border-zinc-300 rounded-lg p-2 focus:outline-none"
              >
                <option value={0}>
                  Sin anticipación (En cualquier momento / Inmediato - 0 min)
                </option>
                <option value={15}>15 minutos antes (Urgencias / Rápido)</option>
                <option value={30}>30 minutos antes (Estándar)</option>
                <option value={60}>60 minutos antes (1 hora)</option>
                <option value={120}>120 minutos antes (2 horas)</option>
                <option value={240}>240 minutos antes (4 horas)</option>
                <option value={1440}>24 horas de antelación</option>
              </select>
            )}
            <span className="text-[10px] text-zinc-400 block mt-1">
              Tiempo mínimo de margen antes de una cita para que un cliente
              pueda agendar. Si eliges &quot;Sin anticipación&quot;, los
              pacientes pueden agendar en cualquier momento para el mismo día de
              inmediato.
            </span>
          </div>
        </div>
      </div>

      {isEditingShifts && !shiftsValidation.isValid && (
        <div className="p-3.5 bg-red-50 border border-red-300 rounded-2xl flex items-start gap-2.5 text-xs text-red-900 shadow-2xs">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-red-800">
              ⚠️ Criterios de Aceptación: Se detectaron{" "}
              {shiftsValidation.errors.length} error(es) en los horarios:
            </span>
            <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px] text-red-700">
              {shiftsValidation.errors.map((err, i) => (
                <li key={i}>{err.message}</li>
              ))}
            </ul>
            <span className="text-[10px] text-red-600 font-semibold block mt-1.5">
              Debes corregir los horarios en rojo antes de poder guardar los
              cambios.
            </span>
          </div>
        </div>
      )}

      {isEditingShifts && (
        <div className="p-3 bg-zinc-100 rounded-2xl border border-zinc-200/80 space-y-2">
          <span className="text-[11px] font-bold text-zinc-600 block uppercase tracking-wider">
            ⚡ Plantillas y Acciones Rápidas
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onApplyPreset("continua")}
              className="px-3 py-1.5 rounded-full bg-white hover:bg-zinc-200 text-zinc-800 text-[11px] font-semibold border border-zinc-300 shadow-2xs transition-all"
            >
              Jornada Continua (09:00 - 18:00 Lun-Vie)
            </button>
            <button
              type="button"
              onClick={() => onApplyPreset("partido")}
              className="px-3 py-1.5 rounded-full bg-white hover:bg-zinc-200 text-zinc-800 text-[11px] font-semibold border border-zinc-300 shadow-2xs transition-all"
            >
              Turno Partido (09:00-13:00 y 15:00-19:00)
            </button>
            <button
              type="button"
              onClick={onCopyMondayToWeek}
              className="px-3 py-1.5 rounded-full bg-white hover:bg-zinc-200 text-zinc-800 text-[11px] font-semibold border border-zinc-300 shadow-2xs transition-all"
              title="Copia los turnos configurados en el Lunes al resto de días laborables (Mar, Mié, Jue, Vie)"
            >
              Copiar Lunes a toda la semana
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        {WEEK_DAYS.map((d) => {
          if (!isEditingShifts) {
            const dayShifts = (selectedStaff?.workingShifts || [])
              .filter((s) => s.dayOfWeek === d.day)
              .sort((a, b) => a.startTime.localeCompare(b.startTime));
            const isWorking = dayShifts.length > 0;

            return (
              <div
                key={d.day}
                className="p-3.5 rounded-2xl bg-white border border-zinc-200 flex items-center justify-between text-xs transition-all hover:border-zinc-300"
              >
                <div className="space-y-1">
                  <span className="font-bold text-zinc-900 text-sm">
                    {d.name}
                  </span>
                  <div>
                    {isWorking ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {dayShifts.map((s, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-800 font-semibold text-[11px] border border-zinc-200/80"
                          >
                            {s.startTime} - {s.endTime}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-zinc-400 italic text-[11px]">
                        Cerrado (Sin atención a pacientes)
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  {isWorking ? (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Atiende ✓
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-400">
                      Cerrado
                    </span>
                  )}
                </div>
              </div>
            );
          }

          const dayShifts = editingShiftsList.filter(
            (s) => s.dayOfWeek === d.day
          );
          const isWorking = dayShifts.length > 0;
          const dayErrors = shiftsValidation.dayErrors[d.day] || [];
          const hasDayErrors = dayErrors.length > 0;

          return (
            <div
              key={d.day}
              id={`shift-day-${d.day}`}
              className={`p-3.5 rounded-2xl border transition-all ${
                highlightedShiftDay === d.day ? "ring-2 ring-amber-400 " : ""
              }${
                hasDayErrors
                  ? "bg-red-50/30 border-red-400 shadow-xs"
                  : isWorking
                  ? "bg-white border-zinc-300 shadow-2xs"
                  : "bg-zinc-50/70 border-zinc-200 opacity-80"
              }`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-zinc-900 text-sm">
                    {d.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleDay(d.day)}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition-all ${
                      isWorking
                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300"
                    }`}
                  >
                    {isWorking ? "✓ Atiende este día" : "○ Cerrado"}
                  </button>

                  {hasDayErrors && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-red-600" />
                      Requiere corrección
                    </span>
                  )}
                </div>

                {isWorking && (
                  <button
                    type="button"
                    disabled={dayShifts.length >= 3}
                    onClick={() => onAddShiftToDay(d.day)}
                    className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                      dayShifts.length >= 3
                        ? "text-zinc-300 cursor-not-allowed"
                        : "text-zinc-700 hover:text-black hover:underline"
                    }`}
                    title={
                      dayShifts.length >= 3
                        ? "Máximo 3 turnos por día permitidos"
                        : "Agregar turno adicional (partido)"
                    }
                  >
                    <Plus className="w-3 h-3" />
                    <span>
                      {dayShifts.length >= 3
                        ? "Límite 3 turnos"
                        : "Agregar turno (partido)"}
                    </span>
                  </button>
                )}
              </div>

              {isWorking ? (
                <div className="space-y-2 mt-2">
                  {dayShifts.map((shift, idx) => {
                    const sMin = timeToMinutes(shift.startTime);
                    const eMin = timeToMinutes(shift.endTime);
                    const isInverted = sMin !== -1 && eMin !== -1 && sMin >= eMin;
                    const isTooShort =
                      sMin !== -1 &&
                      eMin !== -1 &&
                      !isInverted &&
                      eMin - sMin < 30;
                    const isCorruptFormat = sMin === -1 || eMin === -1;

                    const hasOverlap = dayShifts.some((other) => {
                      if (other.tempId === shift.tempId) return false;
                      const oStart = timeToMinutes(other.startTime);
                      const oEnd = timeToMinutes(other.endTime);
                      if (oStart === -1 || oEnd === -1 || oStart >= oEnd)
                        return false;
                      if (sMin === -1 || eMin === -1 || isInverted) return false;
                      return sMin < oEnd && eMin > oStart;
                    });

                    const hasShiftError =
                      isInverted || isTooShort || isCorruptFormat || hasOverlap;

                    return (
                      <div
                        key={shift.tempId || idx}
                        className={`p-2.5 rounded-xl border text-xs transition-all ${
                          hasShiftError
                            ? "bg-red-50/70 border-red-400"
                            : "bg-[#F4F4F6] border-zinc-200"
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-semibold text-zinc-500 w-14">
                            Turno {idx + 1}:
                          </span>

                          <div className="flex items-center gap-1.5">
                            <label className="text-[10px] text-zinc-400">
                              De
                            </label>
                            <input
                              type="time"
                              required
                              value={shift.startTime}
                              onChange={(e) =>
                                onUpdateShiftTime(
                                  shift.tempId,
                                  "startTime",
                                  e.target.value
                                )
                              }
                              className={`rounded-lg px-2 py-1 font-bold text-base sm:text-xs focus:outline-none transition-all ${
                                hasShiftError
                                  ? "bg-white border-2 border-red-500 text-red-900"
                                  : "bg-white border border-zinc-300 text-zinc-800"
                              }`}
                            />
                          </div>

                          <div className="flex items-center gap-1.5">
                            <label className="text-[10px] text-zinc-400">a</label>
                            <input
                              type="time"
                              required
                              value={shift.endTime}
                              onChange={(e) =>
                                onUpdateShiftTime(
                                  shift.tempId,
                                  "endTime",
                                  e.target.value
                                )
                              }
                              className={`rounded-lg px-2 py-1 font-bold text-base sm:text-xs focus:outline-none transition-all ${
                                hasShiftError
                                  ? "bg-white border-2 border-red-500 text-red-900"
                                  : "bg-white border border-zinc-300 text-zinc-800"
                              }`}
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => onRemoveSpecificShift(shift.tempId)}
                            className="ml-auto p-1 text-zinc-400 hover:text-red-600 transition-all"
                            title="Eliminar este tramo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {isInverted && (
                          <div className="mt-1.5 p-1.5 bg-red-100 text-red-900 text-[10px] font-bold rounded-md flex items-center gap-1.5 border border-red-200">
                            <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            <span>
                              Horario imposible: La hora de inicio (
                              {shift.startTime}) no puede ser igual o posterior
                              a la hora de fin ({shift.endTime}).
                            </span>
                          </div>
                        )}

                        {isTooShort && (
                          <div className="mt-1.5 p-1.5 bg-amber-100 text-amber-900 text-[10px] font-bold rounded-md flex items-center gap-1.5 border border-amber-200">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>
                              Duración insuficiente: El turno dura solo{" "}
                              {eMin - sMin} min. La duración mínima es de 30
                              minutos.
                            </span>
                          </div>
                        )}

                        {hasOverlap && (
                          <div className="mt-1.5 p-1.5 bg-red-100 text-red-900 text-[10px] font-bold rounded-md flex items-center gap-1.5 border border-red-200">
                            <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            <span>
                              Solapamiento: Este turno choca con otro turno del
                              mismo día. Separa o une los turnos.
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-zinc-400 italic">
                  Día de descanso o cerrado. Pulsa el botón de arriba si deseas
                  habilitar atención este día.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isEditingShifts && (
        <div className="pt-3 flex items-center justify-between sticky bottom-4 z-20 bg-white/95 backdrop-blur-xs p-3 rounded-2xl border border-zinc-200 shadow-lg">
          <div>
            {!shiftsValidation.isValid ? (
              <span className="text-[11px] font-bold text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>
                  {shiftsValidation.errors.length} error(es) en horarios. No es
                  posible guardar.
                </span>
              </span>
            ) : (
              <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Horarios validados según criterios de aceptación.</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditingShifts(false)}
              className="px-4 py-2.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold transition-all"
            >
              Descartar Cambios
            </button>
            <button
              type="button"
              disabled={!shiftsValidation.isValid || savingShifts}
              onClick={onSaveShifts}
              className="px-6 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-600"
              title={
                !shiftsValidation.isValid
                  ? "Corrige los errores señalados en rojo antes de guardar"
                  : "Guardar horarios semanales"
              }
            >
              <Save className="w-4 h-4" />
              <span>
                {savingShifts
                  ? "Guardando en agenda..."
                  : "Guardar Horarios Semanales"}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
