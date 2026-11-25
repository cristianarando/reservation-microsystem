import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-[28px] border border-zinc-200 p-8 shadow-sm text-center space-y-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-100 text-zinc-900 font-bold text-lg">
          404
        </div>
        <h1 className="text-xl font-bold text-zinc-900">Página no encontrada</h1>
        <p className="text-xs text-zinc-600 leading-relaxed">
          La dirección que buscas no existe o fue movida. Puedes volver al portal principal de reservas.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center min-h-[44px] px-6 py-2.5 rounded-full bg-zinc-900 hover:bg-black text-white text-xs font-bold transition-all"
          >
            Volver a Reservas
          </Link>
        </div>
      </div>
    </div>
  );
}
