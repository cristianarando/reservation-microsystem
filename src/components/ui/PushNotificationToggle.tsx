"use client";

import React from "react";
import { BellRing, Loader2, Send } from "lucide-react";

interface PushNotificationToggleProps {
  pushSupported: boolean;
  pushPermission: NotificationPermission;
  pushSubscribed: boolean;
  pushLoading: boolean;
  pushTestLoading?: boolean;
  isImpersonating?: boolean;
  onToggle: () => void;
  onSendTest?: () => void;
  variant?: "compact" | "pill" | "card";
}

export function PushNotificationToggle({
  pushSupported,
  pushPermission,
  pushSubscribed,
  pushLoading,
  pushTestLoading = false,
  isImpersonating = false,
  onToggle,
  onSendTest,
  variant = "pill",
}: PushNotificationToggleProps) {
  if (!pushSupported) return null;

  const isDenied = pushPermission === "denied";
  const label = pushSubscribed
    ? variant === "compact"
      ? "Avisos ✓"
      : "Avisos activos"
    : isDenied
    ? "Avisos bloqueados"
    : "Activar avisos";

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        disabled={pushLoading || isImpersonating}
        onClick={onToggle}
        title={
          isImpersonating
            ? "Sal de la vista previa para configurar avisos en tu dispositivo"
            : isDenied
            ? "Los avisos fueron bloqueados en el navegador. Habilítalos desde el candado de la barra de dirección."
            : pushSubscribed
            ? "Desactivar notificaciones push en este dispositivo"
            : "Recibir notificaciones instantáneas en este dispositivo"
        }
        className={`inline-flex items-center gap-1.5 rounded-full font-bold transition-all min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/25 disabled:opacity-50 ${
          pushSubscribed
            ? "bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100"
            : isDenied
            ? "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
            : "bg-zinc-900 text-white hover:bg-black shadow-xs"
        }`}
      >
        {pushLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <BellRing className="w-3.5 h-3.5" />
        )}
        <span>{label}</span>
      </button>

      {pushSubscribed && onSendTest && (
        <button
          type="button"
          disabled={pushTestLoading || isImpersonating}
          onClick={onSendTest}
          title="Enviar un aviso de prueba a este dispositivo"
          className="inline-flex items-center gap-1 rounded-full font-bold transition-all min-h-[44px] sm:min-h-[36px] px-3 py-1.5 text-xs bg-white text-zinc-700 border border-zinc-300 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/25 disabled:opacity-50"
        >
          {pushTestLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3 h-3" />
          )}
          <span>Probar</span>
        </button>
      )}
    </div>
  );
}
