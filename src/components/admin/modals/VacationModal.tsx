"use client";

import React, { useId } from "react";
import { AccessibleModal } from "@/components/ui/AccessibleModal";
import { Button } from "@/components/ui/Button";
import { formatLocalDateYYYYMMDD } from "@/lib/date-utils";
import { resolveBusinessTimeZone } from "@/lib/timezone";
import { validateVacationRange } from "@/lib/validation/acceptance-criteria";
import type { PortalBusinessSettings, PortalStaffMember } from "@/types/portal";

export interface VacationModalState {
  open: boolean;
  staffId: string;
  startDate: string;
  endDate: string;
  reason: string;
  publicNote?: string;
}

interface VacationModalProps {
  vacationModal: VacationModalState;
  setVacationModal: React.Dispatch<React.SetStateAction<VacationModalState>>;
  selectedStaffId: string;
  isOwnerAdmin: boolean;
  staffList: PortalStaffMember[];
  settings?: PortalBusinessSettings | null;
  resolveOverrideTargets: (targetId: string) => PortalStaffMember[];
  onScheduleVacation: (resolution?: string) => void;
}

export function VacationModal({
  vacationModal,
  setVacationModal,
  selectedStaffId,
  isOwnerAdmin,
  staffList,
  settings,
  resolveOverrideTargets,
  onScheduleVacation,
}: VacationModalProps) {
  const titleId = useId();
  const staffSelectId = useId();
  const startInputId = useId();
  const endInputId = useId();
  const reasonInputId = useId();
  const publicNoteInputId = useId();

  if (!vacationModal.open) return null;

  const now = new Date();
  const businessTz = resolveBusinessTimeZone(settings?.timezone);
  const todayStr = formatLocalDateYYYYMMDD(now, businessTz);
  const vacTargetId = vacationModal.staffId || selectedStaffId;
  const vacTargets = resolveOverrideTargets(vacTargetId);
  const hasBothDates = Boolean(
    vacationModal.startDate && vacationModal.endDate
  );
  const vacCheck = validateVacationRange({
    startDate: vacationModal.startDate,
    endDate: vacationModal.endDate || vacationModal.startDate,
    targets: vacTargets,
    now,
  });
  const canSubmitVacation = hasBothDates && vacCheck.valid;

  const onClose = () =>
    setVacationModal((prev) => ({ ...prev, open: false }));

  return (
    <AccessibleModal
      isOpen={vacationModal.open}
      onClose={onClose}
      labelledBy={titleId}
      maxWidthClass="max-w-sm"
      className="rounded-[32px] p-5 sm:p-6"
    >
      <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-2 text-2xl">
        🏖️
      </div>
      <h3 id={titleId} className="text-base font-bold text-center text-zinc-900">
        Programar Vacaciones o Receso
      </h3>
      <p className="text-xs text-zinc-500 text-center mt-1">
        Selecciona el rango de fechas. El sistema bloqueará automáticamente
        nuevas reservas en ese periodo, mientras sigues atendiendo con normalidad
        hoy.
      </p>

      <div className="mt-4 space-y-3 text-xs">
        {vacationModal.startDate && !vacCheck.valid && (
          <div className="p-3 rounded-2xl bg-red-50 border border-red-300 text-xs text-red-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-red-800">
              <span>🔒 Rango no disponible</span>
            </div>
            <p className="text-[11px] leading-relaxed">{vacCheck.error}</p>
          </div>
        )}

        {isOwnerAdmin && staffList.length > 1 && (
          <div>
            <label
              htmlFor={staffSelectId}
              className="text-[10px] font-bold text-zinc-500 uppercase block mb-1"
            >
              Profesional
            </label>
            <select
              id={staffSelectId}
              value={vacationModal.staffId || selectedStaffId}
              onChange={(e) =>
                setVacationModal({
                  ...vacationModal,
                  staffId: e.target.value,
                })
              }
              className="w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-xs bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
            >
              {staffList.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.displayName} ({st.specialtyTitle || "Especialista"})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label
              htmlFor={startInputId}
              className="text-[10px] font-bold text-zinc-500 uppercase block mb-1"
            >
              Desde (Inicio)
            </label>
            <input
              id={startInputId}
              type="date"
              min={todayStr}
              value={vacationModal.startDate}
              onChange={(e) =>
                setVacationModal({
                  ...vacationModal,
                  startDate: e.target.value,
                })
              }
              className="w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
            />
          </div>
          <div>
            <label
              htmlFor={endInputId}
              className="text-[10px] font-bold text-zinc-500 uppercase block mb-1"
            >
              Hasta (Retorno)
            </label>
            <input
              id={endInputId}
              type="date"
              min={vacationModal.startDate || todayStr}
              value={vacationModal.endDate}
              onChange={(e) =>
                setVacationModal({
                  ...vacationModal,
                  endDate: e.target.value,
                })
              }
              className="w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor={reasonInputId}
            className="text-[10px] font-bold text-zinc-500 uppercase block mb-1"
          >
            Motivo interno (Opcional)
          </label>
          <input
            id={reasonInputId}
            type="text"
            value={vacationModal.reason}
            onChange={(e) =>
              setVacationModal({
                ...vacationModal,
                reason: e.target.value,
              })
            }
            placeholder="Ej. Vacaciones de verano / Congreso"
            className="w-full p-2.5 rounded-2xl border border-zinc-300 text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
          />
        </div>

        <div>
          <label
            htmlFor={publicNoteInputId}
            className="text-[10px] font-bold text-zinc-500 uppercase block mb-1"
          >
            Nota pública para pacientes (Opcional)
          </label>
          <input
            id={publicNoteInputId}
            type="text"
            value={vacationModal.publicNote || ""}
            onChange={(e) =>
              setVacationModal({
                ...vacationModal,
                publicNote: e.target.value,
              })
            }
            placeholder="Ej. Retornamos el lunes con horario habitual"
            className="w-full p-2.5 rounded-2xl border border-zinc-300 text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
          />
        </div>

        {hasBothDates &&
          vacCheck.valid &&
          vacationModal.startDate <= vacationModal.endDate &&
          (() => {
            const totalDays =
              Math.ceil(
                (new Date(vacationModal.endDate).getTime() -
                  new Date(vacationModal.startDate).getTime()) /
                  (1000 * 60 * 60 * 24)
              ) + 1;
            return (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-medium">
                🏖️ Se{" "}
                {totalDays === 1
                  ? "bloqueará 1 día"
                  : `bloquearán ${totalDays} días`}{" "}
                para reservas en línea.
              </div>
            );
          })()}
      </div>

      <div className="mt-5 flex gap-2">
        <Button
          variant="primary"
          size="pill"
          disabled={!canSubmitVacation}
          onClick={() => onScheduleVacation()}
          className="flex-1 py-3"
        >
          Confirmar Vacaciones
        </Button>
        <Button
          variant="secondary"
          size="pill"
          onClick={onClose}
          className="py-3 px-4"
        >
          Cancelar
        </Button>
      </div>
    </AccessibleModal>
  );
}
