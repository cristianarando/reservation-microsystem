"use client";

import React, { useId } from "react";
import { MapPin, ShieldAlert, X } from "lucide-react";
import BranchMap from "../BranchMap";
import { WhatsAppIcon } from "../WhatsAppIcon";
import { AccessibleModal } from "@/components/ui/AccessibleModal";
import { Button } from "@/components/ui/Button";
import { parseCoordinatesFromUrl } from "@/lib/geo";
import type { BeforeInstallPromptEvent } from "@/types/portal";

interface CancellationPolicyModalProps {
  policyModal: { open: boolean; message: string; whatsappUrl: string } | null;
  onClose: () => void;
}

export function CancellationPolicyModal({
  policyModal,
  onClose,
}: CancellationPolicyModalProps) {
  const titleId = useId();
  if (!policyModal?.open) return null;

  return (
    <AccessibleModal
      isOpen={policyModal.open}
      onClose={onClose}
      labelledBy={titleId}
      maxWidthClass="max-w-sm"
      className="rounded-[28px] p-5 sm:p-6 text-center"
    >
      <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-3" />
      <h3 id={titleId} className="text-base font-bold text-zinc-900">
        Política de Cancelación
      </h3>
      <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
        {policyModal.message}
      </p>

      <div className="mt-5 flex flex-col sm:flex-row gap-2">
        <a
          href={policyModal.whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="flex-1 min-h-[44px] py-3 rounded-full bg-[var(--brand-primary,#1F1F23)] text-[var(--brand-primary-fg,#FFFFFF)] text-xs font-semibold hover:opacity-90 flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
        >
          <WhatsAppIcon className="w-4 h-4 text-[#25D366]" />
          <span>Hablar por WhatsApp</span>
        </a>
        <Button
          variant="secondary"
          size="pill"
          onClick={onClose}
          className="min-h-[44px] py-3 px-5"
        >
          Cerrar
        </Button>
      </div>
    </AccessibleModal>
  );
}

interface BranchLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessName?: string | null;
  addressText?: string | null;
  googleMapsUrl?: string | null;
}

export function BranchLocationModal({
  isOpen,
  onClose,
  businessName,
  addressText,
  googleMapsUrl,
}: BranchLocationModalProps) {
  const titleId = useId();
  if (!isOpen) return null;

  const coords = parseCoordinatesFromUrl(googleMapsUrl) ?? {
    lat: -17.3713,
    lng: -66.1742,
  };
  const resolvedAddress = addressText || "Atención presencial con cita previa";

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      maxWidthClass="max-w-sm"
      className="rounded-[28px] overflow-hidden p-0"
    >
      <div className="flex items-center justify-between gap-2 p-4 border-b border-zinc-100 bg-zinc-50/70">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shrink-0">
            <MapPin className="w-4 h-4 text-rose-600" />
          </div>
          <div className="min-w-0">
            <h3 id={titleId} className="text-sm font-bold text-[#1F1F23] truncate">
              Ubicación de la Sucursal
            </h3>
            <p className="text-[11px] text-zinc-600 truncate">
              {resolvedAddress}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-11 h-11 sm:w-9 sm:h-9 rounded-full bg-zinc-200 hover:bg-zinc-300 text-zinc-700 flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 shrink-0"
          title="Cerrar mapa"
          aria-label="Cerrar mapa"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3">
        <BranchMap
          name={businessName || "Mi Negocio"}
          addressText={resolvedAddress}
          lat={coords.lat}
          lng={coords.lng}
          googleMapsUrl={googleMapsUrl || undefined}
          height="240px"
        />
      </div>
    </AccessibleModal>
  );
}

interface PwaInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: BeforeInstallPromptEvent | null;
  pwaInstalled: boolean;
  onInstallPrompted: () => void;
}

export function PwaInstallModal({
  isOpen,
  onClose,
  deferredPrompt,
  pwaInstalled,
  onInstallPrompted,
}: PwaInstallModalProps) {
  const titleId = useId();
  if (!isOpen) return null;

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      maxWidthClass="max-w-sm"
      className="rounded-[32px] p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-[var(--brand-primary,#1F1F23)] text-[var(--brand-primary-fg,#FFFFFF)] flex items-center justify-center font-bold text-lg shadow-md shrink-0">
            📲
          </div>
          <div className="min-w-0">
            <h3 id={titleId} className="text-sm font-bold text-[#1F1F23] leading-snug">
              Instalar como Aplicación (PWA)
            </h3>
            <p className="text-[11px] text-zinc-600 leading-snug">
              Acceso directo sin usar memoria del teléfono
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar instalación PWA"
          className="w-11 h-11 sm:w-9 sm:h-9 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center font-bold text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 shrink-0"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2.5 text-xs text-zinc-700 bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200">
        <div className="font-bold text-zinc-900">
          ¿Cómo funciona en tu celular?
        </div>
        <div className="flex items-start gap-2">
          <span className="font-bold text-emerald-700">1. Android (Chrome):</span>
          <span>
            Pulsa el botón de abajo o el menú <b>⋮ → &quot;Instalar aplicación&quot;</b>.
          </span>
        </div>
        <div className="flex items-start gap-2">
          <span className="font-bold text-zinc-900">2. iPhone (Safari):</span>
          <span>
            Toca el botón <b>Compartir (↑) → &quot;Agregar a pantalla de inicio&quot;</b>.
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {deferredPrompt ? (
          <Button
            variant="primary"
            size="pill"
            onClick={async () => {
              try {
                await deferredPrompt.prompt();
                const choice = await deferredPrompt.userChoice;
                if (choice?.outcome === "accepted") {
                  onInstallPrompted();
                  onClose();
                }
              } catch {
                // Ignore cancelled install prompt
              }
            }}
            className="w-full min-h-[44px] py-3.5 font-bold"
          >
            {pwaInstalled
              ? "✓ Aplicación ya instalada en tu inicio"
              : "📲 Instalar App Ahora (1-Toque)"}
          </Button>
        ) : (
          <div className="p-3 rounded-2xl bg-zinc-100 border border-zinc-200 text-[11px] text-zinc-700 leading-relaxed text-center">
            {pwaInstalled
              ? "✓ Aplicación instalada en tu pantalla de inicio."
              : "Usa el menú de tu navegador (Compartir ↑ en Safari o ⋮ → Instalar aplicación en Chrome) para añadir el acceso directo."}
          </div>
        )}
        <Button
          variant="secondary"
          size="pill"
          onClick={onClose}
          className="w-full min-h-[44px] sm:min-h-[40px] py-2.5"
        >
          Cerrar
        </Button>
      </div>
    </AccessibleModal>
  );
}
