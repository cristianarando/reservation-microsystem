"use client";

import { useState, useMemo, useCallback } from "react";
import { ToastItem } from "@/components/ui/ToastContainer";
import {
  validateAllShifts,
  timeToMinutes,
  minutesToTime,
} from "@/lib/validation/acceptance-criteria";
import type {
  PortalBusinessSettings,
  PortalStaffMember,
} from "@/types/portal";

export interface EditableShift {
  tempId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface UseAdminShiftsOptions {
  selectedStaff?: PortalStaffMember;
  selectedStaffId: string;
  settings?: PortalBusinessSettings | null;
  onSelectStaffId: (staffId: string) => void;
  onSelectTab: (tab: "shifts") => void;
  onRefresh: () => void;
  showToast: (type: ToastItem["type"], title: string, message?: string) => void;
}

export function useAdminShifts({
  selectedStaff,
  selectedStaffId,
  settings,
  onSelectStaffId,
  onSelectTab,
  onRefresh,
  showToast,
}: UseAdminShiftsOptions) {
  const [isEditingShifts, setIsEditingShifts] = useState(false);
  const [editingShiftsList, setEditingShiftsList] = useState<EditableShift[]>(
    []
  );
  const [editingHorizonDays, setEditingHorizonDays] = useState<number>(7);
  const [editingLeadTimeMin, setEditingLeadTimeMin] = useState<number>(30);
  const [savingShifts, setSavingShifts] = useState(false);
  const [highlightedShiftDay, setHighlightedShiftDay] = useState<number | null>(
    null
  );

  const shiftsValidation = useMemo(() => {
    return validateAllShifts(editingShiftsList, {
      maxShiftsPerDay: 3,
      minDurationMin: 30,
    });
  }, [editingShiftsList]);

  const openShiftsEditor = useCallback(
    (targetStaffObj?: PortalStaffMember, focusDayOfWeek?: number) => {
      const staffToEdit = targetStaffObj || selectedStaff;
      if (!staffToEdit) return;

      if (staffToEdit.id && staffToEdit.id !== selectedStaffId) {
        onSelectStaffId(staffToEdit.id);
      }

      const currentShifts = staffToEdit.workingShifts || [];
      setEditingShiftsList(
        currentShifts.map((s) => ({
          tempId: s.id || "shift-" + Math.random().toString(36).substring(2, 9),
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
        }))
      );
      setEditingHorizonDays(
        staffToEdit.customHorizonDays ?? settings?.bookingHorizonDays ?? 7
      );
      setEditingLeadTimeMin(
        staffToEdit.customLeadTimeMin ?? settings?.minLeadTimeMinutes ?? 30
      );
      setIsEditingShifts(true);
      onSelectTab("shifts");

      if (typeof focusDayOfWeek === "number") {
        setHighlightedShiftDay(focusDayOfWeek);
        setTimeout(() => {
          document
            .getElementById(`shift-day-${focusDayOfWeek}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 80);
        setTimeout(() => {
          setHighlightedShiftDay((prev) =>
            prev === focusDayOfWeek ? null : prev
          );
        }, 2600);
      }
    },
    [selectedStaff, selectedStaffId, settings, onSelectStaffId, onSelectTab]
  );

  const startEditingShifts = useCallback(() => {
    openShiftsEditor(selectedStaff);
  }, [openShiftsEditor, selectedStaff]);

  const handleToggleDay = (day: number) => {
    const hasAny = editingShiftsList.some((s) => s.dayOfWeek === day);
    if (hasAny) {
      setEditingShiftsList(
        editingShiftsList.filter((s) => s.dayOfWeek !== day)
      );
    } else {
      setEditingShiftsList([
        ...editingShiftsList,
        {
          tempId:
            "shift-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
          dayOfWeek: day,
          startTime: "09:00",
          endTime: "18:00",
        },
      ]);
    }
  };

  const handleAddShiftToDay = (day: number) => {
    const existing = editingShiftsList.filter((s) => s.dayOfWeek === day);
    if (existing.length >= 3) {
      showToast(
        "warning",
        "Límite de turnos alcanzado",
        "Criterio de Aceptación: Máximo 3 turnos permitidos por día."
      );
      return;
    }

    let newStart = "15:00";
    let newEnd = "19:00";

    if (existing.length > 0) {
      const sorted = [...existing].sort(
        (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
      );
      const lastShift = sorted[sorted.length - 1];
      const lastEndMin = timeToMinutes(lastShift.endTime);

      if (lastEndMin > 0 && lastEndMin < 1260) {
        const proposedStartMin = lastEndMin + 60;
        const proposedEndMin = Math.min(1380, proposedStartMin + 240);
        if (proposedEndMin - proposedStartMin >= 30) {
          newStart = minutesToTime(proposedStartMin);
          newEnd = minutesToTime(proposedEndMin);
        }
      }
    }

    setEditingShiftsList([
      ...editingShiftsList,
      {
        tempId:
          "shift-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
        dayOfWeek: day,
        startTime: newStart,
        endTime: newEnd,
      },
    ]);
  };

  const handleUpdateShiftTime = (
    tempId: string,
    field: "startTime" | "endTime",
    val: string
  ) => {
    setEditingShiftsList((prev) =>
      prev.map((s) => (s.tempId === tempId ? { ...s, [field]: val } : s))
    );
  };

  const handleRemoveSpecificShift = (tempId: string) => {
    setEditingShiftsList((prev) => prev.filter((s) => s.tempId !== tempId));
  };

  const handleCopyMondayToWeek = () => {
    const mondayShifts = editingShiftsList.filter((s) => s.dayOfWeek === 1);
    if (mondayShifts.length === 0) {
      showToast(
        "info",
        "Lunes sin turnos",
        "El lunes no tiene turnos configurados. Agrega un horario al lunes antes de copiar."
      );
      return;
    }
    const remaining = editingShiftsList.filter(
      (s) =>
        s.dayOfWeek !== 2 &&
        s.dayOfWeek !== 3 &&
        s.dayOfWeek !== 4 &&
        s.dayOfWeek !== 5
    );
    const newShifts: EditableShift[] = [];
    [2, 3, 4, 5].forEach((d) => {
      mondayShifts.forEach((m) => {
        newShifts.push({
          tempId: "shift-" + d + "-" + Math.random().toString(36).substring(2, 7),
          dayOfWeek: d,
          startTime: m.startTime,
          endTime: m.endTime,
        });
      });
    });
    setEditingShiftsList([...remaining, ...newShifts]);
    showToast(
      "success",
      "Horarios copiados",
      "Se duplicaron los turnos del lunes para Martes, Miércoles, Jueves y Viernes."
    );
  };

  const handleApplyPreset = (type: "continua" | "partido") => {
    const newShifts: EditableShift[] = [];
    [1, 2, 3, 4, 5].forEach((d) => {
      if (type === "continua") {
        newShifts.push({
          tempId: "shift-" + d + "-c",
          dayOfWeek: d,
          startTime: "09:00",
          endTime: "18:00",
        });
      } else {
        newShifts.push({
          tempId: "shift-" + d + "-p1",
          dayOfWeek: d,
          startTime: "09:00",
          endTime: "13:00",
        });
        newShifts.push({
          tempId: "shift-" + d + "-p2",
          dayOfWeek: d,
          startTime: "15:00",
          endTime: "19:00",
        });
      }
    });
    newShifts.push({
      tempId: "shift-6-sat",
      dayOfWeek: 6,
      startTime: "09:00",
      endTime: "13:00",
    });
    setEditingShiftsList(newShifts);
    showToast(
      "success",
      "Plantilla aplicada",
      type === "continua"
        ? "Jornada continua (09:00 - 18:00) cargada para Lun-Vie."
        : "Turno partido (09:00-13:00 y 15:00-19:00) cargado para Lun-Vie."
    );
  };

  const handleSaveShifts = async () => {
    if (!selectedStaff?.id) return;

    if (!shiftsValidation.isValid) {
      showToast(
        "error",
        "Criterios de Aceptación",
        "No se pueden guardar los horarios porque contienen errores señalados en rojo."
      );
      return;
    }

    setSavingShifts(true);
    try {
      const res = await fetch("/api/admin/shifts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: selectedStaff.id,
          shifts: editingShiftsList.map((s) => ({
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
          })),
          customHorizonDays: editingHorizonDays,
          customLeadTimeMin: editingLeadTimeMin,
        }),
      });
      const data = await res
        .json()
        .catch(() => ({ error: "Error en respuesta del servidor." }));
      if (!res.ok) {
        showToast(
          "error",
          "Error al guardar horarios",
          data.error || "No se pudieron guardar los horarios."
        );
        return;
      }
      setIsEditingShifts(false);
      showToast(
        "success",
        "¡Horarios Guardados!",
        `La agenda semanal de ${selectedStaff.displayName} se actualizó exitosamente.`
      );
      onRefresh();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error inesperado de conexión.";
      showToast("error", "Error al guardar horarios", msg);
    } finally {
      setSavingShifts(false);
    }
  };

  return {
    isEditingShifts,
    setIsEditingShifts,
    editingShiftsList,
    editingHorizonDays,
    setEditingHorizonDays,
    editingLeadTimeMin,
    setEditingLeadTimeMin,
    savingShifts,
    highlightedShiftDay,
    shiftsValidation,
    openShiftsEditor,
    startEditingShifts,
    handleToggleDay,
    handleAddShiftToDay,
    handleUpdateShiftTime,
    handleRemoveSpecificShift,
    handleCopyMondayToWeek,
    handleApplyPreset,
    handleSaveShifts,
  };
}
