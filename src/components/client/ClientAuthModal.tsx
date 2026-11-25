"use client";

import React, { useId } from "react";
import { X } from "lucide-react";
import { AccessibleModal } from "@/components/ui/AccessibleModal";
import { Button } from "@/components/ui/Button";
import { GoogleAuthButton } from "@/components/ui/GoogleAuthButton";
import type { PortalBusinessSettings, PortalUser } from "@/types/portal";

interface ClientAuthModalProps {
  isOpen: boolean;
  currentUser?: PortalUser | null;
  settings?: PortalBusinessSettings | null;
  authMode: "login" | "register";
  setAuthMode: (mode: "login" | "register") => void;
  authEmail: string;
  setAuthEmail: (val: string) => void;
  authPassword: string;
  setAuthPassword: (val: string) => void;
  authName: string;
  setAuthName: (val: string) => void;
  authPhone: string;
  setAuthPhone: (val: string) => void;
  authLoading: boolean;
  authError: string | null;
  setAuthError: (err: string | null) => void;
  onBeforeGoogleAuth?: () => void;
  onSubmit: (e?: React.FormEvent) => void;
  onLogout: () => Promise<void>;
  onClose: () => void;
}

export function ClientAuthModal({
  isOpen,
  currentUser,
  settings,
  authMode,
  setAuthMode,
  authEmail,
  setAuthEmail,
  authPassword,
  setAuthPassword,
  authName,
  setAuthName,
  authPhone,
  setAuthPhone,
  authLoading,
  authError,
  setAuthError,
  onBeforeGoogleAuth,
  onSubmit,
  onLogout,
  onClose,
}: ClientAuthModalProps) {
  const titleId = useId();
  const headingId = useId();
  const nameInputId = useId();
  const emailInputId = useId();
  const phoneInputId = useId();
  const passwordInputId = useId();

  if (!isOpen) return null;

  const handleClose = () => {
    onClose();
    setAuthError(null);
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={handleClose}
      labelledBy={currentUser ? titleId : headingId}
      maxWidthClass="max-w-sm"
      className="rounded-3xl p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-zinc-100">
        <span
          id={titleId}
          className="text-xs font-bold text-zinc-600 uppercase tracking-wider"
        >
          {currentUser ? "Mi Perfil" : "Cuenta de Paciente"}
        </span>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Cerrar ventana"
          className="w-11 h-11 sm:w-9 sm:h-9 rounded-full bg-zinc-100 text-zinc-700 flex items-center justify-center hover:bg-zinc-200 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {currentUser ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[var(--brand-primary,#1F1F23)] text-[var(--brand-primary-fg,#FFFFFF)] flex items-center justify-center font-bold text-base uppercase shrink-0">
              {currentUser.name?.charAt(0) || "U"}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base text-zinc-900 truncate">
                {currentUser.name}
              </h3>
              <p className="text-xs text-zinc-600 truncate">
                {currentUser.email}
              </p>
              <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700">
                {currentUser.role === "ADMIN"
                  ? "Administrador"
                  : currentUser.role === "PROVIDER"
                  ? settings?.staffLabel || "Doctor(a)"
                  : "Cliente"}
              </span>
            </div>
          </div>

          {currentUser.phone && (
            <div className="text-xs text-zinc-700 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200">
              <span className="text-zinc-500 block text-[10px]">
                Teléfono registrado:
              </span>
              <span className="font-semibold">{currentUser.phone}</span>
            </div>
          )}

          {(currentUser.role === "ADMIN" ||
            currentUser.role === "PROVIDER") && (
            <a
              href="/admin"
              className="w-full min-h-[44px] py-3 rounded-full bg-[var(--brand-primary,#1F1F23)] text-[var(--brand-primary-fg,#FFFFFF)] text-xs font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-md"
            >
              <span>Ir al Panel de Gestión</span>
              <span>→</span>
            </a>
          )}

          <Button
            variant="danger"
            size="pill"
            onClick={async () => {
              await onLogout();
              onClose();
            }}
            className="w-full min-h-[44px] py-2.5 font-bold"
          >
            Cerrar Sesión
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3.5">
          <GoogleAuthButton
            href="/api/auth/google?returnTo=/"
            label="Continuar con Google (1 Clic)"
            onBeforeNavigate={onBeforeGoogleAuth}
            className="rounded-full text-xs"
          />

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-zinc-200" />
            <span className="text-[10px] text-zinc-500 font-semibold uppercase">
              O con correo electrónico
            </span>
            <div className="flex-1 h-px bg-zinc-200" />
          </div>

          <div
            role="tablist"
            aria-label="Modo de acceso"
            className="bg-zinc-100 p-1 rounded-full flex items-center border border-zinc-200"
          >
            <button
              type="button"
              role="tab"
              aria-selected={authMode === "login"}
              onClick={() => {
                setAuthMode("login");
                setAuthError(null);
              }}
              className={`flex-1 min-h-[40px] sm:min-h-[36px] py-1.5 text-xs font-bold rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 ${
                authMode === "login"
                  ? "bg-[var(--brand-primary,#1F1F23)] text-[var(--brand-primary-fg,#FFFFFF)] shadow-xs"
                  : "text-zinc-600 hover:text-black"
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === "register"}
              onClick={() => {
                setAuthMode("register");
                setAuthError(null);
              }}
              className={`flex-1 min-h-[40px] sm:min-h-[36px] py-1.5 text-xs font-bold rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 ${
                authMode === "register"
                  ? "bg-[var(--brand-primary,#1F1F23)] text-[var(--brand-primary-fg,#FFFFFF)] shadow-xs"
                  : "text-zinc-600 hover:text-black"
              }`}
            >
              Crear Cuenta
            </button>
          </div>

          <div>
            <h3 id={headingId} className="font-bold text-base text-zinc-900">
              {authMode === "login"
                ? "Acceso Seguro a tu Cuenta"
                : "Registro de Nuevo Cliente"}
            </h3>
            <p className="text-xs text-zinc-600 mt-0.5">
              {authMode === "login"
                ? "Ingresa tu correo y contraseña para ver tus citas o gestionar reservas."
                : "Crea tu cuenta protegida para consultar tu historial y citas."}
            </p>
          </div>

          {authError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium"
            >
              {authError}
            </div>
          )}

          <div className="space-y-3">
            {authMode === "register" && (
              <div className="border border-zinc-300 bg-[#F4F4F6] rounded-xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-zinc-900/20">
                <label
                  htmlFor={nameInputId}
                  className="text-[11px] text-zinc-600 block font-medium"
                >
                  Nombre Completo *
                </label>
                <input
                  id={nameInputId}
                  type="text"
                  required
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full mt-0.5"
                />
              </div>
            )}

            <div className="border border-zinc-300 bg-[#F4F4F6] rounded-xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-zinc-900/20">
              <label
                htmlFor={emailInputId}
                className="text-[11px] text-zinc-600 block font-medium"
              >
                Correo Electrónico *
              </label>
              <input
                id={emailInputId}
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="tucorreo@ejemplo.com"
                className="bg-transparent font-semibold text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full mt-0.5"
              />
            </div>

            {authMode === "register" && (
              <div className="border border-zinc-300 bg-[#F4F4F6] rounded-xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-zinc-900/20">
                <label
                  htmlFor={phoneInputId}
                  className="text-[11px] text-zinc-600 block font-medium"
                >
                  Teléfono / WhatsApp (Opcional)
                </label>
                <input
                  id={phoneInputId}
                  type="tel"
                  value={authPhone}
                  onChange={(e) => setAuthPhone(e.target.value)}
                  placeholder="+591 70000000"
                  className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full mt-0.5"
                />
              </div>
            )}

            <div className="border border-zinc-300 bg-[#F4F4F6] rounded-xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-zinc-900/20">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={passwordInputId}
                  className="text-[11px] text-zinc-600 block font-medium"
                >
                  Contraseña *
                </label>
                <span className="text-[10px] text-zinc-500">
                  Mín. 6 caracteres
                </span>
              </div>
              <input
                id={passwordInputId}
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-transparent font-semibold text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full mt-0.5"
              />
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <Button
              type="submit"
              variant="primary"
              size="pill"
              disabled={authLoading}
              className="w-full min-h-[44px] py-3.5 font-bold"
            >
              {authLoading
                ? "Procesando..."
                : authMode === "login"
                ? "Iniciar Sesión"
                : "Crear Cuenta y Continuar"}
            </Button>

            <Button
              variant="secondary"
              size="pill"
              onClick={() => {
                handleClose();
                setAuthPassword("");
              }}
              className="w-full min-h-[44px] sm:min-h-[40px] py-2.5"
            >
              Cerrar
            </Button>
          </div>
        </form>
      )}
    </AccessibleModal>
  );
}
