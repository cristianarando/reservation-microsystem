"use client";

import React from "react";
import { Bell, BellOff, MapPin, User } from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { DEFAULT_BUSINESS_LOGO } from "@/lib/avatars";
import type { DevicePushState } from "@/lib/push-client";
import type { PortalBusinessSettings, PortalUser } from "@/types/portal";

interface ClientHeaderProps {
  settings?: PortalBusinessSettings | null;
  currentUser?: PortalUser | null;
  activeTab: "book" | "my-appointments";
  activeCount: number;
  maxActiveAllowed: number;
  pwaInstalled: boolean;
  pushState: DevicePushState;
  pushBusy: boolean;
  testingPush: boolean;
  pushMessage: string | null;
  onDismissPushMessage: () => void;
  onOpenMapModal: () => void;
  onOpenPwaModal: () => void;
  onOpenAuthModal: () => void;
  onTogglePush: () => void;
  onTestPush: () => void;
  onSelectBookTab: () => void;
  onSelectMyAppointmentsTab: () => void;
}

export function ClientHeader({
  settings,
  currentUser,
  activeTab,
  activeCount,
  maxActiveAllowed,
  pwaInstalled,
  pushState,
  pushBusy,
  testingPush,
  pushMessage,
  onDismissPushMessage,
  onOpenMapModal,
  onOpenPwaModal,
  onOpenAuthModal,
  onTogglePush,
  onTestPush,
  onSelectBookTab,
  onSelectMyAppointmentsTab,
}: ClientHeaderProps) {
  const pushLabel = pushBusy
    ? "Activando..."
    : pushState === "subscribed"
    ? "Avisos activos"
    : pushState === "insecure_context"
    ? "Avisos (Requiere HTTPS)"
    : pushState === "denied"
    ? "Avisos bloqueados"
    : "Activar avisos";

  return (
    <header className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3.5 md:px-8 md:pt-7 md:pb-5 bg-white border-b border-zinc-100">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start sm:items-center justify-between gap-2.5 flex-1 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-11 h-11 md:w-14 md:h-14 rounded-full overflow-hidden bg-zinc-200 flex-shrink-0 border border-zinc-300">
              {/* eslint-disable-next-line @next/next/no-img-element -- Dynamic business logo or uploaded data URL */}
              <img
                src={settings?.logoUrl || DEFAULT_BUSINESS_LOGO}
                alt={settings?.name || "Logo del negocio"}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-bold text-base sm:text-lg md:text-xl leading-tight text-[#1F1F23] break-words">
                {settings?.name || "Mi Negocio"}
              </h1>
              <p className="hidden sm:block text-xs md:text-sm text-zinc-600 leading-snug mt-0.5">
                {settings?.addressText || "Av. Principal 123, Bolivia"}
              </p>
              <div className="hidden sm:flex mt-1.5 items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={onOpenMapModal}
                  className="inline-flex items-center gap-1 text-[11px] md:text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-full transition-all border border-rose-200/80 shadow-2xs whitespace-nowrap"
                >
                  <MapPin className="w-3 h-3 text-rose-600 shrink-0" />
                  <span>Ver mapa en la web</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenPwaModal}
                  className="inline-flex items-center gap-1 text-[11px] md:text-xs font-semibold text-zinc-800 bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1 rounded-full transition-all border border-zinc-300 shadow-2xs whitespace-nowrap"
                  title="Instalar como aplicación en tu celular"
                >
                  <span>📲</span>
                  <span>{pwaInstalled ? "App Instalada ✓" : "Instalar App"}</span>
                </button>
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={onTogglePush}
                  data-testid="header-client-push-btn"
                  className={`inline-flex items-center gap-1 text-[11px] md:text-xs font-semibold px-2.5 py-1 rounded-full transition-all border shadow-2xs whitespace-nowrap ${
                    pushState === "subscribed"
                      ? "text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-300"
                      : pushState === "insecure_context" || pushState === "denied"
                      ? "text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-300"
                      : "text-zinc-800 bg-zinc-100 hover:bg-zinc-200 border-zinc-300"
                  } disabled:opacity-50`}
                  title={
                    pushState === "subscribed"
                      ? "Notificaciones activas en este dispositivo (clic para desactivar)"
                      : pushState === "insecure_context"
                      ? "Las notificaciones requieren HTTPS"
                      : "Recibe alertas en tu navegador si cambia tu cita"
                  }
                >
                  {pushState === "subscribed" ? (
                    <Bell className="w-3 h-3 text-emerald-600 shrink-0" />
                  ) : (
                    <BellOff className="w-3 h-3 text-zinc-500 shrink-0" />
                  )}
                  <span>{pushLabel}</span>
                </button>
                {pushState === "subscribed" && currentUser && (
                  <button
                    type="button"
                    disabled={testingPush}
                    onClick={onTestPush}
                    data-testid="header-client-push-test-btn"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs whitespace-nowrap disabled:opacity-50"
                    title="Probar entrega real Web Push desde el servidor"
                  >
                    <span>{testingPush ? "Probando..." : "Probar"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenAuthModal}
              className={`h-9 sm:h-10 md:h-11 px-3 sm:px-3.5 md:px-4 rounded-full text-xs md:text-sm font-semibold flex items-center gap-1.5 transition-all shadow-sm whitespace-nowrap ${
                currentUser
                  ? "bg-[#1F1F23] text-white hover:bg-black"
                  : "bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300"
              }`}
              title={currentUser ? "Mi Cuenta" : "Iniciar Sesión"}
            >
              <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span className="max-w-[82px] sm:max-w-[110px] truncate">
                {currentUser ? currentUser.name?.split(" ")[0] : "Ingresar"}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenMapModal}
              className="hidden sm:flex w-10 h-10 md:w-11 md:h-11 rounded-full bg-[#1F1F23] text-white items-center justify-center hover:bg-black transition-all shadow-sm"
              title="Ver Ubicación en Mapa"
            >
              <MapPin className="w-4 h-4 text-rose-400" />
            </button>
            {settings?.phoneWhatsapp && (
              <a
                href={`https://wa.me/${settings.phoneWhatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-full bg-[#25D366] text-white flex items-center justify-center hover:bg-[#1EBE5D] transition-all shadow-sm shrink-0"
                title="Abrir WhatsApp"
              >
                <WhatsAppIcon className="w-5 h-5" />
              </a>
            )}
          </div>
        </div>

        <div className="sm:hidden space-y-2">
          <p className="text-xs text-zinc-600 leading-snug">
            {settings?.addressText || "Dirección por configurar"}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onOpenMapModal}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 min-h-[34px] rounded-full transition-all border border-rose-200/80 shadow-2xs whitespace-nowrap"
            >
              <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>Ver mapa en la web</span>
            </button>
            <button
              type="button"
              onClick={onOpenPwaModal}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-800 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 min-h-[34px] rounded-full transition-all border border-zinc-300 shadow-2xs whitespace-nowrap"
              title="Instalar como aplicación en tu celular"
            >
              <span>📲</span>
              <span>{pwaInstalled ? "App Instalada ✓" : "Instalar App"}</span>
            </button>
            <button
              type="button"
              disabled={pushBusy}
              onClick={onTogglePush}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 min-h-[34px] rounded-full transition-all border shadow-2xs whitespace-nowrap ${
                pushState === "subscribed"
                  ? "text-emerald-800 bg-emerald-50 border-emerald-300"
                  : pushState === "insecure_context" || pushState === "denied"
                  ? "text-amber-800 bg-amber-50 border-amber-300"
                  : "text-zinc-800 bg-zinc-100 border-zinc-300"
              } disabled:opacity-50`}
            >
              {pushState === "subscribed" ? (
                <Bell className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <BellOff className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              )}
              <span>
                {pushBusy
                  ? "Activando..."
                  : pushState === "subscribed"
                  ? "Avisos activos"
                  : pushState === "insecure_context"
                  ? "Requiere HTTPS"
                  : "Activar avisos"}
              </span>
            </button>
            {pushState === "subscribed" && currentUser && (
              <button
                type="button"
                disabled={testingPush}
                onClick={onTestPush}
                className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 min-h-[34px] rounded-full bg-white text-emerald-800 border border-emerald-200 shadow-2xs whitespace-nowrap disabled:opacity-50"
              >
                <span>{testingPush ? "Probando..." : "Probar"}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {pushMessage && (
        <div className="mt-3 p-3 rounded-2xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-800 flex items-center justify-between gap-2">
          <span className="leading-snug">{pushMessage}</span>
          <button
            type="button"
            onClick={onDismissPushMessage}
            className="text-zinc-400 hover:text-zinc-700 font-bold shrink-0 px-1"
          >
            ✕
          </button>
        </div>
      )}

      <div className="mt-4 md:mt-6 bg-zinc-200 p-1 rounded-full flex items-center border border-zinc-300/60 max-w-md mx-auto">
        <button
          type="button"
          onClick={onSelectBookTab}
          className={`flex-1 py-2.5 text-xs font-bold rounded-full transition-all text-center ${
            activeTab === "book"
              ? "bg-[#1F1F23] text-white shadow-sm"
              : "text-zinc-800 hover:text-black"
          }`}
        >
          Reservar Cita
        </button>
        <button
          type="button"
          onClick={onSelectMyAppointmentsTab}
          className={`flex-1 py-2.5 text-xs font-bold rounded-full transition-all text-center flex items-center justify-center gap-1.5 ${
            activeTab === "my-appointments"
              ? "bg-[#1F1F23] text-white shadow-sm"
              : "text-zinc-800 hover:text-black"
          }`}
        >
          <span>Mis Citas</span>
          <span
            className={`text-xs px-2 py-0.2 rounded-full font-bold ${
              activeTab === "my-appointments"
                ? "bg-white text-zinc-900"
                : "bg-zinc-800 text-white"
            }`}
          >
            {activeCount}/{maxActiveAllowed}
          </span>
        </button>
      </div>
    </header>
  );
}
