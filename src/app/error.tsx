"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-[28px] border border-zinc-200 p-7 shadow-lg text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-zinc-900">
            Ocurrió un inconveniente inesperado
          </h1>
          <p className="text-xs text-zinc-600 leading-relaxed">
            No pudimos cargar esta sección correctamente. Intenta recargar o vuelve al inicio.
            {error?.digest ? ` (Ref: ${error.digest})` : ""}
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-full bg-zinc-900 hover:bg-black text-white text-xs font-bold transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reintentar
          </button>
          <Link
            href="/"
            className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold transition-all"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
