"use client";

import React, { useId } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { AccessibleModal } from "@/components/ui/AccessibleModal";
import { Button } from "@/components/ui/Button";
import { formatSpanishTimeInTz, resolveBusinessTimeZone } from "@/lib/timezone";
import type { PortalAppointment, PortalBusinessSettings } from "@/types/portal";

export interface ConflictDataState {
  open: boolean;
  conflicts: PortalAppointment[];
  blockStart: string;
  blockEnd: string;
  type: string;
  reason: string;
}

interface ConflictResolutionModalProps {
  conflictData: ConflictDataState | null;
  setConflictData: React.Dispatch<
    React.SetStateAction<ConflictDataState | null>
  >;
  settings?: PortalBusinessSettings | null;
  onQuickImprevisto: (resolution?: string, overrideStaffId?: string) => void;
  onScheduleVacation: (resolution?: string) => void;
}

export function ConflictResolutionModal({
  conflictData,
  setConflictData,
  settings,
  onQuickImprevisto,
  onScheduleVacation,
}: ConflictResolutionModalProps) {
  const titleId = useId();
  if (!conflictData?.open) return null;

  const businessTz = resolveBusinessTimeZone(settings?.timezone);
  const onClose = () => setConflictData(null);

  return (
    <AccessibleModal
      isOpen={conflictData.open}
      onClose={onClose}
      labelledBy={titleId}
      maxWidthClass="max-w-sm"
      className="rounded-[32px] p-5 sm:p-6 border-2 border-amber-500"
    >
      <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-2">
        <AlertTriangle className="w-6 h-6" />
      </div>

      <h3 id={titleId} className="text-base font-bold text-center text-zinc-900">
        ¡Conflicto de Citas Detectado!
      </h3>
      <p className="text-xs text-zinc-600 text-center mt-1 leading-relaxed">
        Tienes <b>{conflictData.conflicts.length} cita(s) agendada(s)</b> en el
        horario que deseas bloquear:
      </p>

      <div className="my-3 p-3 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs max-h-36 overflow-y-auto space-y-2">
        {conflictData.conflicts.map((c) => (
          <div
            key={c.id}
            className="pb-1.5 border-b border-zinc-200 last:border-0"
          >
            <div className="font-bold text-zinc-900">
              {c.customer?.name} ({c.service?.name})
            </div>
            <div className="text-[11px] text-zinc-600">
              Hora: {formatSpanishTimeInTz(new Date(c.startAt), businessTz)} •
              Tel: {c.customer?.phone || "No registrado"}
            </div>
            {c.customerNotes && (
              <div className="mt-1 text-[11px] text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-2 py-1 break-words">
                <b>Nota:</b> {c.customerNotes}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[10px] text-zinc-500 text-center mb-4">
        ¿Qué deseas hacer con estas citas?
      </p>

      <div className="space-y-2">
        {conflictData.type === "LATE_START" ? (
          <Button
            variant="primary"
            size="pill"
            onClick={() => onQuickImprevisto("MOVE_TO_END")}
            className="w-full py-3"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Mover citas a la nueva hora de entrada y notificar</span>
          </Button>
        ) : (
          <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 text-center">
            Al cerrar el resto del día o la jornada completa, las citas
            afectadas deben cancelarse para notificar a los pacientes y
            permitirles elegir una nueva fecha.
          </div>
        )}

        <Button
          variant="danger"
          size="pill"
          onClick={() =>
            conflictData.type === "VACATION"
              ? onScheduleVacation("CANCEL_ALL")
              : onQuickImprevisto("CANCEL_ALL")
          }
          className="w-full py-2.5"
        >
          Cancelar citas afectadas y notificar al cliente
        </Button>

        <Button
          variant="ghost"
          size="pill"
          onClick={onClose}
          className="w-full py-2 text-zinc-600"
        >
          Volver atrás sin bloquear
        </Button>
      </div>
    </AccessibleModal>
  );
}
