"use client";

import React, { useState } from "react";
import type { ToastItem } from "@/components/ui/ToastContainer";
import type { ConfirmModalState } from "@/components/ui/ConfirmModal";
import { getRandomStaffAvatar } from "@/lib/avatars";
import type { StaffModalState } from "@/components/admin/AdminTeamTab";
import type { PortalService, PortalStaffMember } from "@/types/portal";

interface UseAdminTeamOptions {
  services: PortalService[];
  isOwnerAdmin: boolean;
  staffModal: StaffModalState | null;
  setStaffModal: React.Dispatch<React.SetStateAction<StaffModalState | null>>;
  setConfirmDialog: React.Dispatch<
    React.SetStateAction<ConfirmModalState | null>
  >;
  notifyAllStaffPref: boolean;
  setNotifyAllStaffPref: (val: boolean) => void;
  showToast: (type: ToastItem["type"], title: string, message?: string) => void;
  onRefresh: () => void;
}

export function useAdminTeam({
  services,
  isOwnerAdmin,
  staffModal,
  setStaffModal,
  setConfirmDialog,
  notifyAllStaffPref,
  setNotifyAllStaffPref,
  showToast,
  onRefresh,
}: UseAdminTeamOptions) {
  const [savingStaff, setSavingStaff] = useState(false);

  const handleToggleNotifyAllStaff = async () => {
    if (!isOwnerAdmin) return;
    const nextVal = !notifyAllStaffPref;
    setNotifyAllStaffPref(nextVal);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyAllStaff: nextVal }),
      });
      if (!res.ok) {
        setNotifyAllStaffPref(!nextVal);
        showToast(
          "error",
          "Error",
          "No se pudo actualizar la preferencia de avisos."
        );
        return;
      }
      showToast(
        "info",
        nextVal
          ? "Avisos de todo el equipo activados"
          : "Avisos limitados a tu propia agenda",
        nextVal
          ? "Recibirás alertas cuando cualquier profesional reciba o cancele citas."
          : "La vista de equipo sigue disponible, pero solo recibirás alertas de tu propia agenda."
      );
      onRefresh();
    } catch {
      setNotifyAllStaffPref(!nextVal);
    }
  };

  const handleChangeStaffAvatar = async (staffObj: PortalStaffMember) => {
    const nextAvatar = getRandomStaffAvatar(staffObj.avatarUrl || undefined);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: staffObj.id, avatarUrl: nextAvatar }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(
          "error",
          "No se pudo actualizar",
          data.error || "Error al actualizar el icono."
        );
        return;
      }
      showToast(
        "success",
        "Icono actualizado",
        `Se asignó un nuevo icono ilustrado a ${staffObj.displayName}.`
      );
      onRefresh();
    } catch (err: unknown) {
      showToast(
        "error",
        "Error",
        err instanceof Error ? err.message : "Error inesperado."
      );
    }
  };

  const handleToggleStaffActive = async (
    staffId: string,
    newActiveState: boolean
  ) => {
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, isActive: newActiveState }),
      });
      const data = await res
        .json()
        .catch(() => ({ error: "Error en respuesta del servidor." }));
      if (!res.ok) {
        showToast(
          "error",
          "Error",
          data.error || "No se pudo actualizar el estado."
        );
        return;
      }
      const effectiveActive =
        typeof data.effectiveIsActive === "boolean"
          ? data.effectiveIsActive
          : typeof data.staff?.isActive === "boolean"
          ? data.staff.isActive
          : newActiveState;
      showToast(
        "success",
        effectiveActive
          ? "¡Agenda Reanudada!"
          : "🏖️ ¡Modo Vacaciones Activado!",
        effectiveActive
          ? "El profesional vuelve a estar visible en el portal para recibir reservas."
          : "El profesional ha sido pausado y ocultado del portal de reservas."
      );
      onRefresh();
    } catch (err: unknown) {
      showToast(
        "error",
        "Error",
        err instanceof Error ? err.message : "Error inesperado."
      );
    }
  };

  const getAssignedServiceIdsForStaff = (
    staffObj?: PortalStaffMember | null
  ): string[] => {
    if (!staffObj) return [];
    return services
      .filter(
        (svc) =>
          staffObj.services?.some((rel) => rel.serviceId === svc.id) ||
          svc.staff?.some((rel) => rel.staffId === staffObj.id)
      )
      .map((svc) => svc.id);
  };

  const handleToggleStaffService = async (
    staffObj: PortalStaffMember,
    serviceObj: PortalService
  ) => {
    if (!staffObj?.id || !serviceObj?.id) return;
    const currentIds = getAssignedServiceIdsForStaff(staffObj);
    const isCurrentlyAssigned = currentIds.includes(serviceObj.id);
    const nextIds = isCurrentlyAssigned
      ? currentIds.filter((id) => id !== serviceObj.id)
      : [...currentIds, serviceObj.id];

    try {
      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: staffObj.id,
          serviceIds: nextIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(
          "error",
          "Error",
          data.error || "No se pudo actualizar los servicios."
        );
        return;
      }
      showToast(
        isCurrentlyAssigned ? "info" : "success",
        isCurrentlyAssigned
          ? "Servicio bloqueado para este profesional"
          : "Servicio habilitado",
        isCurrentlyAssigned
          ? `${staffObj.displayName} ya no recibirá citas de "${serviceObj.name}".`
          : `${staffObj.displayName} ahora atiende "${serviceObj.name}".`
      );
      onRefresh();
    } catch (err: unknown) {
      showToast(
        "error",
        "Error",
        err instanceof Error ? err.message : "Error inesperado."
      );
    }
  };

  const handleSetAllStaffServices = async (
    staffObj: PortalStaffMember,
    nextIds: string[]
  ) => {
    if (!staffObj?.id) return;
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: staffObj.id,
          serviceIds: nextIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(
          "error",
          "Error",
          data.error || "No se pudo habilitar los servicios."
        );
        return;
      }
      showToast(
        "success",
        "Servicios actualizados",
        `Se actualizaron los servicios asignados a ${staffObj.displayName}.`
      );
      onRefresh();
    } catch (err: unknown) {
      showToast(
        "error",
        "Error",
        err instanceof Error ? err.message : "Error inesperado."
      );
    }
  };

  const handleCreateStaff = async () => {
    if (!staffModal) return;
    const { id, displayName, specialtyTitle, email, phone, avatarUrl } =
      staffModal;
    const isEditing = Boolean(id);
    if (!displayName || displayName.trim().length < 3) {
      showToast(
        "warning",
        "Nombre requerido",
        "Ingresa el nombre completo del profesional (mínimo 3 caracteres)."
      );
      return;
    }
    if (!specialtyTitle || specialtyTitle.trim().length < 3) {
      showToast(
        "warning",
        "Especialidad requerida",
        "Ingresa la especialidad o cargo del profesional."
      );
      return;
    }
    const emailClean = (email || "").trim().toLowerCase();
    if (!isEditing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      showToast(
        "warning",
        "Correo inválido",
        "Ingresa un correo de Google válido (ej. doctor@clinica.com) para vincular su acceso."
      );
      return;
    }

    setSavingStaff(true);
    try {
      const res = await fetch("/api/admin/staff", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEditing
            ? {
                staffId: id,
                displayName: displayName.trim(),
                specialtyTitle: specialtyTitle.trim(),
                phone: phone.trim(),
                avatarUrl: avatarUrl.trim(),
                serviceIds: staffModal.serviceIds ?? services.map((s) => s.id),
              }
            : {
                displayName: displayName.trim(),
                specialtyTitle: specialtyTitle.trim(),
                email: emailClean,
                phone: phone.trim(),
                avatarUrl: avatarUrl.trim(),
                serviceIds: staffModal.serviceIds ?? services.map((s) => s.id),
              }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(
          "error",
          isEditing ? "Error al actualizar" : "Error al autorizar",
          data.error || "No se pudo guardar al profesional"
        );
        return;
      }
      setStaffModal(null);
      showToast(
        "success",
        isEditing ? "¡Perfil Actualizado!" : "¡Profesional Autorizado!",
        isEditing
          ? `Los datos y foto de ${displayName.trim()} fueron actualizados.`
          : `Cuenta de ${displayName} habilitada con éxito para ${emailClean}. Ya puede iniciar sesión.`
      );
      onRefresh();
    } catch (err: unknown) {
      showToast(
        "error",
        "Error",
        err instanceof Error ? err.message : "Error inesperado."
      );
    } finally {
      setSavingStaff(false);
    }
  };

  const handleDeleteStaff = (staffId: string, name: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "¿Revocar acceso profesional?",
      message: `¿Estás seguro de revocar el acceso de ${name}? Su cuenta pasará a rol Cliente y ya no aparecerá en el selector de reservas de la clínica.`,
      confirmLabel: "Revocar Acceso",
      onConfirm: async () => {
        try {
          const res = await fetch(
            `/api/admin/staff?staffId=${encodeURIComponent(staffId)}`,
            { method: "DELETE" }
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            showToast(
              "error",
              "Error al revocar acceso",
              data.error || "No se pudo eliminar el profesional"
            );
            return;
          }
          showToast(
            "success",
            "Acceso Revocado",
            `Se revocó el perfil profesional de ${name}.`
          );
          onRefresh();
        } catch (err: unknown) {
          showToast(
            "error",
            "Error",
            err instanceof Error ? err.message : "Error inesperado."
          );
        }
      },
    });
  };

  const handlePreviewStaffSession = async (userId?: string) => {
    if (!userId) return;
    try {
      const res = await fetch("/api/auth/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        onRefresh();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(
          "error",
          "No se pudo cambiar de sesión",
          data.error || "Acción no autorizada."
        );
      }
    } catch (err: unknown) {
      showToast(
        "error",
        "Error",
        err instanceof Error ? err.message : "Error al cambiar de sesión."
      );
    }
  };

  return {
    savingStaff,
    handleToggleNotifyAllStaff,
    handleChangeStaffAvatar,
    handleToggleStaffActive,
    handleToggleStaffService,
    handleSetAllStaffServices,
    handleCreateStaff,
    handleDeleteStaff,
    handlePreviewStaffSession,
  };
}
