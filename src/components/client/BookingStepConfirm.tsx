"use client";

import React, { useId } from "react";
import Link from "next/link";
import { ArrowLeft, Check, MapPin, Phone, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GoogleAuthButton } from "@/components/ui/GoogleAuthButton";
import type {
  PortalBusinessSettings,
  PortalService,
  PortalStaffMember,
  PortalUser,
} from "@/types/portal";

interface BookingStepConfirmProps {
  settings?: PortalBusinessSettings | null;
  currentUser?: PortalUser | null;
  selectedService: PortalService | null;
  selectedStaffId: string;
  selectedStaffObj?: PortalStaffMember;
  selectedDateStr: string;
  selectedTime: string;
  isHealthBusiness: boolean;
  guestName: string;
  setGuestName: (val: string) => void;
  guestEmail: string;
  setGuestEmail: (val: string) => void;
  guestPassword: string;
  setGuestPassword: (val: string) => void;
  customerPhone: string;
  setCustomerPhone: (val: string) => void;
  customerNotes: string;
  setCustomerNotes: (val: string) => void;
  bookingError: string | null;
  bookingLoading: boolean;
  onOpenMapModal: () => void;
  onOpenAuthModal: () => void;
  onBeforeGoogleAuth?: () => void;
  onLogout: () => void;
  onBackToSlots: () => void;
  onConfirmBooking: () => void;
}

export function BookingStepConfirm({
  settings,
  currentUser,
  selectedService,
  selectedStaffId,
  selectedStaffObj,
  selectedDateStr,
  selectedTime,
  isHealthBusiness,
  guestName,
  setGuestName,
  guestEmail,
  setGuestEmail,
  guestPassword,
  setGuestPassword,
  customerPhone,
  setCustomerPhone,
  customerNotes,
  setCustomerNotes,
  bookingError,
  bookingLoading,
  onOpenMapModal,
  onOpenAuthModal,
  onBeforeGoogleAuth,
  onLogout,
  onBackToSlots,
  onConfirmBooking,
}: BookingStepConfirmProps) {
  const guestNameId = useId();
  const guestEmailId = useId();
  const guestPasswordId = useId();
  const phoneInputId = useId();
  const notesInputId = useId();

  return (
    <div className="flex-1 flex flex-col justify-between">
      <div className="grid grid-cols-1 md:grid-cols-12 md:gap-8 items-start">
        <div className="md:col-span-5 space-y-4">
          <div className="bg-[#27272A] text-white rounded-[28px] p-5 md:p-6 shadow-md">
            <div className="flex items-center justify-between text-xs text-zinc-300 font-medium">
              <span>Total del servicio</span>
              <span className="bg-white text-[#1F1F23] px-3 py-1 rounded-full text-xs font-bold">
                {selectedService?.durationMin} min
              </span>
            </div>
            <div className="mt-1 text-3xl md:text-4xl font-bold tracking-tight text-white">
              {settings?.currencySymbol || "$"}
              {selectedService?.price?.toFixed(2)}
            </div>

            <div className="mt-4 pt-3 border-t border-white/15 space-y-2 text-xs md:text-sm text-white">
              <div className="flex justify-between gap-3">
                <span className="text-zinc-300 shrink-0">Servicio:</span>
                <span className="font-bold text-right break-words">
                  {selectedService?.name}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-zinc-300 shrink-0">
                  {settings?.staffLabel || "Profesional"}:
                </span>
                <span className="font-bold text-right break-words">
                  {selectedStaffId === "ANY"
                    ? `Cualquier ${settings?.staffLabel || "Profesional"}`
                    : selectedStaffObj?.displayName}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-zinc-300 shrink-0">Fecha y Hora:</span>
                <span className="font-bold text-right whitespace-nowrap">
                  {selectedDateStr} • {selectedTime}
                </span>
              </div>
            </div>
          </div>

          <div className="p-3.5 sm:p-4 bg-zinc-100 rounded-2xl flex items-center justify-between gap-3 text-xs">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
              <MapPin className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5 sm:mt-0" />
              <div className="min-w-0">
                <div className="font-bold text-zinc-900 break-words">
                  {settings?.name || "Mi Negocio"}
                </div>
                <div className="text-[11px] text-zinc-500 break-words">
                  {settings?.addressText || "Dirección por configurar"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenMapModal}
              className="text-xs sm:text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 min-h-[36px] rounded-full border border-rose-200 transition-all flex-shrink-0 whitespace-nowrap"
            >
              Ver mapa
            </button>
          </div>
        </div>

        <div className="md:col-span-7 space-y-4 mt-4 md:mt-0">
          {currentUser ? (
            <div className="p-3.5 bg-zinc-100 rounded-2xl flex items-center justify-between flex-wrap gap-2.5 text-xs">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {currentUser?.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- External OAuth user avatar */
                  <img
                    src={currentUser.avatarUrl}
                    alt="Avatar"
                    className="w-8 h-8 rounded-full object-cover border border-zinc-300 shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#1F1F23] text-white flex items-center justify-center font-bold text-xs uppercase shrink-0">
                    {currentUser?.name?.charAt(0) || "U"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-zinc-900 truncate">
                    {currentUser.name}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    {currentUser.email}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                  Cuenta Verificada ✓
                </span>
                <button
                  type="button"
                  onClick={onLogout}
                  className="text-xs text-zinc-500 hover:text-black underline py-1 px-1"
                >
                  Salir
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 bg-zinc-50 border border-zinc-200 p-4 rounded-2xl">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold text-zinc-800">
                  Identificación del Paciente
                </span>
                <button
                  type="button"
                  onClick={onOpenAuthModal}
                  className="text-xs sm:text-[11px] font-semibold text-[#1F1F23] underline hover:text-zinc-600 py-1"
                >
                  ¿Tienes cuenta? Ingresa
                </button>
              </div>

              <GoogleAuthButton
                href="/api/auth/google?returnTo=/"
                label="Identificarme con Google (1 Clic)"
                onBeforeNavigate={onBeforeGoogleAuth}
                className="text-xs min-h-[44px]"
              />

              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-zinc-200" />
                <span className="text-[10px] text-zinc-500 font-semibold uppercase">
                  O completa tus datos
                </span>
                <div className="flex-1 h-px bg-zinc-200" />
              </div>

              <div className="border border-zinc-300 bg-white rounded-xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-zinc-900/20">
                <label
                  htmlFor={guestNameId}
                  className="text-[11px] text-zinc-600 block font-medium"
                >
                  Nombre Completo *
                </label>
                <input
                  id={guestNameId}
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  className="bg-transparent font-semibold text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full mt-0.5"
                />
              </div>

              <div className="border border-zinc-300 bg-white rounded-xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-zinc-900/20">
                <label
                  htmlFor={guestEmailId}
                  className="text-[11px] text-zinc-600 block font-medium"
                >
                  Correo Electrónico *
                </label>
                <input
                  id={guestEmailId}
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="tucorreo@ejemplo.com"
                  className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full mt-0.5"
                />
              </div>

              <div className="border border-zinc-300 bg-white rounded-xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-zinc-900/20">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor={guestPasswordId}
                    className="text-[11px] text-zinc-600 block font-medium"
                  >
                    Contraseña *
                  </label>
                  <span className="text-[10px] text-zinc-500">
                    Mín. 6 caracteres
                  </span>
                </div>
                <input
                  id={guestPasswordId}
                  type="password"
                  value={guestPassword}
                  onChange={(e) => setGuestPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full mt-0.5"
                />
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  Protege tu reserva para que nadie más acceda a tus citas.
                </span>
              </div>
            </div>
          )}

          <div className="border-[1.5px] border-[#1F1F23] bg-[#F4F4F6] rounded-2xl px-4 py-2.5 flex items-center gap-3 focus-within:ring-2 focus-within:ring-zinc-900/20">
            <Phone className="w-4 h-4 text-zinc-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <label
                htmlFor={phoneInputId}
                className="text-xs text-zinc-600 block font-medium"
              >
                Teléfono / WhatsApp (Obligatorio)
              </label>
              <input
                id={phoneInputId}
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+591 70000000"
                className="bg-transparent font-semibold text-base sm:text-sm text-[#1F1F23] focus:outline-none w-full"
              />
            </div>
          </div>

          <div className="border-[1.5px] border-zinc-300 bg-[#F4F4F6] rounded-2xl px-4 py-2.5 flex items-center gap-3 focus-within:ring-2 focus-within:ring-zinc-900/20">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={notesInputId}
                  className="text-xs text-zinc-600 block font-medium"
                >
                  Nota o comentario (Opcional)
                </label>
                <span className="text-[10px] text-zinc-500">
                  {customerNotes.length}/200
                </span>
              </div>
              <input
                id={notesInputId}
                type="text"
                maxLength={200}
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="Ej. Motivo de consulta o detalle especial"
                className="bg-transparent font-medium text-base sm:text-sm text-[#1F1F23] focus:outline-none w-full"
              />
            </div>
          </div>

          {bookingError && (
            <div
              role="alert"
              className="p-3.5 rounded-2xl bg-red-50 text-red-700 text-xs font-semibold border border-red-200 space-y-2"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 flex-shrink-0 text-red-600" />
                <span>{bookingError}</span>
              </div>
              {(bookingError.includes("no está disponible") ||
                bookingError.includes("margen") ||
                bookingError.includes("franja") ||
                bookingError.includes("ocupado")) && (
                <button
                  type="button"
                  onClick={onBackToSlots}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-100 hover:bg-red-200 text-red-900 text-[11px] font-bold transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Volver al Paso 3 y elegir un horario libre disponible</span>
                </button>
              )}
            </div>
          )}

          <div className="pt-2 space-y-2.5">
            <Button
              variant="primary"
              size="lg"
              onClick={onConfirmBooking}
              disabled={bookingLoading}
              className="w-full rounded-full h-14 text-sm shadow-xl"
            >
              <span>
                {bookingLoading ? "Confirmando Cita..." : "Confirmar Cita Ahora"}
              </span>
              <Check className="w-4 h-4" />
            </Button>
            <p className="text-[11px] text-zinc-500 text-center leading-relaxed px-2">
              Al confirmar aceptas los{" "}
              <Link
                href="/terminos"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-700 font-semibold underline hover:text-black"
              >
                Términos y Condiciones
              </Link>{" "}
              (cancelación gratuita hasta {settings?.minCancelNoticeHours ?? 6} h antes) y la{" "}
              <Link
                href="/privacidad"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-700 font-semibold underline hover:text-black"
              >
                Política de Privacidad
              </Link>
              .{" "}
              {isHealthBusiness
                ? "Portal no apto para emergencias médicas."
                : "Sujeto a disponibilidad de agenda."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
