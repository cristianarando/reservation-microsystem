"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { ClientFooter } from "@/components/client/ClientFooter";
import {
  BranchLocationModal,
  CancellationPolicyModal,
  PwaInstallModal,
} from "@/components/client/ClientModals";
import { ClientHeader } from "@/components/client/ClientHeader";
import { ClientAlertBanners } from "@/components/client/ClientAlertBanners";
import { BookingStepService } from "@/components/client/BookingStepService";
import { BookingStepStaff } from "@/components/client/BookingStepStaff";
import { BookingStepDateTime } from "@/components/client/BookingStepDateTime";
import { BookingStepConfirm } from "@/components/client/BookingStepConfirm";
import { BookingStepSuccess } from "@/components/client/BookingStepSuccess";
import { ClientMyAppointmentsTab } from "@/components/client/ClientMyAppointmentsTab";
import { ClientAuthModal } from "@/components/client/ClientAuthModal";
import { useToastQueue } from "@/hooks/useToastQueue";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useCustomerHistory } from "@/hooks/useCustomerHistory";
import { useAvailabilitySlots } from "@/hooks/useAvailabilitySlots";
import { useClientRealtimeSync } from "@/hooks/useClientRealtimeSync";
import { formatLocalDateYYYYMMDD } from "@/lib/date-utils";
import { isUpcomingActiveAppointment } from "@/lib/booking-rules";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import {
  addDaysYYYYMMDD,
  formatSpanishDateInTz,
  getDayOfWeekInTz,
  resolveBusinessTimeZone,
} from "@/lib/timezone";
import {
  closeDisplayedAccountNotifications,
  getActivePushEndpoint,
} from "@/lib/push-client";
import type {
  BeforeInstallPromptEvent,
  PortalAppointment,
  PortalBootstrapData,
  PortalService,
} from "@/types/portal";

interface ClientAppProps {
  initialData: PortalBootstrapData | null;
  onRefresh: () => void;
}

export function ClientApp({ initialData, onRefresh }: ClientAppProps) {
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
  const userAppointments = initialData?.userAppointments || [];
  const notifications = initialData?.notifications || [];

  const isHealthBusiness =
    /(dental|odonto|medic|clinic|salud|doctor|pediatr|gineco|psicol|fisio)/i.test(
      `${settings?.name || ""} ${settings?.tagline || ""} ${
        settings?.staffLabel || ""
      } ${services.map((s) => s.name).join(" ")}`
    );

  const [activeTab, setActiveTab] = useState<"book" | "my-appointments">(
    "book"
  );
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [dismissedNotifIds, setDismissedNotifIds] = useState<string[]>([]);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [highlightedAppointmentId, setHighlightedAppointmentId] = useState<
    string | null
  >(null);
  const pendingDeepLinkRef = useRef<{
    tab?: "book" | "my-appointments";
    appointmentId?: string | null;
  } | null>(null);

  const { toasts, showToast, removeToast } = useToastQueue(5000);
  const {
    pushState,
    setPushState,
    pushBusy,
    testingPush,
    pushMessage,
    setPushMessage,
    togglePush,
    testPush,
  } = usePushNotifications({ userId: currentUser?.id });
  const {
    showHistory,
    historyItems,
    historyHasMore,
    historyTotalCount,
    historyLoadingMore,
    historyScrollRef,
    historySentinelRef,
    loadMoreHistory,
    setShowHistory,
  } = useCustomerHistory({
    userId: currentUser?.id,
    initialHistory: initialData?.userHistory,
    enabledForInfiniteScroll: activeTab === "my-appointments",
  });

  const businessTz = resolveBusinessTimeZone(settings?.timezone);
  const serverNowIso = initialData?.serverNowIso;
  const referenceNow = useMemo(
    () => (serverNowIso ? new Date(serverNowIso) : new Date()),
    [serverNowIso]
  );

  const [selectedService, setSelectedService] = useState<PortalService | null>(
    services[0] || null
  );
  const [selectedStaffId, setSelectedStaffId] = useState<string>("ANY");
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() =>
    formatLocalDateYYYYMMDD(
      initialData?.serverNowIso
        ? new Date(initialData.serverNowIso)
        : new Date(),
      resolveBusinessTimeZone(initialData?.settings?.timezone)
    )
  );
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [customerPhoneOverride, setCustomerPhoneOverride] = useState<{
    userId: string | null;
    value: string;
  } | null>(null);
  const customerPhone =
    customerPhoneOverride &&
    customerPhoneOverride.userId === (currentUser?.id ?? null)
      ? customerPhoneOverride.value
      : currentUser?.phone || "";
  const setCustomerPhone = (value: string) =>
    setCustomerPhoneOverride({
      userId: currentUser?.id ?? null,
      value,
    });
  const [customerNotes, setCustomerNotes] = useState<string>("");

  const [guestName, setGuestName] = useState<string>("");
  const [guestEmail, setGuestEmail] = useState<string>("");
  const [guestPassword, setGuestPassword] = useState<string>("");

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    availableSlots,
    timeOffNotices,
    unavailableReason,
    slotsLoading,
    refreshSlots,
    clearAvailabilityState,
  } = useAvailabilitySlots({
    step,
    serviceId: selectedService?.id,
    staffId: selectedStaffId,
    dateStr: selectedDateStr,
    setSelectedTime,
  });

  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] =
    useState<PortalAppointment | null>(null);

  const [showMapModal, setShowMapModal] = useState(false);
  const [showPwaModal, setShowPwaModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [pwaInstalled, setPwaInstalled] = useState(false);
  const [policyModal, setPolicyModal] = useState<{
    open: boolean;
    message: string;
    whatsappUrl: string;
  } | null>(null);

  const handleDismissNotification = async (notifId: string, aptId?: string) => {
    const addedIds = [notifId, ...(aptId ? [aptId] : [])];
    setDismissedNotifIds((prev) => Array.from(new Set([...prev, ...addedIds])));
    setNotifError(null);
    try {
      const res = await fetch(`/api/notifications/${notifId}/read`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(
          "No se pudo confirmar la lectura del aviso en el servidor."
        );
      }
      onRefresh();
    } catch (e: unknown) {
      setDismissedNotifIds((prev) =>
        prev.filter((id) => !addedIds.includes(id))
      );
      setNotifError(
        e instanceof Error
          ? e.message
          : "No se pudo descartar el aviso. Verifica tu conexión."
      );
    }
  };

  const handleLogout = async () => {
    try {
      const endpoint = await getActivePushEndpoint();
      await closeDisplayedAccountNotifications();
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      setPushState("unsubscribed");
      setPushMessage(null);
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleDevicePush = async () => {
    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }
    const res = await togglePush();
    if (res.action === "unsubscribed") {
      setPushMessage("Avisos desactivados en este dispositivo.");
    } else if (res.ok) {
      setPushMessage(
        "¡Avisos activados en este dispositivo! Te notificaremos si cambia tu cita."
      );
    } else if (res.error) {
      setPushMessage(res.error);
    }
  };

  const handleTestDevicePush = async () => {
    const res = await testPush();
    if (res.ok) {
      showToast(
        "success",
        "Prueba enviada al servidor push",
        "Chrome debería mostrar la notificación 'Prueba Web Push desde el servidor' en segundos."
      );
      setPushMessage(
        "Envío real completado. Si no apareció la ventana de Chrome, revisa los permisos de Chrome en tu sistema."
      );
    } else {
      showToast(
        "error",
        "Fallo al enviar aviso de prueba",
        res.error || "No se pudo entregar el push."
      );
      setPushMessage(res.error || "No se pudo entregar el push de prueba.");
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyDeepLinkFromUrl = (rawSearch: string) => {
      const params = new URLSearchParams(rawSearch);
      const tabParam = params.get("tab");
      const aptId = params.get("appointmentId");
      if (tabParam === "my-appointments" || aptId) {
        if (aptId) setHighlightedAppointmentId(aptId);
        if (currentUser) {
          setActiveTab("my-appointments");
          pendingDeepLinkRef.current = null;
        } else {
          pendingDeepLinkRef.current = {
            tab: "my-appointments",
            appointmentId: aptId,
          };
          setActiveTab("my-appointments");
          setShowAuthModal(true);
        }
      }
    };

    const initTimer = setTimeout(() => {
      applyDeepLinkFromUrl(window.location.search);
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
          applyDeepLinkFromUrl(parsed.search);
          onRefresh();
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
  }, [currentUser, onRefresh]);

  const handleAuthSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authEmail.trim() || !authEmail.includes("@")) {
      setAuthError("Ingresa un correo electrónico válido.");
      return;
    }
    if (!authPassword || authPassword.length < 6) {
      setAuthError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (
      authMode === "register" &&
      (!authName.trim() || authName.trim().length < 2)
    ) {
      setAuthError("Ingresa tu nombre completo.");
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    try {
      const endpoint =
        authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        authMode === "login"
          ? { email: authEmail.trim(), password: authPassword }
          : {
              name: authName.trim(),
              email: authEmail.trim(),
              password: authPassword,
              phone: authPhone.trim() || undefined,
            };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res
        .json()
        .catch(() => ({ error: "Error de respuesta del servidor." }));
      if (!res.ok) {
        setAuthError(data.error || "No se pudo completar la operación.");
        return;
      }
      setShowAuthModal(false);
      setAuthPassword("");
      if (pendingDeepLinkRef.current) {
        if (pendingDeepLinkRef.current.tab) {
          setActiveTab(pendingDeepLinkRef.current.tab);
        }
        if (pendingDeepLinkRef.current.appointmentId) {
          setHighlightedAppointmentId(
            pendingDeepLinkRef.current.appointmentId
          );
        }
        pendingDeepLinkRef.current = null;
      }
      onRefresh();
    } catch (err: unknown) {
      setAuthError(
        err instanceof Error
          ? err.message
          : "Error al conectar con el servidor."
      );
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setPwaInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useClientRealtimeSync({
    timezone: settings?.timezone,
    onRefresh,
    onRefreshSlots: () => {
      if (step === 3) refreshSlots();
    },
    showToast,
  });

  const selectedStaffObj = staffList.find((s) => s.id === selectedStaffId);
  const horizonDays =
    (selectedStaffId !== "ANY" ? selectedStaffObj?.customHorizonDays : null) ??
    settings?.bookingHorizonDays ??
    7;

  const dateOptions = useMemo(() => {
    const items = [];
    const todayStr = formatLocalDateYYYYMMDD(referenceNow, businessTz);
    const shortDays = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
    for (let i = 0; i < horizonDays; i++) {
      const dateStr = addDaysYYYYMMDD(todayStr, i);
      const dayOfWeek = getDayOfWeekInTz(dateStr, businessTz);
      const dayNum = Number(dateStr.split("-")[2]);
      const monthName = formatSpanishDateInTz(`${dateStr}T12:00:00Z`, businessTz, {
        month: "short",
      });
      const weekdayShort = formatSpanishDateInTz(
        `${dateStr}T12:00:00Z`,
        businessTz,
        { weekday: "short" }
      );
      const dayName =
        i === 0 ? "Hoy" : i === 1 ? "Mañana" : weekdayShort;
      items.push({
        dateStr,
        dayShort: i === 0 ? "HOY" : shortDays[dayOfWeek] || weekdayShort.toUpperCase(),
        dayNumber: dayNum,
        label: `${dayName} ${dayNum} ${monthName}`,
        isToday: i === 0,
      });
    }
    return items;
  }, [horizonDays, referenceNow, businessTz]);

  const getEligibleStaffForService = useCallback(
    (svc: PortalService | null) => {
      const hasAnyServiceLinks =
        (Array.isArray(svc?.staff) && svc.staff.length > 0) ||
        staffList.some(
          (st) => Array.isArray(st.services) && st.services.length > 0
        );
      if (!svc?.id || !hasAnyServiceLinks) return staffList;
      return staffList.filter(
        (st) =>
          svc.staff?.some((s) => s.staffId === st.id) ||
          st.services?.some((s) => s.serviceId === svc.id)
      );
    },
    [staffList]
  );

  const resetBookingWizardState = (
    options: {
      keepService?: boolean;
      keepStaff?: boolean;
      keepConfirmed?: boolean;
    } = {}
  ) => {
    if (!options.keepService) setSelectedService(services[0] || null);
    if (!options.keepStaff) setSelectedStaffId("ANY");
    setSelectedDateStr(formatLocalDateYYYYMMDD(new Date(), businessTz));
    setSelectedTime("");
    clearAvailabilityState();
    setCustomerNotes("");
    setBookingError(null);
    if (!options.keepConfirmed) setConfirmedAppointment(null);
  };

  const handleConfirmBooking = async () => {
    setBookingError(null);
    if (currentUser?.role === "PROVIDER") {
      setBookingError(
        `Las cuentas de ${settings?.staffLabel?.toLowerCase() || "profesionales"} no realizan reservas como pacientes. Accede a tu panel en /admin para gestionar tu agenda.`
      );
      return;
    }
    if (currentUser?.isBlocked) {
      setBookingError(
        "Tu cuenta se encuentra restringida para reservas en línea debido a inasistencias previas sin aviso. Por favor contacta al consultorio por WhatsApp."
      );
      return;
    }
    if (!currentUser) {
      if (!guestName.trim() || guestName.trim().length < 2) {
        setBookingError(
          "Por favor ingresa tu nombre completo para confirmar la cita."
        );
        return;
      }
      if (!guestEmail.trim() || !guestEmail.includes("@")) {
        setBookingError("Por favor ingresa un correo electrónico válido.");
        return;
      }
      if (!guestPassword || guestPassword.length < 6) {
        setBookingError(
          "Ingresa una contraseña de al menos 6 caracteres para proteger tu cuenta y tus citas."
        );
        return;
      }
    }
    if (!selectedService || !selectedDateStr || !selectedTime) {
      setBookingError("Por favor selecciona servicio, fecha y horario.");
      return;
    }
    const cleanDigits = (customerPhone || "").replace(/\D/g, "");
    if (cleanDigits.length < 8 || cleanDigits.length > 15) {
      setBookingError(
        "Ingresa un número de celular / WhatsApp válido (mínimo 8 dígitos numéricos)."
      );
      return;
    }

    setBookingLoading(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: selectedService.id,
          staffId: selectedStaffId,
          date: selectedDateStr,
          time: selectedTime,
          customerName: currentUser?.name || guestName.trim(),
          customerEmail: currentUser?.email || guestEmail.trim(),
          customerPassword: currentUser ? undefined : guestPassword,
          customerPhone: customerPhone.trim(),
          customerNotes: customerNotes.trim().slice(0, 200),
        }),
      });
      const data = await res
        .json()
        .catch(() => ({ error: "Error en la respuesta del servidor." }));
      if (!res.ok) {
        setBookingError(data.error || "No se pudo crear la reserva");
        return;
      }
      setConfirmedAppointment(data.appointment);
      resetBookingWizardState({ keepConfirmed: true });
      setStep(5);
      onRefresh();
    } catch (err: unknown) {
      setBookingError(
        err instanceof Error
          ? err.message
          : "Error al conectar con el servidor"
      );
    } finally {
      setBookingLoading(false);
    }
  };

  const handleCancelAppointment = async (aptId: string) => {
    const fallbackWhatsApp = settings?.phoneWhatsapp
      ? buildWhatsAppUrl(
          settings.phoneWhatsapp,
          "Hola, necesito ayuda para reprogramar o cancelar mi cita."
        )
      : "#";
    try {
      const res = await fetch(`/api/appointments/${aptId}/cancel`, {
        method: "POST",
      });
      const data = await res
        .json()
        .catch(() => ({ error: "Error al cancelar." }));
      if (!res.ok) {
        setPolicyModal({
          open: true,
          message: data.error || "No es posible cancelar en este momento.",
          whatsappUrl: data.whatsappUrl || fallbackWhatsApp,
        });
        return;
      }
      onRefresh();
    } catch (err: unknown) {
      setPolicyModal({
        open: true,
        message:
          "Error al cancelar: " +
          (err instanceof Error ? err.message : "Error desconocido"),
        whatsappUrl: fallbackWhatsApp,
      });
    }
  };

  const handleAcknowledgeMove = async (aptOrId: PortalAppointment | string) => {
    const aptId = typeof aptOrId === "string" ? aptOrId : aptOrId?.id;
    const targetApt =
      typeof aptOrId === "object" && aptOrId
        ? aptOrId
        : userAppointments.find((a) => a.id === aptId);

    setNotifError(null);
    try {
      const res = await fetch(`/api/appointments/${aptId}/ack-move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedStartAt: targetApt?.startAt,
          expectedVersion: targetApt?.rescheduleVersion,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotifError(
          data.error ||
            "El estado de tu cita cambió recientemente. Se actualizó tu agenda."
        );
        onRefresh();
        return;
      }
      onRefresh();
    } catch (e) {
      console.error(e);
      setNotifError(
        "No se pudo confirmar el cambio de horario. Verifica tu conexión."
      );
    }
  };

  const handleRepeatService = (apt: PortalAppointment) => {
    const latestService =
      services.find((s) => s.id === (apt.serviceId || apt.service?.id)) ||
      apt.service;
    resetBookingWizardState({ keepService: Boolean(latestService) });
    if (latestService) {
      setSelectedService(latestService);
      setStep(2);
    } else {
      setStep(1);
    }
    setActiveTab("book");
  };

  const nowSnapshot = referenceNow;
  const maxActiveAllowed = settings?.maxActiveBookings ?? 2;
  const activeCount = userAppointments.filter((a) =>
    isUpcomingActiveAppointment(a, nowSnapshot)
  ).length;
  const rescheduledByStaff = userAppointments.find(
    (a) =>
      a.status === "RESCHEDULED_BY_STAFF" &&
      isUpcomingActiveAppointment(a, nowSnapshot)
  );
  const unreadCancelNotifs = notifications.filter(
    (n) =>
      !n.isRead &&
      !dismissedNotifIds.includes(n.id) &&
      n.type === "APPOINTMENT_CANCELLED"
  );
  const unreadCancelNotif = unreadCancelNotifs[0] || null;
  const cancelledByStaff = userAppointments.find(
    (a) =>
      a.status === "CANCELLED" &&
      Boolean(a.staffMoveReason) &&
      !dismissedNotifIds.includes(a.id) &&
      !notifications.some((n) => n.appointmentId === a.id && n.isRead)
  );
  const targetCancelledApt = unreadCancelNotif?.appointmentId
    ? userAppointments.find((a) => a.id === unreadCancelNotif.appointmentId)
    : cancelledByStaff;

  const eligibleStaffForSelectedService = useMemo(
    () => getEligibleStaffForService(selectedService),
    [getEligibleStaffForService, selectedService]
  );

  return (
    <div className="w-full max-w-md md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto min-h-dvh md:min-h-0 md:my-6 md:rounded-[32px] bg-white text-[#1F1F23] pb-16 md:pb-8 shadow-2xl relative border-x md:border border-zinc-200/80 flex flex-col transition-all duration-300">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {(activeTab === "my-appointments" || step === 1) && (
        <ClientHeader
          settings={settings}
          currentUser={currentUser}
          activeTab={activeTab}
          activeCount={activeCount}
          maxActiveAllowed={maxActiveAllowed}
          pwaInstalled={pwaInstalled}
          pushState={pushState}
          pushBusy={pushBusy}
          testingPush={testingPush}
          pushMessage={pushMessage}
          onDismissPushMessage={() => setPushMessage(null)}
          onOpenMapModal={() => setShowMapModal(true)}
          onOpenPwaModal={() => setShowPwaModal(true)}
          onOpenAuthModal={() => setShowAuthModal(true)}
          onTogglePush={handleToggleDevicePush}
          onTestPush={handleTestDevicePush}
          onSelectBookTab={() => {
            resetBookingWizardState();
            setActiveTab("book");
            setStep(1);
          }}
          onSelectMyAppointmentsTab={() => setActiveTab("my-appointments")}
        />
      )}

      <ClientAlertBanners
        step={step}
        settings={settings}
        currentUser={currentUser}
        rescheduledByStaff={rescheduledByStaff}
        unreadCancelNotifs={unreadCancelNotifs}
        unreadCancelNotif={unreadCancelNotif}
        cancelledByStaff={cancelledByStaff}
        targetCancelledApt={targetCancelledApt}
        notifError={notifError}
        onAcknowledgeMove={handleAcknowledgeMove}
        onCancelAppointment={handleCancelAppointment}
        onDismissNotification={handleDismissNotification}
        onRescheduleAfterCancel={(apt) => {
          resetBookingWizardState({
            keepService: Boolean(apt?.service),
            keepStaff: Boolean(apt?.staff?.id),
          });
          if (apt?.service) setSelectedService(apt.service);
          if (apt?.staff?.id) setSelectedStaffId(apt.staff.id);
          setActiveTab("book");
          setStep(apt?.service ? 3 : 1);
        }}
      />

      {activeTab === "book" && (
        <div className="flex-1 flex flex-col px-5 md:px-8 pt-2 pb-6">
          {step >= 2 && step <= 4 && (
            <div className="flex items-center justify-between pt-3 pb-5">
              <button
                onClick={() => {
                  if (step === 2) resetBookingWizardState();
                  setBookingError(null);
                  setStep((prev) => (prev - 1) as 1 | 2 | 3 | 4 | 5);
                }}
                className="w-11 h-11 rounded-full bg-[#1F1F23] text-white flex items-center justify-center shadow-sm hover:bg-black active:scale-95 transition-all"
                title="Regresar atrás"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="text-center">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                  Paso {step} de 4
                </span>
                <h2 className="text-base md:text-lg font-bold text-[#1F1F23]">
                  {step === 2 && "¿Con quién reservas?"}
                  {step === 3 && "Fecha y Horario"}
                  {step === 4 && "Resumen y Confirmar"}
                </h2>
              </div>

              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4].map((n) => (
                  <span
                    key={n}
                    className={`h-2 rounded-full transition-all ${
                      n <= step ? "w-6 bg-[#1F1F23]" : "w-2 bg-zinc-300"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <BookingStepService
              services={services}
              staffList={staffList}
              currencySymbol={settings?.currencySymbol || "$"}
              onSelectService={(svc) => {
                resetBookingWizardState({ keepService: true });
                setSelectedService(svc);
                setStep(2);
              }}
            />
          )}

          {step === 2 && (
            <BookingStepStaff
              selectedService={selectedService}
              settings={settings}
              referenceNowIso={referenceNow.toISOString()}
              eligibleStaff={eligibleStaffForSelectedService}
              onSelectStaff={(staffId) => {
                setSelectedStaffId(staffId);
                setSelectedDateStr(formatLocalDateYYYYMMDD(new Date(), businessTz));
                setSelectedTime("");
                setStep(3);
              }}
              onBackToServices={() => {
                resetBookingWizardState();
                setStep(1);
              }}
            />
          )}

          {step === 3 && (
            <BookingStepDateTime
              settings={settings}
              referenceNowIso={referenceNow.toISOString()}
              selectedService={selectedService}
              selectedStaffId={selectedStaffId}
              selectedStaffObj={selectedStaffObj}
              staffList={staffList}
              eligibleStaff={eligibleStaffForSelectedService}
              dateOptions={dateOptions}
              selectedDateStr={selectedDateStr}
              selectedTime={selectedTime}
              availableSlots={availableSlots}
              slotsLoading={slotsLoading}
              timeOffNotices={timeOffNotices}
              unavailableReason={unavailableReason}
              onSelectDate={(d) => {
                setBookingError(null);
                setSelectedDateStr(d);
              }}
              onSelectTime={(t) => {
                setBookingError(null);
                setSelectedTime(t);
              }}
              onContinue={() => {
                if (!selectedTime || !availableSlots.includes(selectedTime)) {
                  return;
                }
                setStep(4);
              }}
            />
          )}

          {step === 4 && (
            <BookingStepConfirm
              settings={settings}
              currentUser={currentUser}
              selectedService={selectedService}
              selectedStaffId={selectedStaffId}
              selectedStaffObj={selectedStaffObj}
              selectedDateStr={selectedDateStr}
              selectedTime={selectedTime}
              isHealthBusiness={isHealthBusiness}
              guestName={guestName}
              setGuestName={setGuestName}
              guestEmail={guestEmail}
              setGuestEmail={setGuestEmail}
              guestPassword={guestPassword}
              setGuestPassword={setGuestPassword}
              customerPhone={customerPhone}
              setCustomerPhone={setCustomerPhone}
              customerNotes={customerNotes}
              setCustomerNotes={setCustomerNotes}
              bookingError={bookingError}
              bookingLoading={bookingLoading}
              onOpenMapModal={() => setShowMapModal(true)}
              onOpenAuthModal={() => setShowAuthModal(true)}
              onLogout={handleLogout}
              onBackToSlots={() => {
                setSelectedTime("");
                setBookingError(null);
                setStep(3);
              }}
              onConfirmBooking={handleConfirmBooking}
            />
          )}

          {step === 5 && confirmedAppointment && (
            <BookingStepSuccess
              confirmedAppointment={confirmedAppointment}
              timezone={settings?.timezone}
              pushState={pushState}
              pushBusy={pushBusy}
              pushMessage={pushMessage}
              onTogglePush={handleToggleDevicePush}
              onViewMyAppointments={() => {
                resetBookingWizardState();
                setStep(1);
                setActiveTab("my-appointments");
              }}
              onBackHome={() => {
                resetBookingWizardState();
                setStep(1);
              }}
            />
          )}
        </div>
      )}

      {activeTab === "my-appointments" && (
        <ClientMyAppointmentsTab
          currentUser={currentUser}
          settings={settings}
          referenceNowIso={referenceNow.toISOString()}
          userAppointments={userAppointments}
          maxActiveAllowed={maxActiveAllowed}
          highlightedAppointmentId={highlightedAppointmentId}
          pushState={pushState}
          pushBusy={pushBusy}
          testingPush={testingPush}
          pushMessage={pushMessage}
          showHistory={showHistory}
          historyItems={historyItems}
          historyHasMore={historyHasMore}
          historyTotalCount={historyTotalCount}
          historyLoadingMore={historyLoadingMore}
          historyScrollRef={historyScrollRef}
          historySentinelRef={historySentinelRef}
          onDismissPushMessage={() => setPushMessage(null)}
          onTogglePush={handleToggleDevicePush}
          onTestPush={handleTestDevicePush}
          onToggleHistory={() => setShowHistory((prev) => !prev)}
          onLoadMoreHistory={loadMoreHistory}
          onOpenAuthModal={() => setShowAuthModal(true)}
          onBookNow={() => {
            resetBookingWizardState();
            setActiveTab("book");
            setStep(1);
          }}
          onAcknowledgeMove={handleAcknowledgeMove}
          onCancelAppointment={handleCancelAppointment}
          onRepeatService={handleRepeatService}
        />
      )}

      <CancellationPolicyModal
        policyModal={policyModal}
        onClose={() => setPolicyModal(null)}
      />

      <BranchLocationModal
        isOpen={showMapModal}
        onClose={() => setShowMapModal(false)}
        businessName={settings?.name}
        addressText={settings?.addressText}
        googleMapsUrl={settings?.googleMapsUrl}
      />

      <PwaInstallModal
        isOpen={showPwaModal}
        onClose={() => setShowPwaModal(false)}
        deferredPrompt={deferredPrompt}
        pwaInstalled={pwaInstalled}
        onInstallPrompted={() => {
          setDeferredPrompt(null);
          setPwaInstalled(true);
        }}
      />

      <ClientFooter
        businessName={settings?.name}
        addressText={settings?.addressText}
        isHealthBusiness={isHealthBusiness}
        serverYear={referenceNow.getUTCFullYear()}
      />

      <ClientAuthModal
        isOpen={showAuthModal}
        currentUser={currentUser}
        settings={settings}
        authMode={authMode}
        setAuthMode={setAuthMode}
        authEmail={authEmail}
        setAuthEmail={setAuthEmail}
        authPassword={authPassword}
        setAuthPassword={setAuthPassword}
        authName={authName}
        setAuthName={setAuthName}
        authPhone={authPhone}
        setAuthPhone={setAuthPhone}
        authLoading={authLoading}
        authError={authError}
        setAuthError={setAuthError}
        onSubmit={handleAuthSubmit}
        onLogout={handleLogout}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  );
}
