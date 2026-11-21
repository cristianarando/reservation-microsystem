"use client";

import React from "react";
import { CalendarOff, ChevronRight, Sparkles } from "lucide-react";
import { StaffAvatar } from "@/components/ui/StaffAvatar";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import {
  describeTimeOffBlock,
  getStaffWindowTimeOffs,
} from "@/lib/timeoff-utils";
import type {
  PortalBusinessSettings,
  PortalService,
  PortalStaffMember,
} from "@/types/portal";

interface BookingStepStaffProps {
  selectedService: PortalService | null;
  settings?: PortalBusinessSettings | null;
  eligibleStaff: PortalStaffMember[];
  onSelectStaff: (staffId: string) => void;
  onBackToServices: () => void;
}

export function BookingStepStaff({
  selectedService,
  settings,
  eligibleStaff,
  onSelectStaff,
  onBackToServices,
}: BookingStepStaffProps) {
  const horizonDays = settings?.bookingHorizonDays || 7;
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + horizonDays,
    23,
    59,
    59
  );

  const isStaffOnVacationEntireWindow = (st: PortalStaffMember) => {
    if (st.isActive === false) return true;
    if (Array.isArray(st.workingShifts) && st.workingShifts.length === 0) {
      return true;
    }
    const { coveringWholeWindow } = getStaffWindowTimeOffs(
      st.timeOffs || [],
      windowStart,
      windowEnd
    );
    return Boolean(coveringWholeWindow);
  };

  const availableStaff = eligibleStaff.filter(
    (st) => !isStaffOnVacationEntireWindow(st)
  );
  const vacationStaff = eligibleStaff.filter((st) =>
    isStaffOnVacationEntireWindow(st)
  );

  const renderVacationStaffCard = (st: PortalStaffMember, compact: boolean) => {
    const { coveringWholeWindow } = getStaffWindowTimeOffs(
      st.timeOffs || [],
      windowStart,
      windowEnd
    );
    const vacInfo = coveringWholeWindow
      ? describeTimeOffBlock(coveringWholeWindow)
      : null;

    return (
      <div
        key={st.id}
        className={
          compact
            ? "p-2.5 rounded-xl bg-white/90 border border-zinc-200/80 flex items-start gap-2.5 opacity-90"
            : "w-full text-left bg-zinc-50 border border-dashed border-zinc-300 text-zinc-500 rounded-2xl p-3 pr-4 flex items-center justify-between cursor-not-allowed opacity-85"
        }
      >
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div
            className={`${
              compact ? "w-9 h-9" : "w-12 h-12"
            } rounded-full overflow-hidden bg-zinc-200 border-2 border-zinc-300 flex-shrink-0 grayscale`}
          >
            <StaffAvatar staff={st} textClassName="text-xs text-zinc-600" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm text-zinc-700 flex items-center gap-1.5 flex-wrap">
              <span className="truncate">{st.displayName}</span>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                {vacInfo?.badgeEmoji || "🏖️"} En vacaciones
              </span>
            </div>
            <div className="text-xs text-zinc-500 mt-0.5 leading-snug">
              {vacInfo
                ? vacInfo.periodLabel
                : st.isActive === false
                ? "Agenda pausada temporalmente"
                : `Sin turnos en los próximos ${horizonDays} días`}
            </div>
            {vacInfo?.note && (
              <div className="text-[11px] text-amber-900 bg-amber-50/90 border border-amber-200/80 rounded-lg px-2 py-1 mt-1 break-words">
                <span className="font-semibold">Motivo:</span> {vacInfo.note}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="mb-4 md:mb-6 flex items-center justify-between flex-wrap gap-x-3 gap-y-1 bg-zinc-100 rounded-2xl md:rounded-full px-4 py-2.5 md:px-5 md:py-3 text-xs md:text-sm">
        <span className="font-semibold text-zinc-700 min-w-0 truncate">
          {selectedService?.name}
        </span>
        <span className="font-bold text-[#1F1F23] whitespace-nowrap shrink-0">
          {settings?.currencySymbol || "$"}
          {selectedService?.price?.toFixed(2)} • {selectedService?.durationMin} min
        </span>
      </div>

      {availableStaff.length === 0 ? (
        <div className="py-8 px-6 bg-amber-50/70 border border-amber-200/80 rounded-[28px] text-center shadow-xs">
          <div className="w-14 h-14 mx-auto mb-3.5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
            <CalendarOff className="w-7 h-7" />
          </div>
          <h3 className="font-extrabold text-zinc-900 text-base md:text-lg">
            No hay {settings?.staffLabel?.toLowerCase() || "profesionales"} disponibles en este momento
          </h3>
          <p className="text-xs md:text-sm text-zinc-600 mt-2 max-w-md mx-auto leading-relaxed">
            {eligibleStaff.length === 0
              ? "Actualmente no hay especialistas habilitados para realizar este servicio en la agenda en línea."
              : `Todo el personal habilitado para este servicio se encuentra en periodo de vacaciones o descanso programado durante los próximos ${horizonDays} días.`}
          </p>
          <div className="mt-3 p-3 rounded-2xl bg-white/80 border border-amber-200/60 max-w-md mx-auto text-xs text-amber-900 font-medium leading-relaxed">
            💡 Para consultar cuándo se reanudan los turnos normales, coordinar una urgencia o solicitar un sobrecupo especial, por favor contacta directamente con el responsable o administración de la clínica.
          </div>

          <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            {settings?.phoneWhatsapp && (
              <a
                href={`https://wa.me/${settings.phoneWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
                  `Hola, quisiera consultar con el responsable de la clínica sobre disponibilidad de citas para ${selectedService?.name || "atención médica"}, ya que el equipo no cuenta con turnos disponibles en línea.`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all"
              >
                <WhatsAppIcon className="w-4 h-4" />
                <span>Contactar al responsable por WhatsApp</span>
              </a>
            )}
            <button
              type="button"
              onClick={onBackToServices}
              className="w-full sm:w-auto px-4 py-2.5 rounded-full bg-zinc-200 hover:bg-zinc-300 text-zinc-800 font-semibold text-xs transition-all"
            >
              ← Volver a Servicios
            </button>
          </div>

          {vacationStaff.length > 0 && (
            <div className="mt-6 pt-5 border-t border-amber-200/70 text-left">
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2.5 text-center">
                Equipo en periodo de receso / vacaciones:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
                {vacationStaff.map((st) => renderVacationStaffCard(st, true))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs md:text-sm text-zinc-600 mb-3 md:mb-4">
            Elige con quién deseas atenderte o selecciona cualquiera disponible:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <button
              onClick={() => onSelectStaff("ANY")}
              className="w-full text-left bg-[#1F1F23] text-white rounded-2xl md:rounded-full p-3 pr-4 flex items-center justify-between gap-3 shadow-sm hover:opacity-95 transition-all md:col-span-2 lg:col-span-3 hover:shadow-md"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-12 h-12 rounded-full bg-white/15 text-white flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm md:text-base leading-snug">
                    Cualquier {settings?.staffLabel || "Profesional"} disponible
                  </div>
                  <div className="text-xs text-zinc-300 leading-snug">
                    Muestra la mayor cantidad de horarios libres
                  </div>
                </div>
              </div>
              <div className="w-9 h-9 rounded-full bg-white text-[#1F1F23] flex items-center justify-center flex-shrink-0">
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>

            {availableStaff.map((st) => {
              const { upcomingVacations } = getStaffWindowTimeOffs(
                st.timeOffs || [],
                windowStart,
                windowEnd
              );
              const nextVacInfo = upcomingVacations[0]
                ? describeTimeOffBlock(upcomingVacations[0])
                : null;

              return (
                <button
                  key={st.id}
                  onClick={() => onSelectStaff(st.id)}
                  className={`w-full text-left bg-zinc-100 hover:bg-zinc-200/80 border border-zinc-200 text-[#1F1F23] rounded-2xl ${
                    nextVacInfo ? "md:rounded-[28px]" : "md:rounded-full"
                  } p-2.5 pr-4 flex items-center justify-between gap-3 shadow-2xs transition-all hover:shadow-sm`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-300 border-2 border-white flex-shrink-0">
                      <StaffAvatar staff={st} textClassName="text-xs text-zinc-700" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-[#1F1F23] break-words">
                        {st.displayName}
                      </div>
                      <div className="text-xs text-zinc-600 line-clamp-2">
                        {st.specialtyTitle}
                      </div>
                      {nextVacInfo && (
                        <div className="mt-1 inline-flex items-center gap-1 flex-wrap px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200/80 text-[10px] font-semibold text-amber-900 break-words">
                          <span>{nextVacInfo.badgeEmoji}</span>
                          <span>Vacaciones: {nextVacInfo.periodLabel}</span>
                          {nextVacInfo.note && (
                            <span className="text-amber-800">• {nextVacInfo.note}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-[#1F1F23] text-white flex items-center justify-center flex-shrink-0">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </button>
              );
            })}

            {vacationStaff.map((st) => renderVacationStaffCard(st, false))}
          </div>
        </>
      )}
    </div>
  );
}
