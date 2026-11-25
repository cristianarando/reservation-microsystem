"use client";

import React, { useCallback, useState } from "react";
import type { ToastItem } from "@/components/ui/ToastContainer";
import { compressImageFileToDataUrl } from "@/lib/image-utils";
import type { PortalBusinessSettings } from "@/types/portal";

type SettingsFormUpdater =
  | PortalBusinessSettings
  | ((prev: PortalBusinessSettings) => PortalBusinessSettings);

const DEFAULT_SETTINGS_FORM: PortalBusinessSettings = {
  name: "Mi Negocio",
  tagline: "",
  staffLabel: "Especialista",
  currencySymbol: "Bs",
  addressText: "",
  phoneWhatsapp: "",
};

interface UseAdminSettingsOptions {
  settings?: PortalBusinessSettings | null;
  isOwnerAdmin: boolean;
  showToast: (type: ToastItem["type"], title: string, message?: string) => void;
  onRefresh: () => void;
}

export function useAdminSettings({
  settings,
  isOwnerAdmin,
  showToast,
  onRefresh,
}: UseAdminSettingsOptions) {
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(
          "error",
          "Error al cambiar bloqueo",
          data.error || "No se pudo actualizar el estado del cliente."
        );
        return;
      }
      showToast(
        isBlocked ? "success" : "warning",
        isBlocked ? "Cliente Desbloqueado" : "Cliente Bloqueado",
        isBlocked
          ? "El cliente puede volver a realizar reservas en línea."
          : "Se bloqueó el acceso de reserva en línea para este cliente."
      );
      onRefresh();
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(
          "error",
          "Error al resetear inasistencias",
          data.error || "No se pudo limpiar el historial."
        );
        return;
      }
      showToast(
        "success",
        "Historial Limpiado",
        "Se reiniciaron las inasistencias y se desbloqueó al cliente."
      );
      onRefresh();
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
    if (
      !settingsForm?.addressText ||
      settingsForm.addressText.trim().length < 5
    ) {
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
        const err = await res.json().catch(() => ({}));
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
    savingSettings,
    settingsForm,
    setSettingsForm,
    handleToggleBlockUser,
    handleResetUserStrikes,
    handleLogoFileUpload,
    handleSaveSettings,
  };
}
