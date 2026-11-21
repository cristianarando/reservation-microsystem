"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Check, MapPin, Phone, ShieldAlert } from "lucide-react";
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
  onLogout,
  onBackToSlots,
  onConfirmBooking,
}: BookingStepConfirmProps) {
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
                  {currentUser?.googleId ? "Google Verificado ✓" : "Verificado"}
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

              <a
                href="/api/auth/google?returnTo=/"
                className="w-full min-h-[42px] py-2.5 px-3 rounded-xl bg-white hover:bg-zinc-100 text-zinc-800 text-xs font-bold border border-zinc-300 shadow-2xs flex items-center justify-center gap-2 transition-all"
              >
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Identificarme con Google (1 Clic)</span>
              </a>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-zinc-200" />
                <span className="text-[10px] text-zinc-400 font-semibold uppercase">
                  O completa tus datos
                </span>
                <div className="flex-1 h-px bg-zinc-200" />
              </div>

              <div className="border border-zinc-300 bg-white rounded-xl px-3.5 py-2.5">
                <label className="text-[11px] text-zinc-500 block font-medium">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  className="bg-transparent font-semibold text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full mt-0.5"
                />
              </div>

              <div className="border border-zinc-300 bg-white rounded-xl px-3.5 py-2.5">
                <label className="text-[11px] text-zinc-500 block font-medium">
                  Correo Electrónico *
                </label>
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="tucorreo@ejemplo.com"
                  className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full mt-0.5"
                />
              </div>

              <div className="border border-zinc-300 bg-white rounded-xl px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] text-zinc-500 block font-medium">
                    Contraseña *
                  </label>
                  <span className="text-[10px] text-zinc-400">
                    Mín. 6 caracteres
                  </span>
                </div>
                <input
                  type="password"
                  value={guestPassword}
                  onChange={(e) => setGuestPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full mt-0.5"
                />
                <span className="text-[10px] text-zinc-400 block mt-0.5">
                  Protege tu reserva para que nadie más acceda a tus citas.
                </span>
              </div>
            </div>
          )}

          <div className="border-[1.5px] border-[#1F1F23] bg-[#F4F4F6] rounded-2xl px-4 py-2.5 flex items-center gap-3">
            <Phone className="w-4 h-4 text-zinc-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <label className="text-xs text-zinc-500 block font-medium">
                Teléfono / WhatsApp (Obligatorio)
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+52 55 1234 5678"
                className="bg-transparent font-semibold text-base sm:text-sm text-[#1F1F23] focus:outline-none w-full"
              />
            </div>
          </div>

          <div className="border-[1.5px] border-zinc-300 bg-[#F4F4F6] rounded-2xl px-4 py-2.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-zinc-500 block font-medium">
                  Nota o comentario (Opcional)
                </label>
                <span className="text-[10px] text-zinc-400">
                  {customerNotes.length}/200
                </span>
              </div>
              <input
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
            <div className="p-3.5 rounded-2xl bg-red-50 text-red-700 text-xs font-semibold border border-red-200 space-y-2">
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
            <button
              onClick={onConfirmBooking}
              disabled={bookingLoading}
              className="w-full rounded-full bg-[#1F1F23] hover:bg-black text-white h-14 font-semibold text-sm shadow-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <span>
                {bookingLoading ? "Confirmando Cita..." : "Confirmar Cita Ahora"}
              </span>
              <Check className="w-4 h-4" />
            </button>
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
