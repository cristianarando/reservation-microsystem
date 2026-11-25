"use client";

import React from "react";
import { Bell, BellOff, BellRing, Loader2, Send } from "lucide-react";
import type { DevicePushState } from "@/lib/push-client";

interface PushNotificationToggleProps {
  pushState?: DevicePushState;
  pushSupported?: boolean;
  pushPermission?: NotificationPermission;
  pushSubscribed?: boolean;
  pushLoading: boolean;
  pushTestLoading?: boolean;
  isImpersonating?: boolean;
  idleLabel?: string;
  subscribedLabel?: string;
  toggleTestId?: string;
  testBtnTestId?: string;
  onToggle: () => void;
  onSendTest?: () => void;
  variant?: "compact" | "pill" | "card";
}

export function PushNotificationToggle({
  pushState,
  pushSupported = true,
  pushPermission = "default",
  pushSubscribed = false,
  pushLoading,
  pushTestLoading = false,
  isImpersonating = false,
  idleLabel = "Activar avisos",
  subscribedLabel,
  toggleTestId,
  testBtnTestId,
  onToggle,
  onSendTest,
  variant = "pill",
}: PushNotificationToggleProps) {
  if (!pushSupported && !pushState) return null;

  const isSubscribed =
    pushState !== undefined
      ? pushState === "subscribed" && !isImpersonating
      : pushSubscribed && !isImpersonating;
  const isDenied =
    pushState !== undefined ? pushState === "denied" : pushPermission === "denied";
  const isInsecure = pushState === "insecure_context";

  const resolvedIdle = isImpersonating
    ? "Vista previa (sin vincular push)"
    : isInsecure
    ? "Avisos (Requiere HTTPS)"
    : isDenied
    ? "Avisos bloqueados"
    : idleLabel;

  const resolvedSubscribed =
    subscribedLabel ?? (variant === "compact" ? "Avisos ✓" : "Avisos activos");

  const label = pushLoading
    ? "Procesando..."
    : isSubscribed
    ? resolvedSubscribed
    : resolvedIdle;

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        disabled={pushLoading || isImpersonating}
        onClick={onToggle}
        data-testid={toggleTestId}
        title={
          isImpersonating
            ? "Deshabilitado durante la vista previa de otro profesional"
            : isInsecure
            ? "Las notificaciones Web Push requieren acceder mediante HTTPS"
            : isDenied
            ? "Los avisos fueron bloqueados en el navegador. Habilítalos desde el candado de la barra de dirección."
            : isSubscribed
            ? "Desactivar notificaciones push en este dispositivo"
            : "Recibir notificaciones instantáneas en este dispositivo"
        }
        className={`inline-flex items-center gap-1.5 rounded-full font-bold transition-all min-h-[44px] sm:min-h-[34px] px-3 py-1.5 text-[11px] md:text-xs border shadow-2xs whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 disabled:opacity-50 ${
          isSubscribed
            ? "bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100"
            : isDenied || isInsecure
            ? "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
            : "bg-zinc-100 text-zinc-800 border-zinc-300 hover:bg-zinc-200"
        }`}
      >
        {pushLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        ) : isSubscribed ? (
          variant === "card" ? (
            <BellRing className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          ) : (
            <Bell className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          )
        ) : (
          <BellOff className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        )}
        <span>{label}</span>
      </button>

      {isSubscribed && onSendTest && (
        <button
          type="button"
          disabled={pushTestLoading || isImpersonating}
          onClick={onSendTest}
          data-testid={testBtnTestId}
          title="Enviar una notificación Web Push real desde el servidor a este navegador"
          className="inline-flex items-center gap-1 rounded-full font-bold transition-all min-h-[44px] sm:min-h-[34px] px-2.5 py-1.5 text-[11px] bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50 shadow-2xs whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 disabled:opacity-50"
        >
          {pushTestLoading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Send className="w-3 h-3" />
          )}
          <span>{pushTestLoading ? "Probando..." : "Probar"}</span>
        </button>
      )}
    </div>
  );
}
