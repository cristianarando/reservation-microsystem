"use client";

import React, { useId, useState } from "react";
import { AccessibleModal } from "@/components/ui/AccessibleModal";
import { Button } from "@/components/ui/Button";
import { STAFF_AVATAR_PRESETS, getRandomStaffAvatar } from "@/lib/avatars";
import { compressImageFileToDataUrl } from "@/lib/image-utils";
import { StaffModalState } from "../AdminTeamTab";
import type { PortalBusinessSettings, PortalService } from "@/types/portal";

interface StaffFormModalProps {
  staffModal: StaffModalState | null;
  setStaffModal: React.Dispatch<React.SetStateAction<StaffModalState | null>>;
  services: PortalService[];
  settings?: PortalBusinessSettings | null;
  savingStaff: boolean;
  onCreateStaff: () => void;
}

export function StaffFormModal({
  staffModal,
  setStaffModal,
  services,
  settings,
  savingStaff,
  onCreateStaff,
}: StaffFormModalProps) {
  const titleId = useId();
  const displayNameId = useId();
  const specialtyTitleId = useId();
  const emailId = useId();
  const phoneId = useId();
  const [photoError, setPhotoError] = useState<string | null>(null);

  if (!staffModal) return null;

  const isEditing = Boolean(staffModal.id);
  const onClose = () => {
    setPhotoError(null);
    setStaffModal(null);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 256, 0.84);
      setStaffModal({ ...staffModal, avatarUrl: dataUrl });
    } catch (err: unknown) {
      setPhotoError(
        err instanceof Error
          ? err.message
          : "No se pudo procesar la foto seleccionada."
      );
    }
  };

  return (
    <AccessibleModal
      isOpen={Boolean(staffModal)}
      onClose={onClose}
      labelledBy={titleId}
      maxWidthClass="max-w-sm"
      className="rounded-[32px] p-5 sm:p-6"
    >
      <h3 id={titleId} className="text-base font-bold text-zinc-900">
        {isEditing
          ? "✏️ Editar Perfil Profesional"
          : "👨‍⚕️ Agregar Profesional al Equipo"}
      </h3>
      <p className="text-xs text-zinc-500 mt-1">
        {isEditing
          ? "Actualiza nombre público, especialidad, teléfono, foto y servicios asignados."
          : "Pre-autoriza el correo de Google del nuevo doctor o empleado. Al iniciar sesión, tendrá acceso restringido solo a su agenda y horarios."}
      </p>

      <div className="mt-4 space-y-3 text-xs">
        <div>
          <label
            htmlFor={displayNameId}
            className="text-[10px] font-bold text-zinc-600 uppercase block"
          >
            Nombre Completo / Título *
          </label>
          <input
            id={displayNameId}
            type="text"
            value={staffModal.displayName}
            onChange={(e) =>
              setStaffModal({ ...staffModal, displayName: e.target.value })
            }
            placeholder="Ej. Lic. Marcos Paz / Valeria"
            className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 font-semibold text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
          />
        </div>

        <div>
          <label
            htmlFor={specialtyTitleId}
            className="text-[10px] font-bold text-zinc-600 uppercase block"
          >
            Especialidad o Cargo *
          </label>
          <input
            id={specialtyTitleId}
            type="text"
            value={staffModal.specialtyTitle}
            onChange={(e) =>
              setStaffModal({ ...staffModal, specialtyTitle: e.target.value })
            }
            placeholder="Ej. Especialista Principal / Atención General"
            className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 text-base sm:text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
          />
        </div>

        <div>
          <label
            htmlFor={emailId}
            className="text-[10px] font-bold text-zinc-600 uppercase block"
          >
            Correo de Google {isEditing ? "(Vinculado)" : "(Para Login del Empleado) *"}
          </label>
          <input
            id={emailId}
            type="email"
            disabled={isEditing}
            value={staffModal.email}
            onChange={(e) =>
              setStaffModal({ ...staffModal, email: e.target.value })
            }
            placeholder="ejemplo@gmail.com"
            className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 text-base sm:text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 disabled:bg-zinc-100 disabled:text-zinc-500"
          />
          <span className="text-[10px] text-zinc-500 block mt-0.5">
            {isEditing
              ? "El correo Google vinculado no se puede reasignar desde aquí."
              : "Con este correo ingresará a su panel de atención."}
          </span>
        </div>

        <div>
          <label
            htmlFor={phoneId}
            className="text-[10px] font-bold text-zinc-600 uppercase block"
          >
            Teléfono / WhatsApp del Profesional
          </label>
          <input
            id={phoneId}
            type="tel"
            value={staffModal.phone}
            onChange={(e) =>
              setStaffModal({ ...staffModal, phone: e.target.value })
            }
            placeholder="+59170012345"
            className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 text-base sm:text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-zinc-600 uppercase block">
              Foto o Avatar de Perfil
            </span>
            <div className="flex items-center gap-1.5">
              <label className="cursor-pointer px-2.5 py-0.5 rounded-full bg-[#1F1F23] hover:bg-black text-white text-[10px] font-bold transition-all">
                <span>📷 Subir foto</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  setStaffModal({
                    ...staffModal,
                    avatarUrl: getRandomStaffAvatar(staffModal.avatarUrl),
                  })
                }
                className="px-2 py-0.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[10px] font-bold transition-all"
              >
                🎲 Aleatorio
              </button>
            </div>
          </div>
          {staffModal.avatarUrl?.startsWith("data:image/") && (
            <div className="mb-2 flex items-center gap-2 p-2 rounded-2xl bg-zinc-50 border border-zinc-200">
              {/* eslint-disable-next-line @next/next/no-img-element -- Compressed SQLite DataURL preview */}
              <img
                src={staffModal.avatarUrl}
                alt="Vista previa de foto"
                className="w-10 h-10 rounded-full object-cover border border-zinc-300"
              />
              <span className="text-[11px] font-semibold text-zinc-700">
                Foto personalizada cargada
              </span>
            </div>
          )}
          {photoError && (
            <p className="text-[10px] text-red-700 font-semibold mb-1.5">
              {photoError}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {STAFF_AVATAR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  setStaffModal({ ...staffModal, avatarUrl: preset.url })
                }
                title={preset.label}
                aria-label={preset.label}
                aria-pressed={staffModal.avatarUrl === preset.url}
                className={`w-11 h-11 rounded-full overflow-hidden border-2 transition-all bg-zinc-100 ${
                  staffModal.avatarUrl === preset.url
                    ? "border-[#1F1F23] scale-105 shadow-md"
                    : "border-transparent opacity-75 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Static SVG preset avatars */}
                <img
                  src={preset.url}
                  alt={preset.label}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>

        {services.length > 0 && (
          <div className="pt-2 border-t border-zinc-200">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-zinc-700 uppercase block">
                ¿Qué servicios realizará?
              </span>
              <span className="text-[10px] text-zinc-500 font-bold">
                {(staffModal.serviceIds || []).length} de {services.length}
              </span>
            </div>
            <div className="space-y-1 max-h-36 overflow-y-auto p-2 bg-zinc-50 rounded-2xl border border-zinc-200">
              {services.map((svc) => {
                const isChecked = (staffModal.serviceIds || []).includes(svc.id);
                return (
                  <label
                    key={svc.id}
                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all ${
                      isChecked
                        ? "bg-white border border-zinc-300 shadow-2xs"
                        : "hover:bg-zinc-100/70"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const currentIds = staffModal.serviceIds || [];
                          const next = e.target.checked
                            ? [...currentIds, svc.id]
                            : currentIds.filter((id) => id !== svc.id);
                          setStaffModal({
                            ...staffModal,
                            serviceIds: next,
                          });
                        }}
                        className="w-4 h-4 rounded text-zinc-900 accent-zinc-900 cursor-pointer"
                      />
                      <span className="font-bold text-zinc-800 text-xs">
                        {svc.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-semibold">
                      {settings?.currencySymbol || "Bs"}
                      {svc.price}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 flex gap-2">
        <Button
          variant="primary"
          size="pill"
          onClick={onCreateStaff}
          disabled={savingStaff}
          className="flex-1 py-3"
        >
          {savingStaff
            ? "Guardando..."
            : isEditing
            ? "Guardar Cambios"
            : "Autorizar y Crear Cuenta"}
        </Button>
        <Button
          variant="secondary"
          size="pill"
          onClick={onClose}
          className="py-3 px-4"
        >
          Cancelar
        </Button>
      </div>
    </AccessibleModal>
  );
}
