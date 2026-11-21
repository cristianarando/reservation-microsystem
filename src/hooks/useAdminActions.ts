"use client";

import React, { useState, useCallback } from "react";
import { ToastItem } from "@/components/ui/ToastContainer";
import { ConfirmModalState } from "@/components/ui/ConfirmModal";
import { compressImageFileToDataUrl } from "@/lib/image-utils";
import { getRandomStaffAvatar } from "@/lib/avatars";
import {
  ImprevistoModalState,
  ConflictDataState,
  VacationModalState,
} from "@/components/admin/AdminOperationModals";
import { StaffModalState } from "@/components/admin/AdminTeamTab";
import type {
  PortalAppointment,
  PortalBusinessSettings,
  PortalService,
  PortalStaffMember,
} from "@/types/portal";

type SettingsFormUpdater =
  | PortalBusinessSettings
  | ((prev: PortalBusinessSettings) => PortalBusinessSettings);

interface UseAdminActionsOptions {
  settings?: PortalBusinessSettings | null;
  services: PortalService[];
  staffList: PortalStaffMember[];
  isOwnerAdmin: boolean;
  agendaDateStr: string;
  selectedStaffId: string;
  onSelectStaffId: (id: string) => void;
  setAllAppointments: (apts: PortalAppointment[]) => void;
  imprevistoModal: ImprevistoModalState;
  setImprevistoModal: React.Dispatch<React.SetStateAction<ImprevistoModalState>>;
  conflictData: ConflictDataState | null;
  setConflictData: React.Dispatch<
    React.SetStateAction<ConflictDataState | null>
  >;
  vacationModal: VacationModalState;
  setVacationModal: React.Dispatch<React.SetStateAction<VacationModalState>>;
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

const DEFAULT_SETTINGS_FORM: PortalBusinessSettings = {
  name: "Mi Negocio",
  tagline: "",
  staffLabel: "Especialista",
  currencySymbol: "Bs",
  addressText: "",
  phoneWhatsapp: "",
};

export function useAdminActions({
  settings,
  services,
  staffList,
  isOwnerAdmin,
  agendaDateStr,
  selectedStaffId,
  onSelectStaffId,
  setAllAppointments,
  imprevistoModal,
  setImprevistoModal,
  conflictData,
  setConflictData,
  vacationModal,
  setVacationModal,
  staffModal,
  setStaffModal,
  setConfirmDialog,
  notifyAllStaffPref,
  setNotifyAllStaffPref,
  showToast,
  onRefresh,
}: UseAdminActionsOptions) {
  const [savingStaff, setSavingStaff] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Track user draft paired with server updatedAt to avoid overwriting unsaved edits on poll
  const [settingsDraft, setSettingsDraft] = useState<{
    serverStamp: string;
    value: PortalBusinessSettings;
  } | null>(null);

  const serverStamp = `${settings?.id || ""}:${settings?.updatedAt || ""}`;
  const settingsForm: PortalBusinessSettings =
    settingsDraft && settingsDraft.serverStamp === serverStamp
      ? settingsDraft.value
      : settings || DEFAULT_SETTINGS_FORM;

  const setSettingsForm = useCallback(
    (updater: SettingsFormUpdater) => {
      setSettingsDraft((prev) => {
        const base =
          prev && prev.serverStamp === serverStamp
            ? prev.value
            : settings || DEFAULT_SETTINGS_FORM;
        const nextValue =
          typeof updater === "function" ? updater(base) : updater;
        return { serverStamp, value: nextValue };
      });
    },
    [serverStamp, settings]
  );

  const loadDayAppointments = useCallback(() => {
    fetch("/api/bootstrap", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json().catch(() => null);
      })
      .then((data) => {
        if (!data) return;
        const apts = (data.allAppointments ||
          data.userAppointments ||
          []) as PortalAppointment[];
        setAllAppointments(apts);
      })
      .catch((err) => console.error("Error loading appointments:", err));
  }, [setAllAppointments]);

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
      if (res.ok) {
        showToast(
          "success",
          "Icono actualizado",
          `Se asignó un nuevo icono ilustrado a ${staffObj.displayName}.`
        );
        onRefresh();
      }
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
      if (res.ok) {
        showToast(
          "success",
          "Servicios actualizados",
          `Se actualizaron los servicios asignados a ${staffObj.displayName}.`
        );
        onRefresh();
      }
    } catch (err: unknown) {
      showToast(
        "error",
        "Error",
        err instanceof Error ? err.message : "Error inesperado."
      );
    }
  };

  const handleToggleServiceStaff = async (
    serviceObj: {
      id: string;
      name: string;
      staff?: Array<{ staffId: string }>;
    },
    staffObj: {
      id: string;
      displayName: string;
      services?: Array<{ serviceId: string }>;
    }
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

  const handleQuickImprevisto = async (
    resolution?: string,
    overrideStaffId?: string
  ) => {
    let startAt = new Date(`${agendaDateStr}T00:00:00`);
    let endAt = new Date(`${agendaDateStr}T09:30:00`);

    if (imprevistoModal.type === "LATE_START") {
      startAt = new Date(`${agendaDateStr}T00:00:00`);
      endAt = new Date(`${agendaDateStr}T${imprevistoModal.timeStr}:00`);
    } else if (imprevistoModal.type === "EARLY_LEAVE") {
      startAt = new Date(`${agendaDateStr}T${imprevistoModal.timeStr}:00`);
      endAt = new Date(`${agendaDateStr}T23:59:59`);
    } else if (imprevistoModal.type === "FULL_DAY_OFF") {
      startAt = new Date(`${agendaDateStr}T00:00:00`);
      endAt = new Date(`${agendaDateStr}T23:59:59`);
    }

    const targetStaffId =
      overrideStaffId || imprevistoModal.staffId || selectedStaffId;

    try {
      const res = await fetch("/api/admin/day-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: targetStaffId,
          type: imprevistoModal.type,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          reason: imprevistoModal.reason || "Imprevisto de agenda",
          resolution,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(
          "error",
          "No se pudo aplicar el bloqueo",
          data.error || "Error en el servidor."
        );
        return;
      }

      if (data.hasConflicts && !resolution) {
        setConflictData({
          open: true,
          conflicts: data.affectedAppointments || [],
          blockStart: startAt.toISOString(),
          blockEnd: endAt.toISOString(),
          type: imprevistoModal.type,
          reason: imprevistoModal.reason,
        });
        return;
      }

      if (targetStaffId && targetStaffId !== selectedStaffId) {
        onSelectStaffId(targetStaffId);
      }
      setImprevistoModal((prev) => ({ ...prev, open: false }));
      setConflictData(null);
      showToast(
        "success",
        "¡Imprevisto Guardado!",
        data.conflictsResolved > 0
          ? `Se cerró el horario y se notificó la cancelación de ${data.conflictsResolved} cita(s) al cliente.`
          : "El bloqueo de horario se aplicó correctamente."
      );
      loadDayAppointments();
      onRefresh();
    } catch (err: unknown) {
      showToast(
        "error",
        "Error al guardar imprevisto",
        err instanceof Error ? err.message : "Error inesperado."
      );
    }
  };

  const handleDeleteTimeOff = async (timeOffId: string) => {
    try {
      const res = await fetch(
        `/api/admin/day-override?id=${encodeURIComponent(timeOffId)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(
          "error",
          "No se pudo quitar el bloqueo",
          data.error || "Error al eliminar bloqueo."
        );
        return;
      }
      showToast(
        "success",
        "Horario Reabierto",
        "El bloqueo de agenda fue eliminado y los turnos vuelven a estar disponibles."
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

  const handleScheduleVacation = async (resolution?: string) => {
    if (!vacationModal.startDate || !vacationModal.endDate) {
      showToast(
        "warning",
        "Fechas incompletas",
        "Por favor selecciona la fecha de inicio y de fin de las vacaciones."
      );
      return;
    }
    if (vacationModal.startDate > vacationModal.endDate) {
      showToast(
        "warning",
        "Rango inválido",
        "La fecha de inicio debe ser anterior o igual a la fecha de fin."
      );
      return;
    }

    const startAt = new Date(`${vacationModal.startDate}T00:00:00`);
    const endAt = new Date(`${vacationModal.endDate}T23:59:59`);
    const targetStaffId = vacationModal.staffId || selectedStaffId;

    try {
      const res = await fetch("/api/admin/day-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: targetStaffId,
          type: "VACATION",
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          reason: vacationModal.reason.trim() || null,
          resolution: resolution || (conflictData ? "CANCEL_ALL" : undefined),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(
          "error",
          "No se pudo guardar",
          data.error || "Error al programar vacaciones."
        );
        return;
      }

      if (data.hasConflicts && !resolution) {
        setConflictData({
          open: true,
          conflicts: data.affectedAppointments || [],
          blockStart: startAt.toISOString(),
          blockEnd: endAt.toISOString(),
          type: "VACATION",
          reason: vacationModal.reason,
        });
        return;
      }

      setVacationModal((prev) => ({ ...prev, open: false }));
      setConflictData(null);
      showToast(
        "success",
        "🏖️ ¡Vacaciones Programadas!",
        `El periodo del ${vacationModal.startDate} al ${vacationModal.endDate} ha quedado reservado y bloqueado para citas.`
      );
      onRefresh();
    } catch (err: unknown) {
      showToast(
        "error",
        "Error al programar vacaciones",
        err instanceof Error ? err.message : "Error inesperado."
      );
    }
  };

  const handleStatusChange = async (
    aptId: string,
    status: string,
    blockCustomer?: boolean,
    customReason?: string
  ) => {
    try {
      const reason =
        customReason ||
        (status === "CANCELLED"
          ? "Cancelada por el profesional / imprevisto de agenda"
          : undefined);
      const res = await fetch(`/api/admin/appointments/${aptId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, blockCustomer, reason }),
      });
      if (res.ok) {
        if (status === "CANCELLED") {
          showToast(
            "info",
            "Cita cancelada",
            "Se canceló la cita y se envió el aviso automático al portal del cliente."
          );
        }
        loadDayAppointments();
        onRefresh();
      }
    } catch (err: unknown) {
      showToast(
        "error",
        "Error al actualizar estado",
        err instanceof Error ? err.message : "Error inesperado."
      );
    }
  };

  const handleCancelAllDayAppointments = async (
    targetApts: PortalAppointment[]
  ) => {
    if (!targetApts || targetApts.length === 0) return;
    try {
      for (const apt of targetApts) {
        await fetch(`/api/admin/appointments/${apt.id}/status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "CANCELLED",
            reason: `No atiendo el ${agendaDateStr} por descanso/imprevisto`,
          }),
        });
      }
      showToast(
        "success",
        `¡${targetApts.length} cita(s) cancelada(s)!`,
        "Todas las citas seleccionadas fueron canceladas y los clientes recibieron el aviso para reagendar."
      );
      loadDayAppointments();
      onRefresh();
    } catch (err: unknown) {
      showToast(
        "error",
        "Error al cancelar citas",
        err instanceof Error ? err.message : "Error inesperado."
      );
    }
  };

  const handleToggleBlockUser = async (userId: string, isBlocked: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/toggle-block`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isBlocked: !isBlocked,
          resetNoShows: isBlocked ? true : false,
        }),
      });
      if (res.ok) {
        showToast(
          isBlocked ? "success" : "warning",
          isBlocked ? "Cliente Desbloqueado" : "Cliente Bloqueado",
          isBlocked
            ? "El cliente puede volver a realizar reservas en línea."
            : "Se bloqueó el acceso de reserva en línea para este cliente."
        );
        onRefresh();
      }
    } catch (err: unknown) {
      showToast(
        "error",
        "Error al cambiar bloqueo",
        err instanceof Error ? err.message : "Error inesperado."
      );
    }
  };

  const handleResetUserStrikes = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/toggle-block`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBlocked: false, resetNoShows: true }),
      });
      if (res.ok) {
        showToast(
          "success",
          "Historial Limpiado",
          "Se reiniciaron las inasistencias y se desbloqueó al cliente."
        );
        onRefresh();
      }
    } catch (err: unknown) {
      showToast(
        "error",
        "Error al resetear inasistencias",
        err instanceof Error ? err.message : "Error inesperado."
      );
    }
  };

  const handleLogoFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 256, 0.88);
      setSettingsForm((prev) => ({ ...prev, logoUrl: dataUrl }));
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "No se pudo procesar la imagen seleccionada.";
      showToast("warning", "Formato de imagen inválido", msg);
    }
  };

  const handleCreateStaff = async () => {
    if (!staffModal) return;
    const { displayName, specialty, email, phone, bio, avatarUrl } = staffModal;
    if (!displayName || displayName.trim().length < 3) {
      showToast(
        "warning",
        "Nombre requerido",
        "Ingresa el nombre completo del profesional (mínimo 3 caracteres)."
      );
      return;
    }
    if (!specialty || specialty.trim().length < 3) {
      showToast(
        "warning",
        "Especialidad requerida",
        "Ingresa la especialidad o cargo del profesional."
      );
      return;
    }
    const emailClean = (email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          specialty: specialty.trim(),
          specialtyTitle: specialty.trim(),
          email: emailClean,
          phone: phone.trim(),
          bio: bio.trim(),
          avatarUrl: avatarUrl.trim(),
          serviceIds: staffModal.serviceIds ?? services.map((s) => s.id),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(
          "error",
          "Error al autorizar",
          data.error || "No se pudo registrar al profesional"
        );
        return;
      }
      setStaffModal(null);
      showToast(
        "success",
        "¡Profesional Autorizado!",
        `Cuenta de ${displayName} habilitada con éxito para ${emailClean}. Ya puede iniciar sesión.`
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
          const res = await fetch(`/api/admin/staff?staffId=${staffId}`, {
            method: "DELETE",
          });
          const data = await res.json();
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
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveSettings = async () => {
    if (!isOwnerAdmin) {
      showToast(
        "warning",
        "Permiso denegado",
        "Solo el Administrador / Dueño principal puede modificar los datos del negocio."
      );
      return;
    }
    if (!settingsForm?.name || settingsForm.name.trim().length < 3) {
      showToast(
        "warning",
        "Nombre inválido",
        "El nombre del negocio debe tener al menos 3 caracteres."
      );
      return;
    }
    if (!settingsForm?.addressText || settingsForm.addressText.trim().length < 5) {
      showToast(
        "warning",
        "Dirección requerida",
        "Por favor ingresa una dirección física válida."
      );
      return;
    }
    const phoneDigits = (settingsForm?.phoneWhatsapp || "").replace(/\D/g, "");
    if (phoneDigits.length < 8) {
      showToast(
        "warning",
        "Teléfono inválido",
        "El teléfono / WhatsApp del negocio debe tener al menos 8 dígitos."
      );
      return;
    }

    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      if (res.ok) {
        setSettingsDraft(null);
        showToast(
          "success",
          "¡Ajustes Guardados!",
          "La configuración del negocio, horarios globales y logo se guardaron con éxito."
        );
        onRefresh();
      } else {
        const err = await res.json();
        showToast(
          "error",
          "Error al guardar ajustes",
          err.error || "No se pudieron actualizar los ajustes."
        );
      }
    } catch (err: unknown) {
      showToast(
        "error",
        "Error de conexión",
        err instanceof Error ? err.message : "Error inesperado."
      );
    } finally {
      setSavingSettings(false);
    }
  };

  return {
    savingStaff,
    savingSettings,
    settingsForm,
    setSettingsForm,
    handleToggleNotifyAllStaff,
    handleChangeStaffAvatar,
    handleToggleStaffActive,
    handleToggleStaffService,
    handleSetAllStaffServices,
    handleToggleServiceStaff,
    handleQuickImprevisto,
    handleDeleteTimeOff,
    handleScheduleVacation,
    handleStatusChange,
    handleCancelAllDayAppointments,
    handleToggleBlockUser,
    handleResetUserStrikes,
    handleLogoFileUpload,
    handleCreateStaff,
    handleDeleteStaff,
    handlePreviewStaffSession,
    handleSaveSettings,
  };
}
