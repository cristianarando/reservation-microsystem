"use client";

import React from "react";
import Link from "next/link";
import { X } from "lucide-react";
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
  onSubmit,
  onLogout,
  onClose,
}: ClientAuthModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl relative border border-zinc-200 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-zinc-100">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
            {currentUser ? "Mi Perfil" : "Cuenta de Paciente"}
          </span>
          <button
            type="button"
            onClick={() => {
              onClose();
              setAuthError(null);
            }}
            aria-label="Cerrar ventana"
            className="w-9 h-9 rounded-full bg-zinc-100 text-zinc-600 flex items-center justify-center hover:bg-zinc-200 transition-all shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {currentUser ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#1F1F23] text-white flex items-center justify-center font-bold text-base uppercase shrink-0">
                {currentUser.name?.charAt(0) || "U"}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base text-zinc-900 truncate">
                  {currentUser.name}
                </h3>
                <p className="text-xs text-zinc-500 truncate">
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
              <div className="text-xs text-zinc-600 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200">
                <span className="text-zinc-400 block text-[10px]">
                  Teléfono registrado:
                </span>
                <span className="font-semibold">{currentUser.phone}</span>
              </div>
            )}

            {(currentUser.role === "ADMIN" ||
              currentUser.role === "PROVIDER") && (
              <a
                href="/admin"
                className="w-full min-h-[42px] py-3 rounded-full bg-[#1F1F23] text-white text-xs font-bold flex items-center justify-center gap-2 hover:bg-black transition-all shadow-md"
              >
                <span>Ir al Panel de Gestión</span>
                <span>→</span>
              </a>
            )}

            <button
              type="button"
              onClick={async () => {
                await onLogout();
                onClose();
              }}
              className="w-full min-h-[40px] py-2.5 rounded-full bg-zinc-100 text-red-600 hover:bg-red-50 text-xs font-bold transition-all border border-zinc-200"
            >
              Cerrar Sesión
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3.5">
            <a
              href="/api/auth/google?returnTo=/"
              className="w-full min-h-[44px] py-3 px-4 rounded-full bg-white hover:bg-zinc-50 text-zinc-800 text-xs font-bold border border-zinc-300 shadow-xs flex items-center justify-center gap-2.5 transition-all"
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continuar con Google (1 Clic)</span>
            </a>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-zinc-200" />
              <span className="text-[10px] text-zinc-400 font-semibold uppercase">
                O con correo electrónico
              </span>
              <div className="flex-1 h-px bg-zinc-200" />
            </div>

            <div className="bg-zinc-100 p-1 rounded-full flex items-center border border-zinc-200">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setAuthError(null);
                }}
                className={`flex-1 min-h-[36px] py-1.5 text-xs font-bold rounded-full transition-all ${
                  authMode === "login"
                    ? "bg-[#1F1F23] text-white shadow-xs"
                    : "text-zinc-600 hover:text-black"
                }`}
              >
                Iniciar Sesión
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("register");
                  setAuthError(null);
                }}
                className={`flex-1 min-h-[36px] py-1.5 text-xs font-bold rounded-full transition-all ${
                  authMode === "register"
                    ? "bg-[#1F1F23] text-white shadow-xs"
                    : "text-zinc-600 hover:text-black"
                }`}
              >
                Crear Cuenta
              </button>
            </div>

            <div>
              <h3 className="font-bold text-base text-zinc-900">
                {authMode === "login"
                  ? "Acceso Seguro a tu Cuenta"
                  : "Registro de Nuevo Cliente"}
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {authMode === "login"
                  ? "Ingresa tu correo y contraseña para ver tus citas o gestionar reservas."
                  : "Crea tu cuenta protegida para consultar tu historial médico y citas."}
              </p>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                {authError}
              </div>
            )}

            <div className="space-y-3">
              {authMode === "register" && (
                <div className="border border-zinc-300 bg-[#F4F4F6] rounded-xl px-3.5 py-2.5">
                  <label className="text-[11px] text-zinc-500 block font-medium">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full mt-0.5"
                  />
                </div>
              )}

              <div className="border border-zinc-300 bg-[#F4F4F6] rounded-xl px-3.5 py-2.5">
                <label className="text-[11px] text-zinc-500 block font-medium">
                  Correo Electrónico *
                </label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="tucorreo@ejemplo.com"
                  className="bg-transparent font-semibold text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full mt-0.5"
                />
              </div>

              {authMode === "register" && (
                <div className="border border-zinc-300 bg-[#F4F4F6] rounded-xl px-3.5 py-2.5">
                  <label className="text-[11px] text-zinc-500 block font-medium">
                    Teléfono / WhatsApp (Opcional)
                  </label>
                  <input
                    type="tel"
                    value={authPhone}
                    onChange={(e) => setAuthPhone(e.target.value)}
                    placeholder="+591 70000000"
                    className="bg-transparent font-medium text-base sm:text-xs text-[#1F1F23] focus:outline-none w-full mt-0.5"
                  />
                </div>
              )}

              <div className="border border-zinc-300 bg-[#F4F4F6] rounded-xl px-3.5 py-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-zinc-500 block font-medium">
                    Contraseña *
                  </label>
                  <span className="text-[10px] text-zinc-400">
                    Mín. 6 caracteres
                  </span>
                </div>
                <input
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
              <button
                type="submit"
                disabled={authLoading}
                className="w-full min-h-[44px] py-3.5 rounded-full bg-[#1F1F23] text-white text-xs font-bold hover:bg-black transition-all shadow-md disabled:opacity-50"
              >
                {authLoading
                  ? "Procesando..."
                  : authMode === "login"
                  ? "Iniciar Sesión"
                  : "Crear Cuenta y Continuar"}
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  setAuthError(null);
                  setAuthPassword("");
                }}
                className="w-full min-h-[40px] py-2.5 rounded-full bg-zinc-100 text-zinc-600 text-xs font-semibold hover:bg-zinc-200 transition-all"
              >
                Cerrar
              </button>

              <p className="text-[10px] text-zinc-400 text-center leading-relaxed pt-1">
                Al continuar aceptas nuestros{" "}
                <Link
                  href="/terminos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-600 underline hover:text-black"
                >
                  Términos y Condiciones
                </Link>{" "}
                y la{" "}
                <Link
                  href="/privacidad"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-600 underline hover:text-black"
                >
                  Política de Privacidad
                </Link>
                .
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
