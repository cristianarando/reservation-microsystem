"use client";

import React from "react";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-[#EBEBEF] text-[#1F1F23] flex items-center justify-center p-4 font-sans antialiased">
        <div className="max-w-md w-full bg-white rounded-[28px] border border-zinc-200 p-7 shadow-lg text-center space-y-4">
          <h1 className="text-lg font-bold text-zinc-900">
            Error del sistema
          </h1>
          <p className="text-xs text-zinc-600">
            Hubo un problema al renderizar la aplicación. Pulsa el botón para reintentar.
          </p>
          <button
            type="button"
            onClick={reset}
            className="min-h-[44px] px-5 py-2.5 rounded-full bg-zinc-900 text-white text-xs font-bold"
          >
            Recargar aplicación
          </button>
        </div>
      </body>
    </html>
  );
}
