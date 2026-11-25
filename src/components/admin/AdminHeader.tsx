"use client";

import React from "react";
import { Bell, BellOff, Stethoscope, Shield } from "lucide-react";
import { DEFAULT_BUSINESS_LOGO } from "@/lib/avatars";
import { DevicePushState } from "@/lib/push-client";
import type {
  PortalBusinessSettings,
  PortalStaffMember,
  PortalUser,
} from "@/types/portal";

export type AdminTabId =
  | "agenda"
  | "shifts"
  | "team"
  | "services"
  | "customers"
  | "settings";

interface AdminHeaderProps {
  settings?: PortalBusinessSettings | null;
  currentUser?: PortalUser | null;
  isOwnerAdmin: boolean;
  isProviderOnly: boolean;
  isImpersonating: boolean;
  impersonatorId?: string | null;
  pushState: DevicePushState;
  pushBusy: boolean;
  testingPush: boolean;
  notifyAllStaffPref: boolean;
  hasOwnStaffProfile: boolean;
  selectedStaffId: string;
  staffList: PortalStaffMember[];
  activeTab: AdminTabId;
  visibleTabs: { id: AdminTabId; label: string }[];
  onToggleAdminPush: () => void;
  onTestAdminPush: () => void;
  onToggleNotifyAllStaff: () => void;
  onSelectStaffId: (staffId: string) => void;
  onSelectTab: (tabId: AdminTabId) => void;
  onPreviewStaffSession: (userId?: string) => void;
}

export function AdminHeader({
  settings,
  currentUser,
  isOwnerAdmin,
  isProviderOnly,
  isImpersonating,
  impersonatorId,
  pushState,
  pushBusy,
  testingPush,
  notifyAllStaffPref,
  hasOwnStaffProfile,
  selectedStaffId,
  staffList,
  activeTab,
  visibleTabs,
  onToggleAdminPush,
  onTestAdminPush,
  onToggleNotifyAllStaff,
  onSelectStaffId,
  onSelectTab,
  onPreviewStaffSession,
}: AdminHeaderProps) {
  return (
    <>
      <header className="p-3.5 sm:p-4 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between md:sticky md:top-[44px] bg-white z-30 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-full overflow-hidden border border-zinc-300 bg-zinc-100 flex-shrink-0 shadow-xs">
            {/* eslint-disable-next-line @next/next/no-img-element -- Supports arbitrary SVG defaults and base64 DataURLs uploaded in settings */}
            <img
              src={settings?.logoUrl || DEFAULT_BUSINESS_LOGO}
              alt={settings?.name || "Logo"}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                data-testid="staff-role-badge"
                data-role={currentUser?.role || "PROVIDER"}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                  isOwnerAdmin
                    ? "bg-[#1F1F23] text-white"
                    : "bg-emerald-700 text-white"
                }`}
              >
                {isOwnerAdmin
                  ? "👑 ADMIN / DUEÑO PRINCIPAL"
                  : "🩺 MODO PROFESIONAL"}
              </span>
              <span className="text-xs font-semibold text-zinc-600 truncate">
                {currentUser?.name || "Admin"}
              </span>
            </div>
            <h1 className="font-bold text-base tracking-tight text-[#1F1F23] mt-0.5 truncate">
              {settings?.name || "Mi Negocio"}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            disabled={pushBusy || isImpersonating}
            onClick={onToggleAdminPush}
            data-testid="admin-push-toggle-btn"
            title={
              isImpersonating
                ? "Deshabilitado durante la vista previa de otro profesional"
                : pushState === "subscribed"
                ? "Desactivar notificaciones en este dispositivo"
                : pushState === "insecure_context"
                ? "Las notificaciones Web Push requieren acceder mediante HTTPS"
                : pushState === "denied"
                ? "Permiso bloqueado en Chrome (haz clic para ver cómo habilitarlo)"
                : "Activar avisos en este dispositivo"
            }
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
              pushState === "subscribed" && !isImpersonating
                ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                : pushState === "insecure_context" || pushState === "denied"
                ? "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100"
                : "bg-zinc-100 border-zinc-300 text-zinc-700 hover:bg-zinc-200"
            } disabled:opacity-50`}
          >
            {pushState === "subscribed" && !isImpersonating ? (
              <>
                <Bell className="w-3.5 h-3.5 text-emerald-700" />
                <span>Avisos activos</span>
              </>
            ) : (
              <>
                <BellOff className="w-3.5 h-3.5 text-zinc-500" />
                <span>
                  {isImpersonating
                    ? "Vista previa (sin vincular push)"
                    : pushState === "insecure_context"
                    ? "Avisos (Requiere HTTPS)"
                    : pushState === "denied"
                    ? "Avisos bloqueados"
                    : "Activar avisos en este dispositivo"}
                </span>
              </>
            )}
          </button>

          {pushState === "subscribed" && !isImpersonating && (
            <button
              type="button"
              disabled={testingPush}
              onClick={onTestAdminPush}
              data-testid="admin-push-test-btn"
              title="Enviar una notificación Web Push real desde el servidor a este navegador"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold border border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50 transition-all disabled:opacity-50"
            >
              <span>{testingPush ? "Probando..." : "Probar"}</span>
            </button>
          )}

          {isOwnerAdmin && (
            <button
              type="button"
              onClick={onToggleNotifyAllStaff}
              disabled={!hasOwnStaffProfile}
              data-testid="admin-notify-scope-btn"
              title={
                hasOwnStaffProfile
                  ? "Elige si deseas recibir alertas solo de tu propia agenda o de todo el equipo"
                  : "Como administrador sin agenda propia, recibes alertas de todo el equipo automáticamente"
              }
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                notifyAllStaffPref || !hasOwnStaffProfile
                  ? "bg-[#1F1F23] border-[#1F1F23] text-white"
                  : "bg-zinc-100 border-zinc-300 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              <span>
                {!hasOwnStaffProfile
                  ? "🔔 Avisos: Equipo (auto)"
                  : notifyAllStaffPref
                  ? "🔔 Avisos: Equipo"
                  : "🔕 Avisos: Solo míos"}
              </span>
            </button>
          )}

          {isOwnerAdmin ? (
            <div className="flex items-center gap-1.5 bg-zinc-100 border border-zinc-300 rounded-full px-3 py-1.5 w-full sm:w-auto">
              <span className="text-[10px] uppercase font-bold text-zinc-500 whitespace-nowrap">
                Agenda:
              </span>
              <select
                value={selectedStaffId}
                onChange={(e) => onSelectStaffId(e.target.value)}
                aria-label="Seleccionar profesional"
                className="text-base sm:text-xs font-bold bg-transparent text-[#1F1F23] focus:outline-none cursor-pointer flex-1 min-w-0"
              >
                <option value="ALL">👥 Todo el equipo</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-xs font-bold bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-full px-3 py-1.5 flex items-center gap-1.5 whitespace-nowrap">
              <Stethoscope className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span className="truncate">
                {staffList.find((s) => s.id === selectedStaffId)?.displayName ||
                  currentUser?.name}
              </span>
            </div>
          )}
        </div>
      </header>

      {isProviderOnly && (
        <div className="mx-4 mt-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2 text-xs text-emerald-950">
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
            <div>
              <b>Cuenta de Profesional ({currentUser?.email}):</b> Puedes
              gestionar tu propia agenda, asistencias y bloquear imprevistos o
              ajustar tus horarios. Los datos de la empresa, logo y catálogo
              están protegidos y solo los administra el Dueño.
            </div>
          </div>
          {impersonatorId && (
            <button
              onClick={() => onPreviewStaffSession(impersonatorId)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full bg-[#1F1F23] text-white text-[11px] font-bold hover:bg-black transition-all"
            >
              👑 Volver a Admin
            </button>
          )}
        </div>
      )}

      <div className="p-3 bg-zinc-50 border-b border-zinc-200 overflow-x-auto no-scrollbar pill-slider">
        <div
          role="tablist"
          aria-label="Secciones de administración"
          className="bg-zinc-200 p-1 rounded-full flex gap-1 min-w-max border border-zinc-300"
        >
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`min-h-[44px] sm:min-h-[36px] px-4 py-2 rounded-full text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 ${
                activeTab === tab.id
                  ? "bg-[var(--brand-primary,#1F1F23)] text-[var(--brand-primary-fg,#FFFFFF)] shadow-sm"
                  : "text-[#1F1F23] hover:bg-zinc-300/70"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
