"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ToastContainer } from "./ui/ToastContainer";
import { ConfirmModal, ConfirmModalState } from "./ui/ConfirmModal";
import { AdminHeader, AdminTabId } from "./admin/AdminHeader";
import { AdminAgendaTab } from "./admin/AdminAgendaTab";
import { AdminShiftsTab } from "./admin/AdminShiftsTab";
import { AdminTeamTab, StaffModalState } from "./admin/AdminTeamTab";
import { AdminSettingsTab } from "./admin/AdminSettingsTab";
import {
  AdminOperationModals,
  ImprevistoModalState,
  ConflictDataState,
  VacationModalState,
} from "./admin/AdminOperationModals";
import { ServicesCatalogTab } from "./admin/ServicesCatalogTab";
import { CustomerControlTab } from "./admin/CustomerControlTab";
import { useToastQueue } from "@/hooks/useToastQueue";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAdminShifts } from "@/hooks/useAdminShifts";
import { useAdminActions } from "@/hooks/useAdminActions";
import {
  buildCustomerCancellationWhatsAppUrl,
  buildCustomerNoShowWhatsAppUrl,
  buildStaffInviteWhatsAppUrl,
} from "@/lib/whatsapp";
import { formatLocalDateYYYYMMDD } from "@/lib/date-utils";
import { showDeduplicatedSystemNotification } from "@/lib/push-client";
import type {
  PortalAppointment,
  PortalBootstrapData,
  PortalStaffMember,
  ServiceModalDraft,
} from "@/types/portal";

interface AdminAppProps {
  initialData: PortalBootstrapData | null;
  onRefresh: () => void;
}

export function AdminApp({ initialData, onRefresh }: AdminAppProps) {
  const settings = initialData?.settings;
  const services = useMemo(
    () => initialData?.services || [],
    [initialData?.services]
  );
  const staffList = useMemo(
    () => initialData?.staff || [],
    [initialData?.staff]
  );
  const currentUser = initialData?.currentUser;
  const allUsers = initialData?.allUsers || [];

  const [activeTab, setActiveTab] = useState<AdminTabId>("agenda");
  const isProviderOnly = currentUser?.role === "PROVIDER";
  const isOwnerAdmin = !isProviderOnly;

  const [agendaDateStr, setAgendaDateStr] = useState<string>(() =>
    formatLocalDateYYYYMMDD(new Date())
  );

  const ownProfile = useMemo(() => {
    return (
      staffList.find(
        (s) =>
          s.userId === currentUser?.id ||
          (s.user?.email && s.user.email === currentUser?.email) ||
          s.displayName?.toLowerCase() === currentUser?.name?.toLowerCase()
      ) || staffList[0]
    );
  }, [staffList, currentUser?.id, currentUser?.email, currentUser?.name]);

  const [staffSelection, setStaffSelection] = useState<{
    userId?: string;
    staffId: string;
  } | null>(null);

  const selectedStaffId = isProviderOnly
    ? (ownProfile || staffList[1] || staffList[0])?.id || ""
    : staffSelection && staffSelection.userId === currentUser?.id
    ? staffSelection.staffId
    : ownProfile?.id || staffList[0]?.id || "";

  const setSelectedStaffId = useCallback(
    (staffId: string) => {
      setStaffSelection({ userId: currentUser?.id, staffId });
    },
    [currentUser?.id]
  );

  const effectiveActiveTab: AdminTabId =
    isProviderOnly && activeTab !== "agenda" && activeTab !== "shifts"
      ? "agenda"
      : activeTab;

  const [adminAptFilter, setAdminAptFilter] = useState<
    "pending" | "completed" | "noshow" | "all"
  >("pending");
  const [custFilter, setCustFilter] = useState<"all" | "issues">("all");

  const [confirmDialog, setConfirmDialog] =
    useState<ConfirmModalState | null>(null);
  const [staffModal, setStaffModal] = useState<StaffModalState | null>(null);
  const [noShowModalData, setNoShowModalData] =
    useState<PortalAppointment | null>(null);
  const [serviceModal, setServiceModal] = useState<ServiceModalDraft | null>(
    null
  );
  const [imprevistoModal, setImprevistoModal] = useState<ImprevistoModalState>({
    open: false,
    type: "LATE_START",
    timeStr: "09:30",
    reason: "",
    staffId: "",
  });
  const [conflictData, setConflictData] = useState<ConflictDataState | null>(
    null
  );
  const [vacationModal, setVacationModal] = useState<VacationModalState>({
    open: false,
    staffId: "",
    startDate: "",
    endDate: "",
    reason: "",
  });

  // Derive allAppointments cleanly while letting quick optimistic fetches override per bootstrap snapshot
  const [manualAppointments, setManualAppointments] = useState<{
    source: PortalAppointment[] | undefined;
    items: PortalAppointment[];
  } | null>(null);

  const allAppointments = useMemo(
    () =>
      manualAppointments &&
      manualAppointments.source === initialData?.allAppointments
        ? manualAppointments.items
        : initialData?.allAppointments || [],
    [manualAppointments, initialData?.allAppointments]
  );

  const setAllAppointments = useCallback(
    (items: PortalAppointment[]) => {
      setManualAppointments({
        source: initialData?.allAppointments,
        items,
      });
    },
    [initialData?.allAppointments]
  );

  const { toasts, showToast, removeToast, latestShowToastRef } =
    useToastQueue();
  const latestOnRefreshRef = useRef(onRefresh);
  useEffect(() => {
    latestOnRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const [notifyPrefOverride, setNotifyPrefOverride] = useState<{
    userId?: string;
    serverVal: boolean;
    localVal: boolean;
  } | null>(null);

  const serverNotifyPref = Boolean(currentUser?.notifyAllStaff);
  const notifyAllStaffPref =
    notifyPrefOverride &&
    notifyPrefOverride.userId === currentUser?.id &&
    notifyPrefOverride.serverVal === serverNotifyPref
      ? notifyPrefOverride.localVal
      : serverNotifyPref;

  const setNotifyAllStaffPref = useCallback(
    (localVal: boolean) => {
      setNotifyPrefOverride({
        userId: currentUser?.id,
        serverVal: serverNotifyPref,
        localVal,
      });
    },
    [currentUser?.id, serverNotifyPref]
  );

  const hasOwnStaffProfile = Boolean(
    currentUser?.id &&
      staffList.some((s) => s.userId && s.userId === currentUser.id)
  );
  const isImpersonating = Boolean(
    initialData?.impersonatorId &&
      currentUser?.id &&
      initialData.impersonatorId !== currentUser.id
  );

  const { pushState, pushBusy, testingPush, togglePush, testPush } =
    usePushNotifications({
      userId: currentUser?.id,
      isImpersonating,
    });

  const selectedStaff =
    staffList.find((s) => s.id === selectedStaffId) || staffList[0];

  const shifts = useAdminShifts({
    selectedStaff,
    selectedStaffId,
    settings,
    onSelectStaffId: setSelectedStaffId,
    onSelectTab: setActiveTab,
    onRefresh,
    showToast,
  });

  const actions = useAdminActions({
    settings,
    services,
    staffList,
    isOwnerAdmin,
    agendaDateStr,
    selectedStaffId,
    onSelectStaffId: setSelectedStaffId,
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
  });

  const resolveOverrideTargets = (targetId: string) => {
    if (targetId === "ALL") {
      return staffList.filter((s) => s.isActive !== false);
    }
    const found = staffList.find((s) => s.id === targetId);
    return found ? [found] : [];
  };

  const handleToggleAdminPush = async () => {
    if (isImpersonating) {
      showToast(
        "warning",
        "Vista previa activa",
        "Vuelve a tu sesión de Administrador antes de vincular avisos en este dispositivo."
      );
      return;
    }
    const res = await togglePush();
    if (res.action === "unsubscribed") {
      showToast(
        "info",
        "Avisos desactivados",
        "Este dispositivo ya no recibirá notificaciones push."
      );
      return;
    }
    if (res.ok) {
      const teamHint =
        isOwnerAdmin &&
        hasOwnStaffProfile &&
        !notifyAllStaffPref &&
        staffList.length > 1
          ? " Solo recibirás alertas de tu agenda; pulsa 'Avisos: Equipo' arriba si deseas recibir de todo el personal."
          : "";
      showToast(
        "success",
        "🔔 Avisos activados",
        `Recibirás notificaciones en este dispositivo ante nuevas citas o cancelaciones.${teamHint}`
      );
    } else if (res.error) {
      showToast("warning", "No se pudieron activar avisos", res.error);
    }
  };

  const handleTestAdminPush = async () => {
    const res = await testPush();
    if (res.ok) {
      showToast(
        "success",
        "Prueba enviada al servidor push",
        "Chrome debería mostrar la notificación 'Prueba Web Push desde el servidor' en segundos."
      );
    } else {
      showToast(
        "error",
        "Fallo en envío Web Push",
        res.error || "No se pudo completar el envío."
      );
    }
  };

  // URL deep-linking (?tab=agenda&date=YYYY-MM-DD) & SW notificationclick listener
  useEffect(() => {
    if (typeof window === "undefined") return;
    const applyDeepLink = (rawSearch: string) => {
      const params = new URLSearchParams(rawSearch);
      const tabParam = params.get("tab");
      const dateParam = params.get("date");
      if (tabParam === "agenda" || tabParam === "shifts") {
        setActiveTab(tabParam);
      }
      if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        setAgendaDateStr(dateParam);
      }
    };
    const initTimer = setTimeout(() => {
      applyDeepLink(window.location.search);
    }, 0);

    const onSwMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (
        msg &&
        msg.type === "PUSH_NOTIFICATION_CLICK" &&
        typeof msg.url === "string"
      ) {
        try {
          const parsed = new URL(msg.url, window.location.origin);
          applyDeepLink(parsed.search);
          latestOnRefreshRef.current();
        } catch {
          // Ignore malformed deep link
        }
      }
    };
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => {
      clearTimeout(initTimer);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, []);

  // Real-time synchronization via SSE + focus + fallback polling
  useEffect(() => {
    const triggerRefresh = () => {
      if (document.visibilityState === "visible") {
        latestOnRefreshRef.current();
      }
    };
    window.addEventListener("focus", triggerRefresh);
    document.addEventListener("visibilitychange", triggerRefresh);
    const poll = setInterval(triggerRefresh, 8000);

    let es: EventSource | null = null;
    if (typeof EventSource !== "undefined") {
      es = new EventSource("/api/events");
      es.onmessage = (msg) => {
        try {
          const ev = JSON.parse(msg.data);
          if (!ev?.type || ev.type === "CONNECTED") return;

          latestOnRefreshRef.current();
          if (ev.suppressAlert) return;

          const timeLabel = ev.startAt
            ? new Date(ev.startAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "";
          const dateLabel = ev.startAt
            ? new Date(ev.startAt).toLocaleDateString("es-ES", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })
            : "";

          if (ev.type === "APPOINTMENT_CREATED") {
            const title = `📅 Nueva cita: ${ev.serviceName || "Servicio"}${
              timeLabel ? ` (${timeLabel})` : ""
            }`;
            const body = `${ev.customerName || "Un cliente"} agendó ${
              ev.serviceName || "un servicio"
            }${ev.staffName ? ` con ${ev.staffName}` : ""}${
              dateLabel ? ` para el ${dateLabel}` : ""
            }${timeLabel ? ` a las ${timeLabel}` : ""}.`;
            latestShowToastRef.current("info", title, body);
            void showDeduplicatedSystemNotification({
              title,
              body,
              tag: ev.appointmentId
                ? `apt-new-${ev.appointmentId}`
                : ev.eventKey || `apt-new-${Date.now()}`,
              url: "/admin?tab=agenda",
            });
          } else if (
            ev.type === "APPOINTMENT_CANCELLED" &&
            ev.cancelledBy === "CUSTOMER"
          ) {
            const title = `🔓 Cita cancelada: ${ev.serviceName || "Servicio"}${
              timeLabel ? ` (${timeLabel})` : ""
            }`;
            const body = `${
              ev.customerName || "Un cliente"
            } canceló su cita de ${ev.serviceName || "servicio"}${
              dateLabel ? ` del ${dateLabel}` : ""
            }${timeLabel ? ` a las ${timeLabel}` : ""}. El horario quedó libre.`;
            latestShowToastRef.current("warning", title, body);
            void showDeduplicatedSystemNotification({
              title,
              body,
              tag: ev.appointmentId
                ? `apt-cust-cancel-${ev.appointmentId}`
                : ev.eventKey || `apt-cust-cancel-${Date.now()}`,
              url: "/admin?tab=agenda",
            });
          }
        } catch {
          // Ignore keepalive or malformed frames
        }
      };
    }

    return () => {
      window.removeEventListener("focus", triggerRefresh);
      document.removeEventListener("visibilitychange", triggerRefresh);
      clearInterval(poll);
      if (es) es.close();
    };
  }, [latestShowToastRef]);

  const dayAppointments = useMemo(() => {
    return allAppointments.filter((a) => {
      const aStr = formatLocalDateYYYYMMDD(new Date(a.startAt));
      const matchesStaff =
        !selectedStaffId ||
        selectedStaffId === "ALL" ||
        a.staffId === selectedStaffId;
      return aStr === agendaDateStr && matchesStaff;
    });
  }, [allAppointments, agendaDateStr, selectedStaffId]);

  const getWhatsAppCancelUrl = (apt: PortalAppointment) =>
    buildCustomerCancellationWhatsAppUrl(apt, settings?.name);
  const getWhatsAppNoShowUrl = (apt: PortalAppointment) =>
    buildCustomerNoShowWhatsAppUrl(apt, settings?.name);
  const getWhatsAppStaffInviteUrl = (staff: PortalStaffMember) => {
    const appUrl =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://clinica.app";
    return buildStaffInviteWhatsAppUrl(
      staff,
      settings?.phoneWhatsapp,
      settings?.name,
      appUrl
    );
  };

  const visibleTabs: { id: AdminTabId; label: string }[] = isOwnerAdmin
    ? [
        { id: "agenda", label: "Agenda & Imprevistos" },
        { id: "shifts", label: "Mis Horarios" },
        { id: "team", label: `👨‍⚕️ Equipo (${staffList.length})` },
        { id: "services", label: "Servicios" },
        { id: "customers", label: "Clientes" },
        { id: "settings", label: "Ajustes Local" },
      ]
    : [
        { id: "agenda", label: "📅 Mi Agenda & Imprevistos" },
        { id: "shifts", label: "⏰ Mis Horarios" },
      ];

  return (
    <div className="w-full max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto min-h-dvh bg-white text-[#1F1F23] pb-28 shadow-2xl relative border-x border-zinc-200 transition-all duration-300">
      <AdminHeader
        settings={settings}
        currentUser={currentUser}
        isOwnerAdmin={isOwnerAdmin}
        isProviderOnly={isProviderOnly}
        isImpersonating={isImpersonating}
        impersonatorId={initialData?.impersonatorId}
        pushState={pushState}
        pushBusy={pushBusy}
        testingPush={testingPush}
        notifyAllStaffPref={notifyAllStaffPref}
        hasOwnStaffProfile={hasOwnStaffProfile}
        selectedStaffId={selectedStaffId}
        staffList={staffList}
        activeTab={effectiveActiveTab}
        visibleTabs={visibleTabs}
        onToggleAdminPush={handleToggleAdminPush}
        onTestAdminPush={handleTestAdminPush}
        onToggleNotifyAllStaff={actions.handleToggleNotifyAllStaff}
        onSelectStaffId={setSelectedStaffId}
        onSelectTab={setActiveTab}
        onPreviewStaffSession={actions.handlePreviewStaffSession}
      />

      {effectiveActiveTab === "agenda" && (
        <AdminAgendaTab
          agendaDateStr={agendaDateStr}
          onChangeAgendaDate={setAgendaDateStr}
          selectedStaffId={selectedStaffId}
          onSelectStaffId={setSelectedStaffId}
          selectedStaff={selectedStaff}
          staffList={staffList}
          currentUser={currentUser}
          isOwnerAdmin={isOwnerAdmin}
          allAppointments={allAppointments}
          dayAppointments={dayAppointments}
          adminAptFilter={adminAptFilter}
          onChangeAptFilter={setAdminAptFilter}
          resolveOverrideTargets={resolveOverrideTargets}
          onOpenImprevistoModal={setImprevistoModal}
          onOpenVacationModal={setVacationModal}
          onOpenShiftsEditor={shifts.openShiftsEditor}
          onDeleteTimeOff={actions.handleDeleteTimeOff}
          onCancelAllDayAppointments={actions.handleCancelAllDayAppointments}
          onStatusChange={actions.handleStatusChange}
          onOpenNoShowModal={setNoShowModalData}
          getWhatsAppCancelUrl={getWhatsAppCancelUrl}
          getWhatsAppNoShowUrl={getWhatsAppNoShowUrl}
        />
      )}

      {effectiveActiveTab === "shifts" && (
        <AdminShiftsTab
          selectedStaff={selectedStaff}
          selectedStaffId={selectedStaffId}
          staffList={staffList}
          settings={settings}
          isOwnerAdmin={isOwnerAdmin}
          isEditingShifts={shifts.isEditingShifts}
          setIsEditingShifts={shifts.setIsEditingShifts}
          editingShiftsList={shifts.editingShiftsList}
          editingHorizonDays={shifts.editingHorizonDays}
          setEditingHorizonDays={shifts.setEditingHorizonDays}
          editingLeadTimeMin={shifts.editingLeadTimeMin}
          setEditingLeadTimeMin={shifts.setEditingLeadTimeMin}
          savingShifts={shifts.savingShifts}
          highlightedShiftDay={shifts.highlightedShiftDay}
          shiftsValidation={shifts.shiftsValidation}
          onSelectStaffId={setSelectedStaffId}
          onStartEditingShifts={shifts.startEditingShifts}
          onSaveShifts={shifts.handleSaveShifts}
          onToggleStaffActive={actions.handleToggleStaffActive}
          onOpenVacationModal={setVacationModal}
          onDeleteTimeOff={actions.handleDeleteTimeOff}
          onApplyPreset={shifts.handleApplyPreset}
          onCopyMondayToWeek={shifts.handleCopyMondayToWeek}
          onToggleDay={shifts.handleToggleDay}
          onAddShiftToDay={shifts.handleAddShiftToDay}
          onUpdateShiftTime={shifts.handleUpdateShiftTime}
          onRemoveSpecificShift={shifts.handleRemoveSpecificShift}
        />
      )}

      {effectiveActiveTab === "team" && isOwnerAdmin && (
        <AdminTeamTab
          staffList={staffList}
          services={services}
          allUsers={allUsers}
          settings={settings}
          onOpenStaffModal={setStaffModal}
          onSetAllStaffServices={actions.handleSetAllStaffServices}
          onToggleStaffService={actions.handleToggleStaffService}
          getWhatsAppStaffInviteUrl={getWhatsAppStaffInviteUrl}
          onPreviewStaffSession={actions.handlePreviewStaffSession}
          onChangeStaffAvatar={actions.handleChangeStaffAvatar}
          onToggleStaffActive={actions.handleToggleStaffActive}
          onOpenVacationModal={setVacationModal}
          onDeleteStaff={actions.handleDeleteStaff}
        />
      )}

      {effectiveActiveTab === "services" && isOwnerAdmin && (
        <ServicesCatalogTab
          services={services}
          staffList={staffList}
          currencySymbol={settings?.currencySymbol || "Bs"}
          onOpenNewService={() =>
            setServiceModal({
              name: "",
              description: "",
              durationMin: 30,
              bufferAfterMin: 0,
              price: 30,
              staffIds: staffList.map((s) => s.id),
            })
          }
          onOpenEditService={(svc, currentStaffIds) =>
            setServiceModal({
              id: svc.id,
              name: svc.name,
              description: svc.description || "",
              durationMin: svc.durationMin,
              bufferAfterMin: svc.bufferAfterMin ?? 0,
              price: svc.price,
              isActive: svc.isActive ?? true,
              staffIds: currentStaffIds,
            })
          }
          onToggleServiceStaff={actions.handleToggleServiceStaff}
        />
      )}

      {effectiveActiveTab === "customers" && isOwnerAdmin && (
        <CustomerControlTab
          allUsers={allUsers}
          custFilter={custFilter}
          onChangeFilter={setCustFilter}
          onResetUserStrikes={actions.handleResetUserStrikes}
          onToggleBlockUser={actions.handleToggleBlockUser}
        />
      )}

      {effectiveActiveTab === "settings" && isOwnerAdmin && (
        <AdminSettingsTab
          settings={settings}
          settingsForm={actions.settingsForm}
          savingSettings={actions.savingSettings}
          onUpdateSettingsForm={actions.setSettingsForm}
          onSaveSettings={actions.handleSaveSettings}
          onLogoFileUpload={actions.handleLogoFileUpload}
        />
      )}

      <AdminOperationModals
        agendaDateStr={agendaDateStr}
        selectedStaffId={selectedStaffId}
        isOwnerAdmin={isOwnerAdmin}
        staffList={staffList}
        services={services}
        settings={settings}
        allAppointments={allAppointments}
        resolveOverrideTargets={resolveOverrideTargets}
        imprevistoModal={imprevistoModal}
        setImprevistoModal={setImprevistoModal}
        onQuickImprevisto={actions.handleQuickImprevisto}
        conflictData={conflictData}
        setConflictData={setConflictData}
        vacationModal={vacationModal}
        setVacationModal={setVacationModal}
        onScheduleVacation={actions.handleScheduleVacation}
        serviceModal={serviceModal}
        setServiceModal={setServiceModal}
        staffModal={staffModal}
        setStaffModal={setStaffModal}
        savingStaff={actions.savingStaff}
        onCreateStaff={actions.handleCreateStaff}
        noShowModalData={noShowModalData}
        setNoShowModalData={setNoShowModalData}
        onStatusChange={actions.handleStatusChange}
        getWhatsAppNoShowUrl={getWhatsAppNoShowUrl}
        showToast={showToast}
        onRefresh={onRefresh}
      />

      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <ConfirmModal
        dialog={confirmDialog}
        onClose={() => setConfirmDialog(null)}
      />
    </div>
  );
}
