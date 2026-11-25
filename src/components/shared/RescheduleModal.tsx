"use client";

import React, { useEffect, useId, useState } from "react";
import { CalendarClock, AlertTriangle } from "lucide-react";
import { AccessibleModal } from "@/components/ui/AccessibleModal";
import { Button } from "@/components/ui/Button";
import { MAX_CUSTOMER_RESCHEDULES } from "@/lib/booking-rules";
import { formatLocalDateYYYYMMDD } from "@/lib/date-utils";
import {
  addDaysYYYYMMDD,
  formatSpanishDateInTz,
  formatSpanishTimeInTz,
  resolveBusinessTimeZone,
} from "@/lib/timezone";
import type {
  PortalAppointment,
  PortalBusinessSettings,
  PortalStaffMember,
} from "@/types/portal";

interface RescheduleModalProps {
  appointment: PortalAppointment | null;
  mode: "customer" | "staff";
  isOwnerAdmin?: boolean;
  staffList?: PortalStaffMember[];
  settings?: PortalBusinessSettings | null;
  onClose: () => void;
  onRescheduled: () => void;
  showToast?: (
    type: "success" | "error" | "warning" | "info",
    title: string,
    message?: string
  ) => void;
}

export function RescheduleModal({
  appointment,
  mode,
  isOwnerAdmin = false,
  staffList = [],
  settings,
  onClose,
  onRescheduled,
  showToast,
}: RescheduleModalProps) {
  const titleId = useId();
  const dateInputId = useId();
  const staffSelectId = useId();
  const timeInputId = useId();
  const reasonInputId = useId();
  const overbookingId = useId();

  const businessTz = resolveBusinessTimeZone(settings?.timezone);
  const initialDate = appointment
    ? formatLocalDateYYYYMMDD(new Date(appointment.startAt), businessTz)
    : formatLocalDateYYYYMMDD(new Date(), businessTz);
  const initialTime = appointment
    ? formatSpanishTimeInTz(new Date(appointment.startAt), businessTz)
    : "";

  const [newDate, setNewDate] = useState(initialDate);
  const [newTime, setNewTime] = useState(initialTime);
  const [newStaffId, setNewStaffId] = useState(appointment?.staffId || "");
  const [reason, setReason] = useState("");
  const [allowOverbooking, setAllowOverbooking] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!appointment) return;
    const timer = setTimeout(() => {
      setNewDate(formatLocalDateYYYYMMDD(new Date(appointment.startAt), businessTz));
      setNewTime(formatSpanishTimeInTz(new Date(appointment.startAt), businessTz));
      setNewStaffId(appointment.staffId || "");
      setReason("");
      setAllowOverbooking(false);
      setErrorMsg(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [appointment, businessTz]);

  const serviceId = appointment?.serviceId || appointment?.service?.id || "";
  const effectiveStaffId = newStaffId || appointment?.staffId || "ANY";

  useEffect(() => {
    if (!appointment || !serviceId || !newDate) return;
    const controller = new AbortController();
    const timer = setTimeout(() => setLoadingSlots(true), 0);
    fetch(
      `/api/availability?serviceId=${encodeURIComponent(serviceId)}&staffId=${encodeURIComponent(effectiveStaffId)}&date=${encodeURIComponent(newDate)}&_t=${Date.now()}`,
      { cache: "no-store", signal: controller.signal }
    )
      .then((res) => (res.ok ? res.json() : { slots: [] }))
      .then((data) => {
        if (controller.signal.aborted) return;
        const nextSlots = (data?.slots || []) as string[];
        setAvailableSlots(nextSlots);
        if (mode === "customer" && !nextSlots.includes(newTime)) {
          setNewTime("");
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSlots(false);
      });
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Refresh live slots when date/staff/appointment changes
  }, [appointment?.id, serviceId, effectiveStaffId, newDate, mode]);

  if (!appointment) return null;

  const todayStr = formatLocalDateYYYYMMDD(new Date(), businessTz);
  const maxDateStr = addDaysYYYYMMDD(
    todayStr,
    settings?.bookingHorizonDays ?? 30
  );
  const remaining =
    appointment.remainingReschedules ??
    Math.max(
      0,
      MAX_CUSTOMER_RESCHEDULES - (appointment.customerRescheduleCount ?? 0)
    );

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate || !newTime) {
      setErrorMsg("Selecciona una fecha y hora válidas.");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/appointments/${appointment.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newDate,
          newTime,
          newStaffId: effectiveStaffId || undefined,
          reason: mode === "staff" ? reason.trim() || undefined : undefined,
          allowOverbooking: mode === "staff" ? allowOverbooking : false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || "No se pudo reprogramar la cita.");
        return;
      }
      showToast?.(
        "success",
        "Cita reprogramada",
        `Nuevo horario confirmado: ${newDate} a las ${newTime}.`
      );
      onRescheduled();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Error de conexión con el servidor."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AccessibleModal
      isOpen={Boolean(appointment)}
      onClose={onClose}
      labelledBy={titleId}
      maxWidthClass="max-w-md"
      className="rounded-[32px] p-5 sm:p-6"
    >
      <div className="flex items-start gap-2.5">
        <div className="w-10 h-10 rounded-2xl bg-[var(--brand-primary,#1F1F23)] text-[var(--brand-primary-fg,#FFFFFF)] flex items-center justify-center shrink-0">
          <CalendarClock className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 id={titleId} className="text-base font-bold text-zinc-900">
            Reprogramar Cita
          </h3>
          <p className="text-xs text-zinc-600 leading-snug">
            {appointment.service?.name} • Actual:{" "}
            <b>
              {formatSpanishDateInTz(new Date(appointment.startAt), businessTz)}{" "}
              {formatSpanishTimeInTz(new Date(appointment.startAt), businessTz)}
            </b>
          </p>
        </div>
      </div>

      {mode === "customer" && (
        <div className="mt-3 p-2.5 rounded-2xl bg-sky-50 border border-sky-200 text-[11px] text-sky-950 font-medium">
          Te quedan <b>{remaining}</b> de {MAX_CUSTOMER_RESCHEDULES} reprogramación(es) en línea permitidas para esta cita.
        </div>
      )}

      <form onSubmit={handleConfirm} className="mt-4 space-y-3 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label
              htmlFor={dateInputId}
              className="text-[10px] font-bold text-zinc-600 uppercase block mb-1"
            >
              Nueva fecha
            </label>
            <input
              id={dateInputId}
              type="date"
              required
              min={todayStr}
              max={mode === "customer" ? maxDateStr : undefined}
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
            />
          </div>

          {((mode === "staff" && isOwnerAdmin) || mode === "customer") &&
            staffList.length > 1 && (
              <div>
                <label
                  htmlFor={staffSelectId}
                  className="text-[10px] font-bold text-zinc-600 uppercase block mb-1"
                >
                  Profesional
                </label>
                <select
                  id={staffSelectId}
                  value={effectiveStaffId}
                  onChange={(e) => setNewStaffId(e.target.value)}
                  className="w-full p-2.5 rounded-2xl border border-zinc-300 bg-white font-semibold text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
                >
                  {mode === "customer" && (
                    <option value="ANY">Cualquier profesional disponible</option>
                  )}
                  {staffList.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.displayName}
                    </option>
                  ))}
                </select>
              </div>
            )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-zinc-600 uppercase">
              Horarios disponibles en esa fecha
            </span>
            <span className="text-[10px] text-zinc-500 font-semibold">
              {loadingSlots
                ? "Consultando..."
                : `${availableSlots.length} libre(s)`}
            </span>
          </div>

          {availableSlots.length > 0 ? (
            <div className="grid grid-cols-4 gap-1.5 max-h-36 overflow-y-auto p-1">
              {availableSlots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  aria-pressed={newTime === slot}
                  onClick={() => setNewTime(slot)}
                  className={`min-h-[40px] py-1.5 rounded-xl font-bold text-xs transition-all ${
                    newTime === slot
                      ? "bg-[var(--brand-primary,#1F1F23)] text-[var(--brand-primary-fg,#FFFFFF)] shadow-sm"
                      : "bg-zinc-100 hover:bg-zinc-200 text-zinc-800"
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-600 text-center">
              {loadingSlots
                ? "Buscando horarios..."
                : "No hay cupos regulares libres en esta fecha."}
            </div>
          )}
        </div>

        {mode === "staff" && (
          <>
            <div>
              <label
                htmlFor={timeInputId}
                className="text-[10px] font-bold text-zinc-600 uppercase block mb-1"
              >
                Hora exacta (Editable para personal)
              </label>
              <input
                id={timeInputId}
                type="time"
                required
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
              />
            </div>

            <div>
              <label
                htmlFor={reasonInputId}
                className="text-[10px] font-bold text-zinc-600 uppercase block mb-1"
              >
                Motivo del cambio (Visible para el cliente)
              </label>
              <input
                id={reasonInputId}
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej. Ajuste de agenda o solicitud telefónica"
                className="w-full p-2.5 rounded-2xl border border-zinc-300 text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
              />
            </div>

            <label
              htmlFor={overbookingId}
              className="flex items-start gap-2 p-2.5 rounded-2xl bg-amber-50 border border-amber-200 cursor-pointer"
            >
              <input
                id={overbookingId}
                type="checkbox"
                checked={allowOverbooking}
                onChange={(e) => setAllowOverbooking(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-amber-600"
              />
              <span className="text-[11px] text-amber-950 font-medium inline-flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                Permitir sobrecupo aunque coincida con otro turno
              </span>
            </label>
          </>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold"
          >
            {errorMsg}
          </div>
        )}

        <div className="pt-2 flex gap-2">
          <Button
            type="submit"
            variant="primary"
            size="pill"
            disabled={submitting || !newTime}
            className="flex-1 min-h-[44px]"
          >
            {submitting ? "Guardando..." : "Confirmar Nuevo Horario"}
          </Button>
          <Button
            variant="secondary"
            size="pill"
            onClick={onClose}
            className="min-h-[44px] px-4"
          >
            Cancelar
          </Button>
        </div>
      </form>
    </AccessibleModal>
  );
}
