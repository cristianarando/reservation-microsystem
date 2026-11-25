"use client";

import React, { useCallback, useEffect, useId, useState } from "react";
import dynamic from "next/dynamic";
import { Bell, Palette, RefreshCw, Save, MapPin, Send, Settings } from "lucide-react";
import { DEFAULT_BUSINESS_LOGO } from "@/lib/avatars";
import { getContrastRatio, normalizeHex } from "@/lib/color-utils";
import type { PortalBusinessSettings } from "@/types/portal";

interface PushQueueMetrics {
  paused: boolean;
  deliveries: {
    pending: number;
    processing: number;
    delivered: number;
    failedPermanent: number;
    expired: number;
    skipped: number;
  };
  subscriptions: {
    active: number;
    expired: number;
  };
  oldestPendingAgeSec: number;
}

const IANA_TIMEZONES = [
  { value: "America/La_Paz", label: "America/La_Paz (UTC-4 · Bolivia)" },
  { value: "America/Lima", label: "America/Lima (UTC-5 · Perú)" },
  { value: "America/Bogota", label: "America/Bogota (UTC-5 · Colombia)" },
  { value: "America/Santiago", label: "America/Santiago (Chile)" },
  { value: "America/Argentina/Buenos_Aires", label: "America/Buenos_Aires (UTC-3 · Argentina)" },
  { value: "America/Mexico_City", label: "America/Mexico_City (México)" },
  { value: "America/New_York", label: "America/New_York (EE.UU. Este)" },
  { value: "Europe/Madrid", label: "Europe/Madrid (España)" },
];

const InteractiveMapPicker = dynamic(
  () => import("@/components/InteractiveMapPicker"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[260px] rounded-2xl border border-zinc-200 bg-zinc-100 animate-pulse flex items-center justify-center text-xs text-zinc-500">
        Cargando mapa interactivo...
      </div>
    ),
  }
);

type SettingsFormUpdater =
  | PortalBusinessSettings
  | ((prev: PortalBusinessSettings) => PortalBusinessSettings);

interface AdminSettingsTabProps {
  settings?: PortalBusinessSettings | null;
  settingsForm: PortalBusinessSettings;
  savingSettings: boolean;
  onUpdateSettingsForm: (updater: SettingsFormUpdater) => void;
  onSaveSettings: () => void;
  onLogoFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function AdminSettingsTab({
  settings,
  settingsForm,
  savingSettings,
  onUpdateSettingsForm,
  onSaveSettings,
  onLogoFileUpload,
}: AdminSettingsTabProps) {
  const bizNameId = useId();
  const taglineId = useId();
  const staffLabelId = useId();
  const currencyId = useId();
  const addressId = useId();
  const mapsUrlId = useId();
  const phoneId = useId();
  const horizonId = useId();
  const leadTimeId = useId();
  const cancelHoursId = useId();
  const slotStepId = useId();
  const maxActiveId = useId();
  const timezoneId = useId();
  const primaryHexId = useId();
  const surfaceHexId = useId();
  const pushHideDetailsId = useId();

  const [pushMetrics, setPushMetrics] = useState<PushQueueMetrics | null>(null);
  const [pushQueueBusy, setPushQueueBusy] = useState(false);
  const [pushQueueNotice, setPushQueueNotice] = useState<string | null>(null);

  const loadPushMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/push/dispatch", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.metrics) {
        setPushMetrics(data.metrics as PushQueueMetrics);
      }
    } catch {
      // ignore transient poll errors
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/push/dispatch", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.metrics) {
          setPushMetrics(data.metrics as PushQueueMetrics);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDispatchAction = async (
    action: "dispatch" | "pause" | "resume" | "expire_stale"
  ) => {
    setPushQueueBusy(true);
    setPushQueueNotice(null);
    try {
      const res = await fetch("/api/admin/push/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        if (data.metrics) {
          setPushMetrics(data.metrics as PushQueueMetrics);
        } else {
          await loadPushMetrics();
        }
        setPushQueueNotice(
          action === "dispatch"
            ? `Despacho ejecutado (${data.sent ?? 0} enviadas, ${data.failed ?? 0} fallidas).`
            : action === "pause"
            ? "Cola Web Push pausada temporalmente."
            : action === "resume"
            ? "Cola Web Push reanudada."
            : "Suscripciones antiguas limpiadas."
        );
      } else {
        setPushQueueNotice(data?.error || "No se pudo ejecutar la acción en la cola.");
      }
    } catch {
      setPushQueueNotice("Error de conexión al consultar la cola Web Push.");
    } finally {
      setPushQueueBusy(false);
    }
  };

  const primaryHex = normalizeHex(settingsForm?.themePrimaryHex, "#1F1F23");
  const surfaceHex = normalizeHex(settingsForm?.themeSurfaceHex, "#F4F4F6");
  const primaryContrast = getContrastRatio(primaryHex, "#FFFFFF");
  const surfaceContrast = getContrastRatio("#1F1F23", surfaceHex);
  const currentTimezone = settingsForm?.timezone || "America/La_Paz";
  const hasKnownTimezone = IANA_TIMEZONES.some((t) => t.value === currentTimezone);
  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h2 className="text-sm font-bold text-zinc-700 uppercase tracking-wider">
            Ajustes del Negocio y Marca
          </h2>
          <p className="text-[11px] text-zinc-500">
            Exclusivo para el Dueño / Administrador Principal
          </p>
        </div>
        <button
          onClick={onSaveSettings}
          disabled={savingSettings}
          className="self-start sm:self-auto px-4 min-h-[38px] py-2 rounded-full bg-[#1F1F23] text-white text-xs font-semibold flex items-center gap-1.5 shadow-md hover:bg-black whitespace-nowrap shrink-0"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{savingSettings ? "Guardando..." : "Guardar Cambios"}</span>
        </button>
      </div>

      <div className="space-y-3">
        <div className="p-4 rounded-3xl bg-zinc-50 border-[1.5px] border-[#1F1F23] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-[10px] font-extrabold text-zinc-700 uppercase tracking-wider block">
                Logo e Identidad Visual del Local
              </label>
              <p className="text-[11px] text-zinc-500">
                Sube el logo de tu negocio. Si no subes uno, se mostrará el
                icono de negocio por defecto.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white p-3 rounded-2xl border border-zinc-200 shadow-2xs">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#1F1F23] bg-zinc-100 flex-shrink-0 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- Live preview supports uploaded DataURL logos */}
              <img
                src={settingsForm?.logoUrl || DEFAULT_BUSINESS_LOGO}
                alt="Vista previa del logo"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="text-xs font-bold text-zinc-900 truncate">
                {settingsForm?.name || "Mi Negocio"}
              </div>
              <div className="text-[11px] text-zinc-500 truncate">
                {settingsForm?.tagline || "Reserva tu cita en segundos"}
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <label className="cursor-pointer px-3 py-1.5 rounded-full bg-[#1F1F23] hover:bg-black text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-xs transition-all">
                  <span>📁 Subir imagen / Logo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onLogoFileUpload}
                    className="hidden"
                  />
                </label>
                {settingsForm?.logoUrl &&
                  settingsForm.logoUrl !== DEFAULT_BUSINESS_LOGO && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSettingsForm({
                          ...settingsForm,
                          logoUrl: DEFAULT_BUSINESS_LOGO,
                        })
                      }
                      className="px-3 py-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[11px] font-semibold transition-all"
                    >
                      Usar icono por defecto
                    </button>
                  )}
              </div>
            </div>
          </div>
        </div>

        <div className="border-[1.5px] border-[#1F1F23] bg-[#F4F4F6] rounded-2xl px-4 py-2 focus-within:ring-2 focus-within:ring-zinc-900/20">
          <label
            htmlFor={bizNameId}
            className="text-[10px] font-bold text-zinc-600 uppercase block"
          >
            Nombre del Negocio
          </label>
          <input
            id={bizNameId}
            type="text"
            value={settingsForm?.name || ""}
            onChange={(e) =>
              onUpdateSettingsForm({ ...settingsForm, name: e.target.value })
            }
            className="bg-transparent font-semibold text-base sm:text-sm text-[#1F1F23] focus:outline-none w-full"
          />
        </div>

        <div className="border-[1.5px] border-zinc-300 bg-[#F4F4F6] rounded-2xl px-4 py-2 focus-within:ring-2 focus-within:ring-zinc-900/20">
          <label
            htmlFor={taglineId}
            className="text-[10px] font-bold text-zinc-600 uppercase block"
          >
            Eslogan o Subtítulo
          </label>
          <input
            id={taglineId}
            type="text"
            value={settingsForm?.tagline || ""}
            onChange={(e) =>
              onUpdateSettingsForm({ ...settingsForm, tagline: e.target.value })
            }
            className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="border-[1.5px] border-zinc-300 bg-[#F4F4F6] rounded-2xl px-4 py-2 focus-within:ring-2 focus-within:ring-zinc-900/20">
            <label
              htmlFor={staffLabelId}
              className="text-[10px] font-bold text-zinc-600 uppercase block"
            >
              Etiqueta de Profesionales
            </label>
            <input
              id={staffLabelId}
              type="text"
              value={settingsForm?.staffLabel || ""}
              onChange={(e) =>
                onUpdateSettingsForm({
                  ...settingsForm,
                  staffLabel: e.target.value,
                })
              }
              placeholder="Especialista / Profesional"
              className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full"
            />
          </div>

          <div className="border-[1.5px] border-zinc-300 bg-[#F4F4F6] rounded-2xl px-4 py-2 focus-within:ring-2 focus-within:ring-zinc-900/20">
            <label
              htmlFor={currencyId}
              className="text-[10px] font-bold text-zinc-600 uppercase block"
            >
              Símbolo de Moneda
            </label>
            <input
              id={currencyId}
              type="text"
              value={settingsForm?.currencySymbol || "Bs"}
              onChange={(e) =>
                onUpdateSettingsForm({
                  ...settingsForm,
                  currencySymbol: e.target.value,
                })
              }
              className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full"
            />
          </div>
        </div>

        <div className="border-[1.5px] border-zinc-300 bg-[#F4F4F6] rounded-2xl px-4 py-2 focus-within:ring-2 focus-within:ring-zinc-900/20">
          <label
            htmlFor={addressId}
            className="text-[10px] font-bold text-zinc-600 uppercase block"
          >
            Dirección Física
          </label>
          <input
            id={addressId}
            type="text"
            value={settingsForm?.addressText || ""}
            onChange={(e) =>
              onUpdateSettingsForm({
                ...settingsForm,
                addressText: e.target.value,
              })
            }
            className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full"
          />
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-zinc-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-rose-600" />
                Ubicación Interactiva en el Mapa
              </span>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Haz clic en cualquier punto del mapa, arrastra el pin o busca una
                calle para fijar la ubicación exacta.
              </p>
            </div>
          </div>

          <InteractiveMapPicker
            initialUrl={settingsForm?.googleMapsUrl || undefined}
            onLocationChange={(_lat, _lng, googleMapsUrl, suggestedAddress) => {
              onUpdateSettingsForm((prev) => ({
                ...prev,
                googleMapsUrl,
                ...(suggestedAddress &&
                (!prev?.addressText ||
                  !prev.addressText.trim() ||
                  prev.addressText.includes("Simón López"))
                  ? { addressText: suggestedAddress }
                  : {}),
              }));
            }}
            height="260px"
          />

          <div className="border-[1.5px] border-zinc-200 bg-[#F4F4F6] rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-zinc-900/20">
            <label
              htmlFor={mapsUrlId}
              className="text-[10px] font-bold text-zinc-600 uppercase block mb-0.5"
            >
              Enlace de Google Maps (Sincronizado Automáticamente)
            </label>
            <input
              id={mapsUrlId}
              type="url"
              value={settingsForm?.googleMapsUrl || ""}
              onChange={(e) =>
                onUpdateSettingsForm((prev) => ({
                  ...prev,
                  googleMapsUrl: e.target.value,
                }))
              }
              placeholder="https://www.google.com/maps/search/?api=1&query=..."
              className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full"
            />
          </div>
        </div>

        <div className="border-[1.5px] border-zinc-300 bg-[#F4F4F6] rounded-2xl px-4 py-2 focus-within:ring-2 focus-within:ring-zinc-900/20">
          <label
            htmlFor={phoneId}
            className="text-[10px] font-bold text-zinc-600 uppercase block"
          >
            Teléfono / WhatsApp de Notificaciones
          </label>
          <input
            id={phoneId}
            type="text"
            value={settingsForm?.phoneWhatsapp || ""}
            onChange={(e) =>
              onUpdateSettingsForm({
                ...settingsForm,
                phoneWhatsapp: e.target.value,
              })
            }
            placeholder="+591 70000000"
            className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full"
          />
        </div>

        <div className="p-4.5 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
          <div>
            <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
              <Settings className="w-4 h-4 text-zinc-600" />
              <span>Reglas Predeterminadas de la Clínica (Valores Base)</span>
            </h4>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Estas son las reglas generales del negocio. Se aplican por defecto
              a los nuevos doctores o a quienes no tengan reglas personalizadas
              en su pestaña &quot;Mis Horarios&quot;. Cada doctor puede definir
              su propia ventana y antelación.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="border-[1.5px] border-zinc-300 bg-white rounded-2xl px-4 py-2 focus-within:ring-2 focus-within:ring-zinc-900/20">
              <label
                htmlFor={horizonId}
                className="text-[10px] font-bold text-zinc-600 uppercase block"
              >
                Ventana de Reserva Base (Días)
              </label>
              <input
                id={horizonId}
                type="number"
                min={1}
                max={90}
                value={settingsForm?.bookingHorizonDays || 7}
                onChange={(e) =>
                  onUpdateSettingsForm({
                    ...settingsForm,
                    bookingHorizonDays: Number(e.target.value),
                  })
                }
                className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full"
              />
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                Anticipación máxima por defecto
              </span>
            </div>

            <div className="border-[1.5px] border-zinc-300 bg-white rounded-2xl px-4 py-2 focus-within:ring-2 focus-within:ring-zinc-900/20">
              <label
                htmlFor={leadTimeId}
                className="text-[10px] font-bold text-zinc-600 uppercase block"
              >
                Aviso Previo Mínimo Base
              </label>
              <select
                id={leadTimeId}
                value={settingsForm?.minLeadTimeMinutes ?? 30}
                onChange={(e) =>
                  onUpdateSettingsForm({
                    ...settingsForm,
                    minLeadTimeMinutes: Number(e.target.value),
                  })
                }
                className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full cursor-pointer"
              >
                <option value={0}>
                  0 min (Inmediato / En cualquier momento)
                </option>
                <option value={15}>15 minutos antes</option>
                <option value={30}>30 minutos antes</option>
                <option value={60}>60 minutos (1 hora)</option>
                <option value={120}>120 minutos (2 horas)</option>
                <option value={1440}>24 horas antes</option>
              </select>
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                Margen de antelación para el mismo día
              </span>
            </div>

            <div className="border-[1.5px] border-zinc-300 bg-white rounded-2xl px-4 py-2 focus-within:ring-2 focus-within:ring-zinc-900/20">
              <label
                htmlFor={cancelHoursId}
                className="text-[10px] font-bold text-zinc-600 uppercase block"
              >
                Horas Mínimas Cancelación
              </label>
              <input
                id={cancelHoursId}
                type="number"
                min={0}
                max={72}
                value={settingsForm?.minCancelNoticeHours || 6}
                onChange={(e) =>
                  onUpdateSettingsForm({
                    ...settingsForm,
                    minCancelNoticeHours: Number(e.target.value),
                  })
                }
                className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full"
              />
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                Regla global para cancelar sin falta
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="border-[1.5px] border-zinc-300 bg-white rounded-2xl px-4 py-2 focus-within:ring-2 focus-within:ring-zinc-900/20">
              <label
                htmlFor={slotStepId}
                className="text-[10px] font-bold text-zinc-600 uppercase block"
              >
                Intervalo de Horarios
              </label>
              <select
                id={slotStepId}
                value={settingsForm?.slotStepMin ?? 30}
                onChange={(e) =>
                  onUpdateSettingsForm({
                    ...settingsForm,
                    slotStepMin: Number(e.target.value),
                  })
                }
                className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full cursor-pointer"
              >
                <option value={15}>Cada 15 minutos</option>
                <option value={20}>Cada 20 minutos</option>
                <option value={30}>Cada 30 minutos</option>
                <option value={45}>Cada 45 minutos</option>
                <option value={60}>Cada 60 minutos</option>
              </select>
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                Grilla mostrada al reservar
              </span>
            </div>

            <div className="border-[1.5px] border-zinc-300 bg-white rounded-2xl px-4 py-2 focus-within:ring-2 focus-within:ring-zinc-900/20">
              <label
                htmlFor={maxActiveId}
                className="text-[10px] font-bold text-zinc-600 uppercase block"
              >
                Máx. Citas Activas / Cliente
              </label>
              <input
                id={maxActiveId}
                type="number"
                min={1}
                max={10}
                value={settingsForm?.maxActiveBookings ?? 2}
                onChange={(e) =>
                  onUpdateSettingsForm({
                    ...settingsForm,
                    maxActiveBookings: Math.max(
                      1,
                      Math.min(10, Number(e.target.value) || 2)
                    ),
                  })
                }
                className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full"
              />
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                Límite simultáneo por paciente
              </span>
            </div>

            <div className="border-[1.5px] border-zinc-300 bg-white rounded-2xl px-4 py-2 focus-within:ring-2 focus-within:ring-zinc-900/20">
              <label
                htmlFor={timezoneId}
                className="text-[10px] font-bold text-zinc-600 uppercase block"
              >
                Zona Horaria (IANA)
              </label>
              <select
                id={timezoneId}
                value={currentTimezone}
                onChange={(e) =>
                  onUpdateSettingsForm({
                    ...settingsForm,
                    timezone: e.target.value,
                  })
                }
                className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full cursor-pointer"
              >
                {!hasKnownTimezone && (
                  <option value={currentTimezone}>{currentTimezone}</option>
                )}
                {IANA_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                Reloj oficial de citas y turnos
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Brand Palette & WCAG Contrast Checker */}
        <div className="p-4.5 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
          <div>
            <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-zinc-600" />
              <span>Paleta Dinámica de Marca y Contraste WCAG AA</span>
            </h4>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Personaliza el color primario de botones y el fondo suave de tarjetas. Se valida contraste ≥ 4.5:1 automáticamente.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-2xl bg-white border border-zinc-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <label
                  htmlFor={primaryHexId}
                  className="text-[10px] font-bold text-zinc-600 uppercase block"
                >
                  Color Primario (Botones)
                </label>
                <div className="text-xs font-mono font-bold text-zinc-900 mt-0.5">
                  {primaryHex}
                </div>
                <span
                  className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    primaryContrast >= 4.5
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-amber-100 text-amber-900"
                  }`}
                >
                  Contraste c/ blanco: {primaryContrast.toFixed(1)}:1{" "}
                  {primaryContrast >= 4.5 ? "✓ AA" : "⚠ Bajo"}
                </span>
              </div>
              <input
                id={primaryHexId}
                type="color"
                value={primaryHex}
                onChange={(e) =>
                  onUpdateSettingsForm({
                    ...settingsForm,
                    themePrimaryHex: e.target.value.toUpperCase(),
                  })
                }
                className="w-11 h-11 rounded-xl border border-zinc-300 cursor-pointer bg-white p-0.5 shrink-0"
              />
            </div>

            <div className="p-3 rounded-2xl bg-white border border-zinc-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <label
                  htmlFor={surfaceHexId}
                  className="text-[10px] font-bold text-zinc-600 uppercase block"
                >
                  Color de Superficie (Tarjetas)
                </label>
                <div className="text-xs font-mono font-bold text-zinc-900 mt-0.5">
                  {surfaceHex}
                </div>
                <span
                  className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    surfaceContrast >= 4.5
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-amber-100 text-amber-900"
                  }`}
                >
                  Contraste texto: {surfaceContrast.toFixed(1)}:1{" "}
                  {surfaceContrast >= 4.5 ? "✓ AA" : "⚠ Bajo"}
                </span>
              </div>
              <input
                id={surfaceHexId}
                type="color"
                value={surfaceHex}
                onChange={(e) =>
                  onUpdateSettingsForm({
                    ...settingsForm,
                    themeSurfaceHex: e.target.value.toUpperCase(),
                  })
                }
                className="w-11 h-11 rounded-xl border border-zinc-300 cursor-pointer bg-white p-0.5 shrink-0"
              />
            </div>
          </div>

          <label
            htmlFor={pushHideDetailsId}
            className="flex items-start justify-between gap-3 p-3 rounded-2xl bg-white border border-zinc-200 cursor-pointer"
          >
            <div>
              <span className="text-xs font-bold text-zinc-900 block">
                Modo privacidad en pantalla bloqueada (Notificaciones Push)
              </span>
              <span className="text-[11px] text-zinc-500">
                Si está activo, oculta nombre del cliente y servicio en las alertas Web Push externas y muestra un aviso neutro.
              </span>
            </div>
            <input
              id={pushHideDetailsId}
              type="checkbox"
              checked={Boolean(settingsForm?.pushHideDetails)}
              onChange={(e) =>
                onUpdateSettingsForm({
                  ...settingsForm,
                  pushHideDetails: e.target.checked,
                })
              }
              className="w-4 h-4 mt-0.5 rounded accent-zinc-900 shrink-0"
            />
          </label>
        </div>

        {/* Web Push Operational Queue Card */}
        <div className="p-4.5 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-zinc-600" />
                <span>Cola Operativa Web Push</span>
              </h4>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Estado en tiempo real de entregas push y recordatorios automáticos.
              </p>
            </div>
            <button
              type="button"
              onClick={loadPushMetrics}
              disabled={pushQueueBusy}
              className="px-3 py-1 rounded-full bg-white hover:bg-zinc-100 border border-zinc-300 text-[11px] font-bold text-zinc-800 inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Actualizar</span>
            </button>
          </div>

          {pushMetrics ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded-2xl bg-white border border-zinc-200">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold block">
                    Pendientes
                  </span>
                  <span className="font-extrabold text-zinc-900 text-base">
                    {pushMetrics.deliveries.pending}
                  </span>
                </div>
                <div className="p-2.5 rounded-2xl bg-white border border-zinc-200">
                  <span className="text-[10px] text-emerald-700 uppercase font-bold block">
                    Entregadas
                  </span>
                  <span className="font-extrabold text-emerald-900 text-base">
                    {pushMetrics.deliveries.delivered}
                  </span>
                </div>
                <div className="p-2.5 rounded-2xl bg-white border border-zinc-200">
                  <span className="text-[10px] text-amber-700 uppercase font-bold block">
                    Fallidas / Exp.
                  </span>
                  <span className="font-extrabold text-amber-900 text-base">
                    {pushMetrics.deliveries.failedPermanent +
                      pushMetrics.deliveries.expired}
                  </span>
                </div>
                <div className="p-2.5 rounded-2xl bg-white border border-zinc-200">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold block">
                    Dispositivos Activos
                  </span>
                  <span className="font-extrabold text-zinc-900 text-base">
                    {pushMetrics.subscriptions.active}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={pushQueueBusy}
                  onClick={() => handleDispatchAction("dispatch")}
                  className="min-h-[34px] px-3.5 py-1.5 rounded-full bg-[#1F1F23] hover:bg-black text-white text-[11px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3 h-3" />
                  <span>Despachar pendientes</span>
                </button>
                <button
                  type="button"
                  disabled={pushQueueBusy}
                  onClick={() =>
                    handleDispatchAction(pushMetrics.paused ? "resume" : "pause")
                  }
                  className="min-h-[34px] px-3 py-1.5 rounded-full bg-white hover:bg-zinc-100 border border-zinc-300 text-[11px] font-bold text-zinc-800 disabled:opacity-50"
                >
                  {pushMetrics.paused ? "▶ Reanudar cola" : "⏸ Pausar cola"}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-zinc-500">
              Cargando métricas de la cola push...
            </div>
          )}

          {pushQueueNotice && (
            <div className="text-[11px] font-semibold text-zinc-700 bg-white border border-zinc-200 rounded-xl px-3 py-2">
              {pushQueueNotice}
            </div>
          )}
        </div>

        <div className="p-4.5 bg-zinc-50 border border-zinc-200 rounded-3xl space-y-3.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                SEO en Google y Tarjeta Open Graph (WhatsApp)
              </h4>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Sincronizado automáticamente con tu logo, nombre, servicios y
                ubicación guardados.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
              Indexación Activa ✓
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-zinc-200 p-3.5 space-y-1.5 shadow-2xs">
              <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                Vista previa en Google
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- Direct preview of dynamic generated favicon endpoint */}
                <img
                  src={`/icon/48?v=${
                    settings?.updatedAt
                      ? new Date(settings.updatedAt).getTime()
                      : 1
                  }`}
                  alt="Favicon"
                  className="w-5 h-5 rounded-md border border-zinc-200 object-cover"
                />
                <span className="text-[11px] text-zinc-600 truncate">
                  {settingsForm?.name || "Mi Negocio"}
                </span>
              </div>
              <div className="text-sm font-semibold text-[#1a0dab] leading-snug line-clamp-1">
                {`${settingsForm?.name || "Mi Negocio"} | Reserva tu Cita Online`}
              </div>
              <p className="text-[11px] text-zinc-600 leading-relaxed line-clamp-2">
                {`${
                  settingsForm?.tagline || "Reserva tu cita en línea en segundos"
                }. Agenda tu turno con confirmación inmediata en ${
                  settingsForm?.addressText || "tu ciudad"
                }.`}
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200 p-3 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  Tarjeta WhatsApp (Open Graph 1200×630)
                </span>
                <a
                  href={`/opengraph-image?v=${
                    settings?.updatedAt
                      ? new Date(settings.updatedAt).getTime()
                      : 1
                  }`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-bold text-emerald-700 hover:underline"
                >
                  Abrir imagen ↗
                </a>
              </div>
              <div className="rounded-xl overflow-hidden border border-zinc-200 bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element -- Direct preview of dynamic generated 1200x630 Open Graph PNG */}
                <img
                  src={`/opengraph-image?v=${
                    settings?.updatedAt
                      ? new Date(settings.updatedAt).getTime()
                      : 1
                  }`}
                  alt="Vista previa Open Graph para WhatsApp"
                  className="w-full h-auto block"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
