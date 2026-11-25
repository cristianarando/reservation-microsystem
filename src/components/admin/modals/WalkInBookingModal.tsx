"use client";

import React, { useEffect, useId, useState } from "react";
import { AlertTriangle, CalendarPlus } from "lucide-react";
import { AccessibleModal } from "@/components/ui/AccessibleModal";
import { Button } from "@/components/ui/Button";
import { formatLocalDateYYYYMMDD } from "@/lib/date-utils";
import { resolveBusinessTimeZone } from "@/lib/timezone";
import type {
  PortalBusinessSettings,
  PortalService,
  PortalStaffMember,
} from "@/types/portal";

interface WalkInBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDateStr: string;
  defaultStaffId: string;
  isOwnerAdmin: boolean;
  staffList: PortalStaffMember[];
  services: PortalService[];
  settings?: PortalBusinessSettings | null;
  onCreated: () => void;
  showToast: (
    type: "success" | "error" | "warning" | "info",
    title: string,
    message?: string
  ) => void;
}

export function WalkInBookingModal({
  isOpen,
  onClose,
  defaultDateStr,
  defaultStaffId,
  isOwnerAdmin,
  staffList,
  services,
  settings,
  onCreated,
  showToast,
}: WalkInBookingModalProps) {
  const titleId = useId();
  const staffSelectId = useId();
  const serviceSelectId = useId();
  const dateInputId = useId();
  const timeInputId = useId();
  const nameInputId = useId();
  const phoneInputId = useId();
  const emailInputId = useId();
  const notesInputId = useId();
  const overbookingId = useId();

  const activeServices = services.filter((s) => s.isActive !== false);
  const resolvedStaffDefault =
    defaultStaffId && defaultStaffId !== "ALL"
      ? defaultStaffId
      : staffList[0]?.id || "";

  const [staffId, setStaffId] = useState(resolvedStaffDefault);
  const [serviceId, setServiceId] = useState(activeServices[0]?.id || "");
  const [dateStr, setDateStr] = useState(defaultDateStr);
  const [timeStr, setTimeStr] = useState("10:00");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [allowOverbooking, setAllowOverbooking] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setStaffId(
        defaultStaffId && defaultStaffId !== "ALL"
          ? defaultStaffId
          : staffList[0]?.id || ""
      );
      setServiceId((prev) =>
        activeServices.some((s) => s.id === prev)
          ? prev
          : activeServices[0]?.id || ""
      );
      setDateStr(
        defaultDateStr ||
          formatLocalDateYYYYMMDD(
            new Date(),
            resolveBusinessTimeZone(settings?.timezone)
          )
      );
      setErrorMsg(null);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Reset defaults when opening modal
  }, [isOpen, defaultDateStr, defaultStaffId]);

  useEffect(() => {
    if (!isOpen || !serviceId || !staffId || !dateStr) return;
    const controller = new AbortController();
    fetch(
      `/api/availability?serviceId=${encodeURIComponent(serviceId)}&staffId=${encodeURIComponent(staffId)}&date=${encodeURIComponent(dateStr)}&_t=${Date.now()}`,
      { cache: "no-store", signal: controller.signal }
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (controller.signal.aborted || !data?.slots) return;
        setAvailableSlots(data.slots as string[]);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [isOpen, serviceId, staffId, dateStr]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId,
          serviceId,
          date: dateStr,
          time: timeStr,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim() || undefined,
          customerNotes: customerNotes.trim() || undefined,
          allowOverbooking,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || "No se pudo registrar la cita.");
        return;
      }
      showToast(
        "success",
        allowOverbooking ? "Sobrecupo agendado" : "Cita registrada",
        `${customerName.trim()} quedó agendado el ${dateStr} a las ${timeStr}.`
      );
      setCustomerName("");
      setCustomerPhone("");
      setCustomerEmail("");
      setCustomerNotes("");
      setAllowOverbooking(false);
      onCreated();
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
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      maxWidthClass="max-w-md"
      className="rounded-[32px] p-5 sm:p-6"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-2xl bg-[var(--brand-primary,#1F1F23)] text-[var(--brand-primary-fg,#FFFFFF)] flex items-center justify-center shrink-0">
          <CalendarPlus className="w-5 h-5" />
        </div>
        <div>
          <h3 id={titleId} className="text-base font-bold text-zinc-900">
            Nueva Cita Presencial / Telefónica
          </h3>
          <p className="text-xs text-zinc-600">
            Registra un paciente directo o habilita sobrecupo en tu agenda.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-xs">
        {isOwnerAdmin && (
          <div>
            <label
              htmlFor={staffSelectId}
              className="text-[10px] font-bold text-zinc-600 uppercase block mb-1"
            >
              Profesional
            </label>
            <select
              id={staffSelectId}
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="w-full p-2.5 rounded-2xl border border-zinc-300 bg-white font-semibold text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
            >
              {staffList.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.displayName} ({st.specialtyTitle || "Especialista"})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label
            htmlFor={serviceSelectId}
            className="text-[10px] font-bold text-zinc-600 uppercase block mb-1"
          >
            Servicio
          </label>
          <select
            id={serviceSelectId}
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="w-full p-2.5 rounded-2xl border border-zinc-300 bg-white font-semibold text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
          >
            {activeServices.map((svc) => (
              <option key={svc.id} value={svc.id}>
                {svc.name} ({svc.durationMin} min · {settings?.currencySymbol || "Bs"}
                {svc.price})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label
              htmlFor={dateInputId}
              className="text-[10px] font-bold text-zinc-600 uppercase block mb-1"
            >
              Fecha
            </label>
            <input
              id={dateInputId}
              type="date"
              required
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
            />
          </div>
          <div>
            <label
              htmlFor={timeInputId}
              className="text-[10px] font-bold text-zinc-600 uppercase block mb-1"
            >
              Hora
            </label>
            <input
              id={timeInputId}
              type="time"
              required
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
            />
          </div>
        </div>

        {availableSlots.length > 0 && (
          <div>
            <span className="text-[10px] font-bold text-zinc-600 uppercase block mb-1">
              Sugerencias libres del día:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap max-h-20 overflow-y-auto">
              {availableSlots.slice(0, 10).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setTimeStr(slot)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                    timeStr === slot
                      ? "bg-[var(--brand-primary,#1F1F23)] text-[var(--brand-primary-fg,#FFFFFF)] border-transparent"
                      : "bg-zinc-100 text-zinc-800 border-zinc-300 hover:bg-zinc-200"
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label
              htmlFor={nameInputId}
              className="text-[10px] font-bold text-zinc-600 uppercase block mb-1"
            >
              Nombre completo *
            </label>
            <input
              id={nameInputId}
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Ej. María Mendoza"
              className="w-full p-2.5 rounded-2xl border border-zinc-300 font-medium text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
            />
          </div>
          <div>
            <label
              htmlFor={phoneInputId}
              className="text-[10px] font-bold text-zinc-600 uppercase block mb-1"
            >
              Teléfono / WhatsApp *
            </label>
            <input
              id={phoneInputId}
              type="tel"
              required
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+591 70000000"
              className="w-full p-2.5 rounded-2xl border border-zinc-300 font-medium text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label
              htmlFor={emailInputId}
              className="text-[10px] font-bold text-zinc-600 uppercase block mb-1"
            >
              Correo (Opcional)
            </label>
            <input
              id={emailInputId}
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="cliente@correo.com"
              className="w-full p-2.5 rounded-2xl border border-zinc-300 text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
            />
          </div>
          <div>
            <label
              htmlFor={notesInputId}
              className="text-[10px] font-bold text-zinc-600 uppercase block mb-1"
            >
              Nota / Motivo (Opcional)
            </label>
            <input
              id={notesInputId}
              type="text"
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              placeholder="Ej. Paciente presencial"
              className="w-full p-2.5 rounded-2xl border border-zinc-300 text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
            />
          </div>
        </div>

        <label
          htmlFor={overbookingId}
          className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50 border border-amber-200 cursor-pointer"
        >
          <input
            id={overbookingId}
            type="checkbox"
            checked={allowOverbooking}
            onChange={(e) => setAllowOverbooking(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-amber-600"
          />
          <div className="text-[11px] text-amber-950 leading-snug">
            <span className="font-bold inline-flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              Permitir sobrecupo / fuera de horario habitual
            </span>
            <p className="text-amber-900/90 mt-0.5">
              Úsalo solo cuando autorizas atender en horario ya ocupado o fuera del turno normal.
            </p>
          </div>
        </label>

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
            disabled={submitting}
            className="flex-1 min-h-[44px]"
          >
            {submitting ? "Registrando..." : "Confirmar Cita"}
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
