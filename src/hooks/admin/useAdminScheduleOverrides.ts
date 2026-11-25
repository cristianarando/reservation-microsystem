"use client";

import React, { useCallback } from "react";
import type { ToastItem } from "@/components/ui/ToastContainer";
import type {
  ConflictDataState,
  ImprevistoModalState,
  VacationModalState,
} from "@/components/admin/AdminOperationModals";
import {
  addDaysYYYYMMDD,
  formatDateYYYYMMDDInTz,
  getDayBoundsInTz,
  parseDateAndTimeInTz,
  resolveBusinessTimeZone,
} from "@/lib/timezone";
import type { PortalAppointment } from "@/types/portal";

interface UseAdminScheduleOverridesOptions {
  timezone?: string | null;
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
  showToast: (type: ToastItem["type"], title: string, message?: string) => void;
  onRefresh: () => void;
}

export function useAdminScheduleOverrides({
  timezone,
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
  showToast,
  onRefresh,
}: UseAdminScheduleOverridesOptions) {
  const businessTz = resolveBusinessTimeZone(timezone);

  const loadDayAppointments = useCallback(() => {
    const todayStr = formatDateYYYYMMDDInTz(new Date(), businessTz);
    const fromStr = addDaysYYYYMMDD(todayStr, -30);
    const toStr = addDaysYYYYMMDD(todayStr, 90);
    fetch(
      `/api/bootstrap?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}&usersLimit=200`,
      { cache: "no-store" }
    )
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
  }, [businessTz, setAllAppointments]);

  const handleQuickImprevisto = async (
    resolution?: string,
    overrideStaffId?: string
  ) => {
    const { startOfDay, endOfDay } = getDayBoundsInTz(agendaDateStr, businessTz);
    let startAt = startOfDay;
    let endAt = endOfDay;

    if (imprevistoModal.type === "LATE_START") {
      startAt = startOfDay;
      endAt = parseDateAndTimeInTz(
        agendaDateStr,
        imprevistoModal.timeStr,
        businessTz
      );
    } else if (imprevistoModal.type === "EARLY_LEAVE") {
      startAt = parseDateAndTimeInTz(
        agendaDateStr,
        imprevistoModal.timeStr,
        businessTz
      );
      endAt = endOfDay;
    } else if (imprevistoModal.type === "FULL_DAY_OFF") {
      startAt = startOfDay;
      endAt = endOfDay;
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

      const data = await res.json().catch(() => ({}));
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

    const { startOfDay: startAt } = getDayBoundsInTz(
      vacationModal.startDate,
      businessTz
    );
    const { endOfDay: endAt } = getDayBoundsInTz(
      vacationModal.endDate,
      businessTz
    );
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

      const data = await res.json().catch(() => ({}));
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(
          "error",
          "No se pudo actualizar el estado",
          data.error || "Error al actualizar la cita."
        );
        return;
      }
      if (status === "CANCELLED") {
        showToast(
          "info",
          "Cita cancelada",
          "Se canceló la cita y se envió el aviso automático al portal del cliente."
        );
      }
      loadDayAppointments();
      onRefresh();
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
      let failed = 0;
      for (const apt of targetApts) {
        const res = await fetch(`/api/admin/appointments/${apt.id}/status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "CANCELLED",
            reason: `No atiendo el ${agendaDateStr} por descanso/imprevisto`,
          }),
        });
        if (!res.ok) failed += 1;
      }
      const succeeded = targetApts.length - failed;
      if (failed > 0) {
        showToast(
          "warning",
          `Cancelación parcial (${succeeded}/${targetApts.length})`,
          `${failed} cita(s) no pudieron cancelarse. Se actualizó la agenda.`
        );
      } else {
        showToast(
          "success",
          `¡${targetApts.length} cita(s) cancelada(s)!`,
          "Todas las citas seleccionadas fueron canceladas y los clientes recibieron el aviso para reagendar."
        );
      }
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

  return {
    handleQuickImprevisto,
    handleDeleteTimeOff,
    handleScheduleVacation,
    handleStatusChange,
    handleCancelAllDayAppointments,
  };
}
