"use client";

import React from "react";
import { Save, MapPin, Settings } from "lucide-react";
import InteractiveMapPicker from "@/components/InteractiveMapPicker";
import { DEFAULT_BUSINESS_LOGO } from "@/lib/avatars";
import type { PortalBusinessSettings } from "@/types/portal";

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

        <div className="border-[1.5px] border-[#1F1F23] bg-[#F4F4F6] rounded-2xl px-4 py-2">
          <label className="text-[10px] font-bold text-zinc-500 uppercase block">
            Nombre del Negocio
          </label>
          <input
            type="text"
            value={settingsForm?.name || ""}
            onChange={(e) =>
              onUpdateSettingsForm({ ...settingsForm, name: e.target.value })
            }
            className="bg-transparent font-semibold text-base sm:text-sm text-[#1F1F23] focus:outline-none w-full"
          />
        </div>

        <div className="border-[1.5px] border-zinc-300 bg-[#F4F4F6] rounded-2xl px-4 py-2">
          <label className="text-[10px] font-bold text-zinc-500 uppercase block">
            Eslogan o Subtítulo
          </label>
          <input
            type="text"
            value={settingsForm?.tagline || ""}
            onChange={(e) =>
              onUpdateSettingsForm({ ...settingsForm, tagline: e.target.value })
            }
            className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="border-[1.5px] border-zinc-300 bg-[#F4F4F6] rounded-2xl px-4 py-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase block">
              Etiqueta de Profesionales
            </label>
            <input
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

          <div className="border-[1.5px] border-zinc-300 bg-[#F4F4F6] rounded-2xl px-4 py-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase block">
              Símbolo de Moneda
            </label>
            <input
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

        <div className="border-[1.5px] border-zinc-300 bg-[#F4F4F6] rounded-2xl px-4 py-2">
          <label className="text-[10px] font-bold text-zinc-500 uppercase block">
            Dirección Física
          </label>
          <input
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

          <div className="border-[1.5px] border-zinc-200 bg-[#F4F4F6] rounded-xl px-3 py-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-0.5">
              Enlace de Google Maps (Sincronizado Automáticamente)
            </label>
            <input
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

        <div className="border-[1.5px] border-zinc-300 bg-[#F4F4F6] rounded-2xl px-4 py-2">
          <label className="text-[10px] font-bold text-zinc-500 uppercase block">
            Teléfono / WhatsApp de Notificaciones
          </label>
          <input
            type="text"
            value={settingsForm?.phoneWhatsapp || ""}
            onChange={(e) =>
              onUpdateSettingsForm({
                ...settingsForm,
                phoneWhatsapp: e.target.value,
              })
            }
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
            <div className="border-[1.5px] border-zinc-300 bg-white rounded-2xl px-4 py-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase block">
                Ventana de Reserva Base (Días)
              </label>
              <input
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
              <span className="text-[10px] text-zinc-400 block mt-0.5">
                Anticipación máxima por defecto
              </span>
            </div>

            <div className="border-[1.5px] border-zinc-300 bg-white rounded-2xl px-4 py-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase block">
                Aviso Previo Mínimo Base
              </label>
              <select
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
              <span className="text-[10px] text-zinc-400 block mt-0.5">
                Margen de antelación para el mismo día
              </span>
            </div>

            <div className="border-[1.5px] border-zinc-300 bg-white rounded-2xl px-4 py-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase block">
                Horas Mínimas Cancelación
              </label>
              <input
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
              <span className="text-[10px] text-zinc-400 block mt-0.5">
                Regla global para cancelar sin falta
              </span>
            </div>
          </div>
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
