"use client";

import React, { useId } from "react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { AccessibleModal } from "@/components/ui/AccessibleModal";
import { Button } from "@/components/ui/Button";
import { formatSpanishTimeInTz, resolveBusinessTimeZone } from "@/lib/timezone";
import type { PortalAppointment, PortalBusinessSettings } from "@/types/portal";

interface NoShowStrikeModalProps {
  noShowModalData: PortalAppointment | null;
  setNoShowModalData: React.Dispatch<
    React.SetStateAction<PortalAppointment | null>
  >;
  settings?: PortalBusinessSettings | null;
  onStatusChange: (
    aptId: string,
    status: string,
    blockCustomer?: boolean,
    customReason?: string
  ) => Promise<void>;
  getWhatsAppNoShowUrl: (apt: PortalAppointment) => string;
}

export function NoShowStrikeModal({
  noShowModalData,
  setNoShowModalData,
  settings,
  onStatusChange,
  getWhatsAppNoShowUrl,
}: NoShowStrikeModalProps) {
  const titleId = useId();
  if (!noShowModalData) return null;

  const businessTz = resolveBusinessTimeZone(settings?.timezone);
  const onClose = () => setNoShowModalData(null);

  return (
    <AccessibleModal
      isOpen={Boolean(noShowModalData)}
      onClose={onClose}
      labelledBy={titleId}
      maxWidthClass="max-w-sm"
      className="rounded-[32px] p-5 sm:p-6 border-2 border-amber-400"
    >
      <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3 text-2xl font-bold">
        ⚠️
      </div>
      <h3 id={titleId} className="text-base font-bold text-center text-zinc-900">
        Registrar Inasistencia
      </h3>
      <p className="text-xs text-zinc-600 text-center mt-1 leading-relaxed">
        El paciente o cliente no se presentó a su horario reservado.
      </p>

      <div className="my-3.5 p-3.5 bg-zinc-100 rounded-2xl text-xs space-y-1">
        <div className="font-bold text-zinc-900">
          {noShowModalData.customer?.name || "Cliente"} •{" "}
          {noShowModalData.customer?.phone || "Sin tel."}
        </div>
        <div className="text-zinc-600">
          {noShowModalData.service?.name} —{" "}
          {formatSpanishTimeInTz(new Date(noShowModalData.startAt), businessTz)}
        </div>
        {noShowModalData.customerNotes && (
          <div className="mt-1.5 p-2 rounded-xl bg-white border border-zinc-200 text-[11px] text-zinc-700 break-words">
            <b>Nota del cliente:</b> {noShowModalData.customerNotes}
          </div>
        )}
        <div className="mt-2 pt-2 border-t border-zinc-200 flex items-center justify-between">
          <span className="text-zinc-600">Inasistencias registradas:</span>
          <span className="font-bold text-amber-800">
            {noShowModalData.customer?.noShowCount || 0} acumulada(s)
          </span>
        </div>
        {(noShowModalData.customer?.noShowCount || 0) + 1 >= 2 && (
          <div className="mt-2.5 p-2 bg-red-100 border border-red-300 rounded-xl text-red-900 font-semibold text-[11px] leading-tight flex items-start gap-1.5">
            <span>🛡️</span>
            <div>
              <b>Límite del sistema activado:</b> Al registrar esta falta
              acumulará 2 inasistencias y su cuenta será{" "}
              <b>bloqueada automáticamente</b> para nuevas reservas online.
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2 mt-4">
        <a
          href={getWhatsAppNoShowUrl(noShowModalData)}
          target="_blank"
          rel="noreferrer"
          className="w-full py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all min-h-[44px]"
        >
          <WhatsAppIcon className="w-3.5 h-3.5" />
          <span>Avisar por WhatsApp y consultar motivo</span>
        </a>

        <Button
          variant="primary"
          size="pill"
          onClick={async () => {
            await onStatusChange(noShowModalData.id, "NO_SHOW");
            setNoShowModalData(null);
          }}
          className="w-full py-3 font-bold"
        >
          ⚠️ Confirmar Inasistencia (+1 Falta)
        </Button>

        <Button
          variant="danger"
          size="pill"
          onClick={async () => {
            await onStatusChange(noShowModalData.id, "NO_SHOW", true);
            setNoShowModalData(null);
          }}
          className="w-full py-2.5 font-bold"
        >
          🚫 Registrar y Bloquear Cuenta de Inmediato
        </Button>

        <Button
          variant="ghost"
          size="pill"
          onClick={onClose}
          className="w-full py-2 text-zinc-600"
        >
          Volver atrás sin cambios
        </Button>
      </div>
    </AccessibleModal>
  );
}
