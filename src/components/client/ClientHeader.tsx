"use client";

import React from "react";
import { MapPin, User } from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { PushNotificationToggle } from "@/components/ui/PushNotificationToggle";
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
  compact?: boolean;
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
  compact = false,
  onDismissPushMessage,
  onOpenMapModal,
  onOpenPwaModal,
  onOpenAuthModal,
  onTogglePush,
  onTestPush,
  onSelectBookTab,
  onSelectMyAppointmentsTab,
}: ClientHeaderProps) {
  return (
    <header
      className={`px-4 sm:px-5 md:px-8 bg-white border-b border-zinc-100 ${
        compact ? "pt-3 pb-2.5 md:pt-4 md:pb-3" : "pt-4 sm:pt-5 pb-3.5 md:pt-7 md:pb-5"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start sm:items-center justify-between gap-2.5 flex-1 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-11 h-11 md:w-12 md:h-12 rounded-full overflow-hidden bg-zinc-200 flex-shrink-0 border border-zinc-300">
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
              {!compact && (
                <>
                  <p className="hidden sm:block text-xs md:text-sm text-zinc-600 leading-snug mt-0.5">
                    {settings?.addressText || "Av. Principal 123, Bolivia"}
                  </p>
                  <div className="hidden sm:flex mt-1.5 items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={onOpenMapModal}
                      className="inline-flex items-center gap-1 text-[11px] md:text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 min-h-[34px] rounded-full transition-all border border-rose-200/80 shadow-2xs whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30"
                    >
                      <MapPin className="w-3 h-3 text-rose-600 shrink-0" />
                      <span>Ver mapa en la web</span>
                    </button>
                    <button
                      type="button"
                      onClick={onOpenPwaModal}
                      className="inline-flex items-center gap-1 text-[11px] md:text-xs font-semibold text-zinc-800 bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1 min-h-[34px] rounded-full transition-all border border-zinc-300 shadow-2xs whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
                      title="Instalar como aplicación en tu celular"
                    >
                      <span>📲</span>
                      <span>{pwaInstalled ? "App Instalada ✓" : "Instalar App"}</span>
                    </button>
                    <PushNotificationToggle
                      pushState={pushState}
                      pushLoading={pushBusy}
                      pushTestLoading={testingPush}
                      toggleTestId="header-client-push-btn"
                      testBtnTestId="header-client-push-test-btn"
                      onToggle={onTogglePush}
                      onSendTest={currentUser ? onTestPush : undefined}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenAuthModal}
              className={`min-h-[44px] sm:min-h-[40px] md:min-h-[44px] px-3 sm:px-3.5 md:px-4 rounded-full text-xs md:text-sm font-semibold flex items-center gap-1.5 transition-all shadow-sm whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 ${
                currentUser
                  ? "bg-[var(--brand-primary,#1F1F23)] text-[var(--brand-primary-fg,#FFFFFF)] hover:opacity-90"
                  : "bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300"
              }`}
              title={currentUser ? "Mi Cuenta" : "Iniciar Sesión"}
            >
              <User className="w-3.5 h-3.5 shrink-0 opacity-80" />
              <span className="max-w-[82px] sm:max-w-[110px] truncate">
                {currentUser ? currentUser.name?.split(" ")[0] : "Ingresar"}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenMapModal}
              className="hidden sm:flex w-11 h-11 rounded-full bg-[var(--brand-primary,#1F1F23)] text-[var(--brand-primary-fg,#FFFFFF)] items-center justify-center hover:opacity-90 transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
              title="Ver Ubicación en Mapa"
              aria-label="Ver Ubicación en Mapa"
            >
              <MapPin className="w-4 h-4 text-rose-400" />
            </button>
            {settings?.phoneWhatsapp && (
              <a
                href={`https://wa.me/${settings.phoneWhatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="w-11 h-11 rounded-full bg-[#25D366] text-white flex items-center justify-center hover:bg-[#1EBE5D] transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40 shrink-0"
                title="Abrir WhatsApp"
                aria-label="Abrir WhatsApp"
              >
                <WhatsAppIcon className="w-5 h-5" />
              </a>
            )}
          </div>
        </div>

        {!compact && (
          <div className="sm:hidden space-y-2">
            <p className="text-xs text-zinc-600 leading-snug">
              {settings?.addressText || "Dirección por configurar"}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={onOpenMapModal}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 min-h-[44px] rounded-full transition-all border border-rose-200/80 shadow-2xs whitespace-nowrap"
              >
                <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>Ver mapa en la web</span>
              </button>
              <button
                type="button"
                onClick={onOpenPwaModal}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-800 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 min-h-[44px] rounded-full transition-all border border-zinc-300 shadow-2xs whitespace-nowrap"
                title="Instalar como aplicación en tu celular"
              >
                <span>📲</span>
                <span>{pwaInstalled ? "App Instalada ✓" : "Instalar App"}</span>
              </button>
              <PushNotificationToggle
                pushState={pushState}
                pushLoading={pushBusy}
                pushTestLoading={testingPush}
                onToggle={onTogglePush}
                onSendTest={currentUser ? onTestPush : undefined}
              />
            </div>
          </div>
        )}
      </div>

      {pushMessage && !compact && (
        <div className="mt-3 p-3 rounded-2xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-800 flex items-center justify-between gap-2">
          <span className="leading-snug">{pushMessage}</span>
          <button
            type="button"
            onClick={onDismissPushMessage}
            aria-label="Descartar aviso"
            className="text-zinc-500 hover:text-zinc-800 font-bold shrink-0 px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      <div
        role="tablist"
        aria-label="Navegación principal"
        className={`${
          compact ? "mt-2.5" : "mt-4 md:mt-6"
        } bg-zinc-200 p-1 rounded-full flex items-center border border-zinc-300/60 max-w-md mx-auto`}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "book"}
          onClick={onSelectBookTab}
          className={`flex-1 min-h-[44px] sm:min-h-[38px] py-2 text-xs font-bold rounded-full transition-all text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 ${
            activeTab === "book"
              ? "bg-[var(--brand-primary,#1F1F23)] text-[var(--brand-primary-fg,#FFFFFF)] shadow-sm"
              : "text-zinc-800 hover:text-black"
          }`}
        >
          Reservar Cita
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "my-appointments"}
          onClick={onSelectMyAppointmentsTab}
          className={`flex-1 min-h-[44px] sm:min-h-[38px] py-2 text-xs font-bold rounded-full transition-all text-center flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 ${
            activeTab === "my-appointments"
              ? "bg-[var(--brand-primary,#1F1F23)] text-[var(--brand-primary-fg,#FFFFFF)] shadow-sm"
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
