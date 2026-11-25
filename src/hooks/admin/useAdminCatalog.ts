"use client";

import type { ToastItem } from "@/components/ui/ToastContainer";
import type {
  PortalService,
  PortalStaffMember,
  ServiceModalDraft,
} from "@/types/portal";

interface UseAdminCatalogOptions {
  staffList: PortalStaffMember[];
  showToast: (type: ToastItem["type"], title: string, message?: string) => void;
  onRefresh: () => void;
}

export function useAdminCatalog({
  staffList,
  showToast,
  onRefresh,
}: UseAdminCatalogOptions) {
  const handleToggleServiceStaff = async (
    serviceObj: PortalService,
    staffObj: PortalStaffMember
  ) => {
    if (!serviceObj?.id || !staffObj?.id) return;
    const currentStaffIds = staffList
      .filter(
        (st) =>
          serviceObj.staff?.some((rel) => rel.staffId === st.id) ||
          st.services?.some((rel) => rel.serviceId === serviceObj.id)
      )
      .map((st) => st.id);

    const isAssigned = currentStaffIds.includes(staffObj.id);
    const nextStaffIds = isAssigned
      ? currentStaffIds.filter((id) => id !== staffObj.id)
      : [...currentStaffIds, staffObj.id];

    try {
      const res = await fetch("/api/admin/services", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: serviceObj.id,
          staffIds: nextStaffIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(
          "error",
          "Error",
          data.error || "No se pudo actualizar la asignación."
        );
        return;
      }
      showToast(
        isAssigned ? "info" : "success",
        isAssigned ? "Profesional desasignado" : "Profesional asignado",
        isAssigned
          ? `${staffObj.displayName} ya no realiza "${serviceObj.name}".`
          : `${staffObj.displayName} ha sido habilitado para "${serviceObj.name}".`
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

  const handleSaveService = async (
    serviceModal: ServiceModalDraft
  ): Promise<boolean> => {
    if (!serviceModal.name || serviceModal.name.trim().length < 3) {
      showToast(
        "warning",
        "Nombre inválido",
        "El nombre del servicio debe tener al menos 3 caracteres."
      );
      return false;
    }
    if (
      !serviceModal.durationMin ||
      serviceModal.durationMin < 5 ||
      serviceModal.durationMin > 480
    ) {
      showToast(
        "warning",
        "Duración inválida",
        "La duración debe estar entre 5 y 480 minutos."
      );
      return false;
    }
    if (serviceModal.price < 0) {
      showToast(
        "warning",
        "Precio inválido",
        "El precio no puede ser negativo."
      );
      return false;
    }

    try {
      const isEdit = Boolean(serviceModal.id);
      const res = await fetch("/api/admin/services", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...serviceModal,
          staffIds: serviceModal.staffIds || [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(
          "error",
          "No se pudo guardar",
          data.error || "Error al guardar el servicio."
        );
        return false;
      }
      showToast(
        "success",
        isEdit ? "¡Servicio Actualizado!" : "¡Servicio Creado!",
        isEdit
          ? "Los cambios del servicio y profesionales asignados se guardaron correctamente."
          : "El nuevo servicio se ha añadido correctamente al catálogo."
      );
      onRefresh();
      return true;
    } catch (err: unknown) {
      showToast(
        "error",
        "Error",
        err instanceof Error ? err.message : "Error inesperado."
      );
      return false;
    }
  };

  const handleToggleServiceActive = async (serviceObj: PortalService) => {
    if (!serviceObj?.id) return;
    const nextActive = serviceObj.isActive === false;
    try {
      const res = await fetch("/api/admin/services", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: serviceObj.id,
          isActive: nextActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(
          "error",
          "No se pudo actualizar",
          data.error || "Error al cambiar estado del servicio."
        );
        return;
      }
      showToast(
        nextActive ? "success" : "info",
        nextActive ? "Servicio reactivado" : "Servicio archivado",
        nextActive
          ? `"${serviceObj.name}" vuelve a estar disponible para reservas.`
          : `"${serviceObj.name}" fue ocultado del portal público sin perder su historial.`
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

  return {
    handleToggleServiceStaff,
    handleToggleServiceActive,
    handleSaveService,
  };
}
