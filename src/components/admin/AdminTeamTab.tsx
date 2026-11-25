"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { StaffAvatar } from "@/components/ui/StaffAvatar";
import { DEFAULT_STAFF_AVATAR, getRandomStaffAvatar } from "@/lib/avatars";
import type {
  PortalBusinessSettings,
  PortalService,
  PortalStaffMember,
  PortalUser,
} from "@/types/portal";

export interface StaffModalState {
  id?: string;
  displayName: string;
  specialtyTitle: string;
  email: string;
  phone: string;
  avatarUrl: string;
  serviceIds?: string[];
}

interface AdminTeamTabProps {
  staffList: PortalStaffMember[];
  services: PortalService[];
  allUsers: PortalUser[];
  settings?: PortalBusinessSettings | null;
  onOpenStaffModal: (modal: StaffModalState) => void;
  onSetAllStaffServices: (
    staffObj: PortalStaffMember,
    nextIds: string[]
  ) => void;
  onToggleStaffService: (
    staffObj: PortalStaffMember,
    serviceObj: PortalService
  ) => void;
  getWhatsAppStaffInviteUrl: (staff: PortalStaffMember) => string;
  onPreviewStaffSession: (userId?: string) => void;
  onChangeStaffAvatar: (staffObj: PortalStaffMember) => void;
  onToggleStaffActive: (staffId: string, newActiveState: boolean) => void;
  onOpenVacationModal: (modal: {
    open: boolean;
    staffId: string;
    startDate: string;
    endDate: string;
    reason: string;
  }) => void;
  onDeleteStaff: (staffId: string, name: string) => void;
}

export function AdminTeamTab({
  staffList,
  services,
  allUsers,
  settings,
  onOpenStaffModal,
  onSetAllStaffServices,
  onToggleStaffService,
  getWhatsAppStaffInviteUrl,
  onPreviewStaffSession,
  onChangeStaffAvatar,
  onToggleStaffActive,
  onOpenVacationModal,
  onDeleteStaff,
}: AdminTeamTabProps) {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-bold text-zinc-800 uppercase tracking-wider">
            Equipo Profesional y Accesos ({staffList.length})
          </h2>
          <p className="text-[11px] text-zinc-500">
            Autoriza el correo Google de tu equipo (
            {settings?.staffLabel?.toLowerCase() || "profesionales"} o
            colaboradores) para que gestionen su propia agenda sin modificar los
            datos del negocio.
          </p>
        </div>
        <button
          onClick={() =>
            onOpenStaffModal({
              displayName: "",
              specialtyTitle: "",
              email: "",
              phone: "+591",
              avatarUrl: getRandomStaffAvatar(),
              serviceIds: services.map((s) => s.id),
            })
          }
          className="px-3.5 py-2 rounded-full bg-[#1F1F23] hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Agregar Profesional</span>
        </button>
      </div>

      <div className="space-y-3">
        {staffList.map((st, idx) => {
          const linkedUser =
            st.user || allUsers.find((u) => u.id === st.userId) || null;
          const isPrimaryOwner = linkedUser?.role === "ADMIN" || idx === 0;

          const futureVacations = (st.timeOffs || [])
            .filter(
              (to) =>
                to.type === "VACATION" ||
                new Date(to.endAt).getTime() -
                  new Date(to.startAt).getTime() >
                  24 * 3600 * 1000
            )
            .filter((to) => new Date(to.endAt) >= new Date());

          const myServices = services.filter(
            (s) =>
              st.services?.some((rel) => rel.serviceId === s.id) ||
              s.staff?.some((rel) => rel.staffId === st.id)
          );
          const myServiceIds = myServices.map((s) => s.id);

          return (
            <div
              key={st.id}
              className="p-4 rounded-3xl border border-zinc-200 bg-white shadow-xs space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <StaffAvatar
                    staff={{
                      ...st,
                      avatarUrl: st.avatarUrl || DEFAULT_STAFF_AVATAR,
                    }}
                    className="w-12 h-12 rounded-full border border-zinc-300 bg-zinc-100 shrink-0"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm text-zinc-900">
                        {st.displayName}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isPrimaryOwner
                            ? "bg-[#1F1F23] text-white"
                            : "bg-emerald-100 text-emerald-950 border border-emerald-300"
                        }`}
                      >
                        {isPrimaryOwner
                          ? "👑 ADMIN / DUEÑO"
                          : "🩺 PROFESIONAL AUTORIZADO"}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          st.isActive
                            ? "bg-emerald-100 text-emerald-950 border border-emerald-300"
                            : "bg-amber-100 text-amber-950 border border-amber-300"
                        }`}
                      >
                        {st.isActive ? "🟢 ACTIVO" : "🏖️ EN VACACIONES"}
                      </span>
                      {(!st.userId || !linkedUser) && (
                        <span
                          data-testid="unlinked-staff-badge"
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300"
                        >
                          ⚠️ SIN CUENTA VINCULADA PARA AVISOS
                        </span>
                      )}
                      {linkedUser?.pendingStaffUpgrade && (
                        <span
                          data-testid="pending-invite-badge"
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300"
                        >
                          ⏳ INVITACIÓN PENDIENTE DE VERIFICAR
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-zinc-600 mt-0.5">
                      {st.specialtyTitle || "Especialista"}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      📧 Login Google:{" "}
                      <b className="text-zinc-800">
                        {linkedUser?.email || "Sin correo vinculado"}
                      </b>
                      {linkedUser?.phone ? ` • 📱 ${linkedUser.phone}` : ""}
                    </div>
                    {futureVacations.length > 0 && (
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        {futureVacations.map((v) => (
                          <span
                            key={v.id}
                            className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold"
                          >
                            🏖️ Vacaciones:{" "}
                            {new Date(v.startAt).toLocaleDateString("es-ES", {
                              day: "numeric",
                              month: "short",
                            })}{" "}
                            al{" "}
                            {new Date(v.endAt).toLocaleDateString("es-ES", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-800 font-semibold">
                  ✓ Atender citas propias
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-800 font-semibold">
                  ✓ Bloquear imprevistos y horarios
                </span>
                {isPrimaryOwner ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 font-bold">
                    ✓ Editar Logo, Local, Precios y Equipo
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-zinc-200 text-zinc-700 font-medium">
                    🔒 Sin acceso a Ajustes del Local ni Precios
                  </span>
                )}
              </div>

              <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200 text-xs space-y-2">
                <div className="flex items-center justify-between text-[11px] flex-wrap gap-1.5">
                  <span className="font-bold text-zinc-800">
                    🩺 Servicios habilitados para {st.displayName} (
                    {myServices.length} de {services.length}) —{" "}
                    <span className="text-zinc-500 font-medium">
                      Clic para activar/bloquear:
                    </span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {myServices.length < services.length && (
                      <button
                        type="button"
                        onClick={() =>
                          onSetAllStaffServices(
                            st,
                            services.map((s) => s.id)
                          )
                        }
                        className="px-2.5 py-0.5 rounded-full bg-zinc-200 hover:bg-zinc-300 text-zinc-800 text-[10px] font-bold transition-all"
                      >
                        Habilitar todos
                      </button>
                    )}
                    {myServices.length === 0 && (
                      <span className="text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full font-bold text-[10px]">
                        ⚠️ Sin servicios asignados
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {services.map((s) => {
                    const isEnabled = myServiceIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onToggleStaffService(st, s)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all flex items-center gap-1 active:scale-95 ${
                          isEnabled
                            ? "bg-[#1F1F23] text-white shadow-2xs hover:bg-black"
                            : "bg-white border border-dashed border-zinc-300 text-zinc-400 hover:text-zinc-700 hover:border-zinc-400"
                        }`}
                        title={
                          isEnabled
                            ? `Clic para bloquear "${s.name}" a ${st.displayName}`
                            : `Clic para habilitar "${s.name}" a ${st.displayName}`
                        }
                      >
                        <span>{isEnabled ? "✓" : "○"}</span>
                        <span>{s.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-100 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <a
                    href={getWhatsAppStaffInviteUrl(st)}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 shadow-xs transition-all"
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5" />
                    <span>Enviar invitación WhatsApp</span>
                  </a>

                  {linkedUser && (
                    <button
                      type="button"
                      onClick={() => onPreviewStaffSession(linkedUser.id)}
                      className="px-3 py-1.5 rounded-full bg-zinc-200 hover:bg-zinc-300 text-[#1F1F23] text-[11px] font-bold transition-all"
                    >
                      👁️ Ver como {st.displayName}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      onOpenStaffModal({
                        id: st.id,
                        displayName: st.displayName,
                        specialtyTitle: st.specialtyTitle || "",
                        email: linkedUser?.email || "",
                        phone: linkedUser?.phone || "",
                        avatarUrl: st.avatarUrl || DEFAULT_STAFF_AVATAR,
                        serviceIds: myServiceIds,
                      })
                    }
                    className="px-3 py-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-[11px] font-bold transition-all shadow-2xs"
                  >
                    ✏️ Editar
                  </button>

                  <button
                    type="button"
                    onClick={() => onChangeStaffAvatar(st)}
                    className="px-3 py-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-bold transition-all shadow-2xs"
                    title="Cambiar a otro icono ilustrado aleatorio"
                  >
                    🎲 Cambiar icono
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleStaffActive(st.id, !st.isActive)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer ${
                      st.isActive
                        ? "bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300"
                        : "bg-emerald-600 hover:bg-emerald-700 text-white"
                    }`}
                  >
                    {st.isActive ? "Pausar cuenta" : "🟢 Reanudar atención"}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onOpenVacationModal({
                        open: true,
                        staffId: st.id,
                        startDate: "",
                        endDate: "",
                        reason: "",
                      })
                    }
                    className="px-3 py-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-bold transition-all shadow-2xs"
                  >
                    🏖️ Programar Vacaciones
                  </button>
                </div>

                {!isPrimaryOwner && (
                  <button
                    type="button"
                    onClick={() => onDeleteStaff(st.id, st.displayName)}
                    className="px-2.5 py-1 rounded-full bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-semibold flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Revocar acceso</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
