"use client";

import React from "react";
import type { ToastItem } from "@/components/ui/ToastContainer";
import type { ConfirmModalState } from "@/components/ui/ConfirmModal";
import type {
  ImprevistoModalState,
  ConflictDataState,
  VacationModalState,
} from "@/components/admin/AdminOperationModals";
import type { StaffModalState } from "@/components/admin/AdminTeamTab";
import type {
  PortalAppointment,
  PortalBusinessSettings,
  PortalService,
  PortalStaffMember,
} from "@/types/portal";
import { useAdminCatalog } from "./admin/useAdminCatalog";
import { useAdminTeam } from "./admin/useAdminTeam";
import { useAdminScheduleOverrides } from "./admin/useAdminScheduleOverrides";
import { useAdminSettings } from "./admin/useAdminSettings";

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

export function useAdminActions(options: UseAdminActionsOptions) {
  const catalog = useAdminCatalog({
    staffList: options.staffList,
    showToast: options.showToast,
    onRefresh: options.onRefresh,
  });

  const team = useAdminTeam({
    services: options.services,
    isOwnerAdmin: options.isOwnerAdmin,
    staffModal: options.staffModal,
    setStaffModal: options.setStaffModal,
    setConfirmDialog: options.setConfirmDialog,
    notifyAllStaffPref: options.notifyAllStaffPref,
    setNotifyAllStaffPref: options.setNotifyAllStaffPref,
    showToast: options.showToast,
    onRefresh: options.onRefresh,
  });

  const schedule = useAdminScheduleOverrides({
    timezone: options.settings?.timezone,
    agendaDateStr: options.agendaDateStr,
    selectedStaffId: options.selectedStaffId,
    onSelectStaffId: options.onSelectStaffId,
    setAllAppointments: options.setAllAppointments,
    imprevistoModal: options.imprevistoModal,
    setImprevistoModal: options.setImprevistoModal,
    conflictData: options.conflictData,
    setConflictData: options.setConflictData,
    vacationModal: options.vacationModal,
    setVacationModal: options.setVacationModal,
    showToast: options.showToast,
    onRefresh: options.onRefresh,
  });

  const settingsHandlers = useAdminSettings({
    settings: options.settings,
    isOwnerAdmin: options.isOwnerAdmin,
    showToast: options.showToast,
    onRefresh: options.onRefresh,
  });

  return {
    ...catalog,
    ...team,
    ...schedule,
    ...settingsHandlers,
  };
}
