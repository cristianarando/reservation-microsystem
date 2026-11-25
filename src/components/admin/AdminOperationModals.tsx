"use client";

import React from "react";
import { StaffModalState } from "./AdminTeamTab";
import {
  ImprevistoModal,
  type ImprevistoModalState,
} from "./modals/ImprevistoModal";
import {
  ConflictResolutionModal,
  type ConflictDataState,
} from "./modals/ConflictResolutionModal";
import {
  VacationModal,
  type VacationModalState,
} from "./modals/VacationModal";
import { ServiceFormModal } from "./modals/ServiceFormModal";
import { StaffFormModal } from "./modals/StaffFormModal";
import { NoShowStrikeModal } from "./modals/NoShowStrikeModal";
import { WalkInBookingModal } from "./modals/WalkInBookingModal";
import type {
  PortalAppointment,
  PortalBusinessSettings,
  PortalService,
  PortalStaffMember,
  ServiceModalDraft,
} from "@/types/portal";

export type { ImprevistoModalState, ConflictDataState, VacationModalState };

interface AdminOperationModalsProps {
  agendaDateStr: string;
  selectedStaffId: string;
  isOwnerAdmin: boolean;
  staffList: PortalStaffMember[];
  services: PortalService[];
  settings?: PortalBusinessSettings | null;
  allAppointments: PortalAppointment[];
  resolveOverrideTargets: (targetId: string) => PortalStaffMember[];
  imprevistoModal: ImprevistoModalState;
  setImprevistoModal: React.Dispatch<React.SetStateAction<ImprevistoModalState>>;
  onQuickImprevisto: (resolution?: string, overrideStaffId?: string) => void;
  conflictData: ConflictDataState | null;
  setConflictData: React.Dispatch<
    React.SetStateAction<ConflictDataState | null>
  >;
  vacationModal: VacationModalState;
  setVacationModal: React.Dispatch<React.SetStateAction<VacationModalState>>;
  onScheduleVacation: (resolution?: string) => void;
  serviceModal: ServiceModalDraft | null;
  setServiceModal: React.Dispatch<
    React.SetStateAction<ServiceModalDraft | null>
  >;
  onSaveService: (draft: ServiceModalDraft) => Promise<boolean>;
  staffModal: StaffModalState | null;
  setStaffModal: React.Dispatch<React.SetStateAction<StaffModalState | null>>;
  savingStaff: boolean;
  onCreateStaff: () => void;
  noShowModalData: PortalAppointment | null;
  setNoShowModalData: React.Dispatch<
    React.SetStateAction<PortalAppointment | null>
  >;
  onStatusChange: (
    aptId: string,
    status: string,
    blockCustomer?: boolean,
    customReason?: string
  ) => Promise<void>;
  getWhatsAppNoShowUrl: (apt: PortalAppointment) => string;
  walkInModalOpen: boolean;
  setWalkInModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onRefresh: () => void;
  showToast: (
    type: "success" | "error" | "warning" | "info",
    title: string,
    message?: string
  ) => void;
}

export function AdminOperationModals({
  agendaDateStr,
  selectedStaffId,
  isOwnerAdmin,
  staffList,
  services,
  settings,
  allAppointments,
  resolveOverrideTargets,
  imprevistoModal,
  setImprevistoModal,
  onQuickImprevisto,
  conflictData,
  setConflictData,
  vacationModal,
  setVacationModal,
  onScheduleVacation,
  serviceModal,
  setServiceModal,
  onSaveService,
  staffModal,
  setStaffModal,
  savingStaff,
  onCreateStaff,
  noShowModalData,
  setNoShowModalData,
  onStatusChange,
  getWhatsAppNoShowUrl,
  walkInModalOpen,
  setWalkInModalOpen,
  onRefresh,
  showToast,
}: AdminOperationModalsProps) {
  return (
    <>
      <ImprevistoModal
        imprevistoModal={imprevistoModal}
        setImprevistoModal={setImprevistoModal}
        agendaDateStr={agendaDateStr}
        selectedStaffId={selectedStaffId}
        isOwnerAdmin={isOwnerAdmin}
        staffList={staffList}
        settings={settings}
        allAppointments={allAppointments}
        resolveOverrideTargets={resolveOverrideTargets}
        onQuickImprevisto={onQuickImprevisto}
      />

      <ConflictResolutionModal
        conflictData={conflictData}
        setConflictData={setConflictData}
        settings={settings}
        onQuickImprevisto={onQuickImprevisto}
        onScheduleVacation={onScheduleVacation}
      />

      <VacationModal
        vacationModal={vacationModal}
        setVacationModal={setVacationModal}
        selectedStaffId={selectedStaffId}
        isOwnerAdmin={isOwnerAdmin}
        staffList={staffList}
        settings={settings}
        resolveOverrideTargets={resolveOverrideTargets}
        onScheduleVacation={onScheduleVacation}
      />

      <ServiceFormModal
        serviceModal={serviceModal}
        setServiceModal={setServiceModal}
        staffList={staffList}
        settings={settings}
        onSaveService={onSaveService}
      />

      <StaffFormModal
        staffModal={staffModal}
        setStaffModal={setStaffModal}
        services={services}
        settings={settings}
        savingStaff={savingStaff}
        onCreateStaff={onCreateStaff}
      />

      <NoShowStrikeModal
        noShowModalData={noShowModalData}
        setNoShowModalData={setNoShowModalData}
        settings={settings}
        onStatusChange={onStatusChange}
        getWhatsAppNoShowUrl={getWhatsAppNoShowUrl}
      />

      <WalkInBookingModal
        isOpen={walkInModalOpen}
        onClose={() => setWalkInModalOpen(false)}
        defaultDateStr={agendaDateStr}
        defaultStaffId={selectedStaffId}
        isOwnerAdmin={isOwnerAdmin}
        staffList={staffList}
        services={services}
        settings={settings}
        onCreated={onRefresh}
        showToast={showToast}
      />
    </>
  );
}
