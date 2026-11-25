"use client";

import React from "react";
import { ArrowRight } from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { formatLocalDateYYYYMMDD } from "@/lib/date-utils";
import {
  formatSpanishDateInTz,
  getDayOfWeekInTz,
  resolveBusinessTimeZone,
} from "@/lib/timezone";
import {
  AvailabilityUnavailableReason,
  PublicTimeOffNotice,
  describeTimeOffBlock,
  isTimeOffOnDate,
} from "@/lib/timeoff-utils";
import type {
  PortalBusinessSettings,
  PortalService,
  PortalStaffMember,
} from "@/types/portal";

const EMPTY_STATE_THEMES: Record<
  string,
  { box: string; title: string; divider: string; emoji?: string }
> = {
  VACATION: {
    box: "bg-amber-50/80 border-amber-200 text-amber-950",
    title: "text-amber-950",
    divider: "border-amber-200/80",
    emoji: "🏖️",
  },
  STAFF_PAUSED: {
    box: "bg-amber-50/80 border-amber-200 text-amber-950",
    title: "text-amber-950",
    divider: "border-amber-200/80",
    emoji: "🏖️",
  },
  FULL_DAY_OFF: {
    box: "bg-rose-50/60 border-rose-200 text-rose-950",
    title: "text-rose-950",
    divider: "border-rose-200/80",
    emoji: "⛔",
  },
  TIME_OFF_BLOCKED: {
    box: "bg-amber-50/60 border-amber-200 text-zinc-800",
    title: "text-zinc-900",
    divider: "border-amber-200/80",
    emoji: "⏳",
  },
  NO_WORKING_SHIFT: {
    box: "bg-zinc-100/90 border-zinc-300 text-zinc-800",
    title: "text-zinc-900",
    divider: "border-zinc-200",
    emoji: "🌙",
  },
};

const DEFAULT_EMPTY_THEME: {
  box: string;
  title: string;
  divider: string;
  emoji?: string;
} = {
  box: "bg-zinc-50 border-zinc-200 text-zinc-600",
  title: "text-zinc-800",
  divider: "border-zinc-200",
};

interface DateOptionItem {
  dateStr: string;
  dayShort: string;
  dayNumber: number;
  label: string;
  isToday: boolean;
}

interface BookingStepDateTimeProps {
  settings?: PortalBusinessSettings | null;
  referenceNowIso?: string;
  selectedService: PortalService | null;
  selectedStaffId: string;
  selectedStaffObj?: PortalStaffMember;
  staffList: PortalStaffMember[];
  eligibleStaff: PortalStaffMember[];
  dateOptions: DateOptionItem[];
  selectedDateStr: string;
  selectedTime: string;
  availableSlots: string[];
  slotsLoading: boolean;
  timeOffNotices: PublicTimeOffNotice[];
  unavailableReason: AvailabilityUnavailableReason | null;
  onSelectDate: (dateStr: string) => void;
  onSelectTime: (slot: string) => void;
  onContinue: () => void;
}

export function BookingStepDateTime({
  settings,
  referenceNowIso,
  selectedService,
  selectedStaffId,
  selectedStaffObj,
  staffList,
  eligibleStaff,
  dateOptions,
  selectedDateStr,
  selectedTime,
  availableSlots,
  slotsLoading,
  timeOffNotices,
  unavailableReason,
  onSelectDate,
  onSelectTime,
  onContinue,
}: BookingStepDateTimeProps) {
  const businessTz = resolveBusinessTimeZone(settings?.timezone);
  const referenceNow = referenceNowIso ? new Date(referenceNowIso) : new Date();
  const calendarTargetStaff =
    selectedStaffId !== "ANY"
      ? staffList.filter((s) => s.id === selectedStaffId)
      : eligibleStaff.filter((s) => s.isActive !== false);

  const isTodaySelected =
    selectedDateStr === formatLocalDateYYYYMMDD(referenceNow, businessTz);
  const theme =
    (unavailableReason?.code && EMPTY_STATE_THEMES[unavailableReason.code]) ||
    DEFAULT_EMPTY_THEME;
  const heading =
    unavailableReason?.title ||
    (isTodaySelected
      ? "No quedan horarios disponibles para hoy."
      : "Sin cupos disponibles en esta fecha.");
  const description =
    unavailableReason?.description ||
    (isTodaySelected
      ? "El horario de atención ha finalizado o los cupos de hoy están completos. Selecciona mañana u otra fecha en el calendario."
      : "No hay turnos libres para este día. Por favor elige otra fecha disponible en el calendario.");
  const blocks = unavailableReason?.blocks || [];

  return (
    <div className="flex-1 flex flex-col justify-between">
      <div>
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="bg-zinc-100 text-zinc-800 px-3 py-1.5 rounded-full text-xs font-semibold">
            {selectedService?.name} ({settings?.currencySymbol || "$"}
            {selectedService?.price})
          </span>
          <span className="bg-zinc-100 text-zinc-800 px-3 py-1.5 rounded-full text-xs font-semibold">
            {selectedStaffId === "ANY"
              ? `Cualquier ${settings?.staffLabel || "Profesional"}`
              : selectedStaffObj?.displayName}
          </span>
        </div>

        <div className="md:grid md:grid-cols-12 md:gap-8 items-start">
          <div className="md:col-span-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                Selecciona el día
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const idx = dateOptions.findIndex(
                      (d) => d.dateStr === selectedDateStr
                    );
                    if (idx > 0) onSelectDate(dateOptions[idx - 1].dateStr);
                  }}
                  className="w-9 h-9 rounded-full bg-zinc-200 hover:bg-zinc-300 text-zinc-800 flex items-center justify-center text-sm font-bold transition-all active:scale-95"
                  title="Día anterior"
                  aria-label="Día anterior"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const idx = dateOptions.findIndex(
                      (d) => d.dateStr === selectedDateStr
                    );
                    if (idx < dateOptions.length - 1) {
                      onSelectDate(dateOptions[idx + 1].dateStr);
                    }
                  }}
                  className="w-9 h-9 rounded-full bg-zinc-200 hover:bg-zinc-300 text-zinc-800 flex items-center justify-center text-sm font-bold transition-all active:scale-95"
                  title="Día siguiente"
                  aria-label="Día siguiente"
                >
                  ›
                </button>
              </div>
            </div>

            <div className="overflow-x-auto no-scrollbar pill-slider flex items-stretch md:grid md:grid-cols-3 gap-2.5 py-2 px-1.5 -mx-1">
              {dateOptions.map((item) => {
                const isSelected = selectedDateStr === item.dateStr;
                const matchingFullBlocks =
                  calendarTargetStaff.length > 0 &&
                  calendarTargetStaff.every((st) =>
                    (st.timeOffs || []).some(
                      (to) =>
                        (to.type === "VACATION" || to.type === "FULL_DAY_OFF") &&
                        isTimeOffOnDate(to, item.dateStr)
                    )
                  )
                    ? calendarTargetStaff.flatMap((st) =>
                        (st.timeOffs || []).filter(
                          (to) =>
                            (to.type === "VACATION" ||
                              to.type === "FULL_DAY_OFF") &&
                            isTimeOffOnDate(to, item.dateStr)
                        )
                      )
                    : [];
                const hasVacationBadge = matchingFullBlocks.some(
                  (to) => to.type === "VACATION"
                );
                const hasClosedBadge =
                  !hasVacationBadge && matchingFullBlocks.length > 0;
                const itemDayOfWeek = getDayOfWeekInTz(item.dateStr, businessTz);
                const hasWorkingShiftOnDay =
                  calendarTargetStaff.length === 0 ||
                  calendarTargetStaff.some((st) =>
                    (st.workingShifts || []).some(
                      (ws) => ws.dayOfWeek === itemDayOfWeek
                    )
                  );

                return (
                  <button
                    key={item.dateStr}
                    onClick={() => onSelectDate(item.dateStr)}
                    className={`flex-shrink-0 min-w-[84px] md:min-w-0 py-2.5 px-3 rounded-2xl flex flex-col items-center justify-center transition-colors duration-100 ${
                      isSelected
                        ? "bg-[#1F1F23] text-white shadow-md ring-2 ring-[#1F1F23]/25 font-bold"
                        : "bg-zinc-200 text-zinc-900 hover:bg-zinc-300 font-semibold"
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase opacity-85 leading-tight">
                      {item.dayShort}
                    </span>
                    <span className="text-sm font-extrabold mt-0.5">
                      {item.dayNumber}
                    </span>
                    {(hasVacationBadge ||
                      hasClosedBadge ||
                      !hasWorkingShiftOnDay) && (
                      <span
                        className={`text-[9px] font-bold mt-0.5 leading-none whitespace-nowrap ${
                          isSelected
                            ? hasVacationBadge
                              ? "text-amber-300"
                              : hasClosedBadge
                              ? "text-rose-300"
                              : "text-zinc-300"
                            : hasVacationBadge
                            ? "text-amber-800"
                            : hasClosedBadge
                            ? "text-rose-700"
                            : "text-zinc-500"
                        }`}
                      >
                        {hasVacationBadge
                          ? "🏖️ Vacac."
                          : hasClosedBadge
                          ? "⛔ Cerrado"
                          : "🌙 No laboral"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-7 mt-5 md:mt-0">
            <div className="flex items-start sm:items-center justify-between gap-3 mb-2.5">
              <div className="min-w-0">
                <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5 flex-wrap">
                  <span>Horarios disponibles</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 whitespace-nowrap">
                    En vivo
                  </span>
                </label>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                  Solo se muestran turnos disponibles. Los horarios ocupados o con imprevistos quedan ocultos.
                </p>
              </div>
              <span className="text-xs text-zinc-600 font-bold bg-zinc-100 border border-zinc-200 px-3 py-1 rounded-full whitespace-nowrap shrink-0">
                {availableSlots.length}{" "}
                {availableSlots.length === 1 ? "libre" : "libres"}
              </span>
            </div>

            {slotsLoading ? (
              <div className="py-10 text-center text-xs text-zinc-500 animate-pulse">
                Buscando horarios libres...
              </div>
            ) : availableSlots.length === 0 ? (
              <div
                className={`py-7 px-4 sm:px-5 rounded-2xl text-center text-xs border ${theme.box}`}
              >
                {theme.emoji && (
                  <div className="w-11 h-11 mx-auto mb-2.5 rounded-full bg-white/90 border border-black/5 flex items-center justify-center text-xl shadow-2xs">
                    {theme.emoji}
                  </div>
                )}
                <p className={`font-bold text-sm ${theme.title}`}>{heading}</p>

                {blocks.length === 0 &&
                  unavailableReason?.code === "NO_WORKING_SHIFT" && (
                    <div className="mt-3 text-left max-w-md mx-auto">
                      <div className="p-3 rounded-xl bg-white/90 border border-zinc-200/80 shadow-2xs flex items-center justify-between gap-2 flex-wrap text-xs font-bold text-zinc-900">
                        <span>🌙 Día no laboral (Horario semanal)</span>
                        <span className="text-[11px] font-semibold text-zinc-600">
                          📅 Descanso habitual (
                          {formatSpanishDateInTz(
                            `${selectedDateStr}T12:00:00Z`,
                            businessTz
                          )}
                          )
                        </span>
                      </div>
                    </div>
                  )}

                {blocks.length > 0 && (
                  <div className="mt-3 space-y-2 text-left max-w-md mx-auto">
                    {blocks.map((block) => {
                      const info = describeTimeOffBlock(block);
                      return (
                        <div
                          key={block.id}
                          className="p-3 rounded-xl bg-white/90 border border-zinc-200/80 shadow-2xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap text-xs font-bold text-zinc-900">
                            <span>
                              {info.badgeEmoji}{" "}
                              {selectedStaffId === "ANY" && block.staffName
                                ? `${block.staffName}: ${info.categoryTitle}`
                                : info.categoryTitle}
                            </span>
                            <span className="text-[11px] font-semibold text-zinc-600">
                              📅 {info.periodLabel}
                            </span>
                          </div>
                          {info.note && (
                            <div className="text-xs text-zinc-700 pt-1 border-t border-zinc-100 break-words leading-snug">
                              <span className="font-bold text-zinc-600">
                                Motivo / nota:{" "}
                              </span>
                              <span>{info.note}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="text-[11px] opacity-85 mt-2.5 max-w-md mx-auto leading-relaxed">
                  {description}
                </p>

                {settings?.phoneWhatsapp && (
                  <div
                    className={`mt-3.5 pt-2.5 border-t flex items-center justify-center ${theme.divider}`}
                  >
                    <a
                      href={`https://wa.me/${settings.phoneWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
                        `Hola, quisiera consultar con el consultorio sobre disponibilidad de turnos o sobrecupo para ${selectedService?.name || "el servicio"} en fecha ${selectedDateStr}.`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5" />
                      <span>Consultar disponibilidad por WhatsApp</span>
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <>
                {selectedStaffId !== "ANY" && timeOffNotices.length > 0 && (
                  <div className="mb-3 p-3 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-950 space-y-1.5">
                    {timeOffNotices.map((notice) => {
                      const info = describeTimeOffBlock(notice);
                      return (
                        <div key={notice.id} className="flex items-start gap-2">
                          <span className="shrink-0 mt-0.5">{info.badgeEmoji}</span>
                          <div className="min-w-0">
                            <span className="font-bold">{info.categoryTitle}:</span>{" "}
                            <span>{info.periodLabel}</span>
                            {info.note && (
                              <div className="text-[11px] text-amber-900 mt-0.5 break-words">
                                <span className="font-semibold">Motivo / nota:</span>{" "}
                                {info.note}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {availableSlots.map((slot) => {
                    const isSelected = selectedTime === slot;
                    return (
                      <button
                        key={slot}
                        onClick={() => onSelectTime(slot)}
                        className={`min-h-[44px] py-3 rounded-xl md:rounded-2xl text-xs font-bold transition-all ${
                          isSelected
                            ? "bg-[#1F1F23] text-white shadow-md scale-[1.03]"
                            : "bg-zinc-200 text-zinc-900 hover:bg-zinc-300"
                        }`}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 pt-4 border-t border-zinc-100 flex justify-end">
        <button
          onClick={onContinue}
          disabled={
            !selectedTime ||
            !availableSlots.includes(selectedTime) ||
            availableSlots.length === 0
          }
          className="w-full md:w-auto md:min-w-[280px] rounded-full bg-[#1F1F23] text-white h-14 font-semibold text-sm shadow-lg flex items-center justify-center gap-2 hover:bg-black transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        >
          <span>Continuar al Resumen</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
