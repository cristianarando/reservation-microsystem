"use client";

import React from "react";
import { ChevronRight } from "lucide-react";
import type { PortalService, PortalStaffMember } from "@/types/portal";

interface BookingStepServiceProps {
  services: PortalService[];
  staffList: PortalStaffMember[];
  currencySymbol?: string;
  onSelectService: (service: PortalService) => void;
}

export function BookingStepService({
  services,
  staffList,
  currencySymbol = "Bs",
  onSelectService,
}: BookingStepServiceProps) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="mb-4 mt-2 md:mb-6">
        <h2 className="text-lg md:text-2xl font-bold text-[#1F1F23]">
          ¿Qué servicio necesitas hoy?
        </h2>
        <p className="text-xs md:text-sm text-zinc-500 mt-0.5">
          Selecciona un servicio para ver profesionales y horarios
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 md:gap-4">
        {services.map((svc) => {
          const doctorsForSvc = staffList.filter(
            (st) =>
              st.isActive !== false &&
              (svc.staff?.some((s) => s.staffId === st.id) ||
                st.services?.some((s) => s.serviceId === svc.id))
          );
          const activeTeamCount = staffList.filter(
            (s) => s.isActive !== false
          ).length;

          return (
            <button
              key={svc.id}
              onClick={() => onSelectService(svc)}
              className="w-full text-left bg-[#27272A] hover:bg-[#1F1F23] text-white rounded-2xl md:rounded-3xl p-3.5 pl-4 sm:pl-5 pr-3.5 md:p-5 flex items-center justify-between gap-3 transition-all shadow-sm hover:shadow-md active:scale-[0.99] group border border-transparent hover:border-zinc-700"
            >
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm md:text-base leading-tight text-white group-hover:text-emerald-300 transition-colors break-words">
                  {svc.name}
                </div>
                <div className="text-xs text-zinc-300 mt-1 flex items-center gap-2 flex-wrap">
                  <span className="whitespace-nowrap">⏱️ {svc.durationMin} min</span>
                  {doctorsForSvc.length === 1 ? (
                    <span className="text-[10px] bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 px-2 py-0.5 rounded-full font-semibold">
                      Especialidad de {doctorsForSvc[0].displayName}
                    </span>
                  ) : doctorsForSvc.length > 1 &&
                    doctorsForSvc.length < activeTeamCount ? (
                    <span className="text-[10px] bg-zinc-800 border border-zinc-600 text-zinc-200 px-2 py-0.5 rounded-full font-semibold">
                      {doctorsForSvc.map((d) => d.displayName).join(" • ")}
                    </span>
                  ) : doctorsForSvc.length > 1 ? (
                    <span className="text-[10px] bg-zinc-800/90 border border-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full font-medium">
                      Todo el equipo ({doctorsForSvc.length})
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                <span className="font-bold text-sm md:text-base text-white whitespace-nowrap">
                  {currencySymbol}
                  {svc.price.toFixed(2)}
                </span>
                <div className="w-10 h-10 rounded-full bg-white text-[#1F1F23] flex items-center justify-center group-hover:bg-emerald-400 group-hover:text-black transition-all shrink-0">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
