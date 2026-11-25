"use client";

import React, { useId, useState } from "react";
import { AccessibleModal } from "@/components/ui/AccessibleModal";
import { Button } from "@/components/ui/Button";
import type {
  PortalBusinessSettings,
  PortalStaffMember,
  ServiceModalDraft,
} from "@/types/portal";

interface ServiceFormModalProps {
  serviceModal: ServiceModalDraft | null;
  setServiceModal: React.Dispatch<
    React.SetStateAction<ServiceModalDraft | null>
  >;
  staffList: PortalStaffMember[];
  settings?: PortalBusinessSettings | null;
  onSaveService: (draft: ServiceModalDraft) => Promise<boolean>;
}

export function ServiceFormModal({
  serviceModal,
  setServiceModal,
  staffList,
  settings,
  onSaveService,
}: ServiceFormModalProps) {
  const titleId = useId();
  const nameId = useId();
  const descId = useId();
  const durationId = useId();
  const bufferId = useId();
  const priceId = useId();
  const activeId = useId();
  const [submitting, setSubmitting] = useState(false);

  if (!serviceModal) return null;

  const onClose = () => setServiceModal(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const saved = await onSaveService(serviceModal);
      if (saved) {
        setServiceModal(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AccessibleModal
      isOpen={Boolean(serviceModal)}
      onClose={onClose}
      labelledBy={titleId}
      maxWidthClass="max-w-md"
      className="rounded-[32px] p-5 sm:p-6"
    >
      <h3 id={titleId} className="text-base font-bold text-zinc-900">
        {serviceModal.id ? "Editar Servicio" : "Crear Nuevo Servicio"}
      </h3>
      <p className="text-xs text-zinc-500 mt-1">
        {serviceModal.id
          ? "Modifica el nombre, duración, precio y qué especialistas lo realizan."
          : "Agrega un servicio con su duración, precio y profesionales asignados."}
      </p>

      <div className="mt-4 space-y-3 text-xs">
        <div>
          <label
            htmlFor={nameId}
            className="text-[10px] font-bold text-zinc-500 uppercase block"
          >
            Nombre del Servicio
          </label>
          <input
            id={nameId}
            type="text"
            value={serviceModal.name}
            onChange={(e) =>
              setServiceModal({ ...serviceModal, name: e.target.value })
            }
            placeholder="Ej. Consulta General / Servicio Principal"
            className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 font-semibold text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
          />
        </div>

        <div>
          <label
            htmlFor={descId}
            className="text-[10px] font-bold text-zinc-500 uppercase block"
          >
            Descripción (Opcional)
          </label>
          <input
            id={descId}
            type="text"
            value={serviceModal.description}
            onChange={(e) =>
              setServiceModal({
                ...serviceModal,
                description: e.target.value,
              })
            }
            placeholder="Detalle breve del servicio"
            className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label
              htmlFor={durationId}
              className="text-[10px] font-bold text-zinc-500 uppercase block"
            >
              Duración (min)
            </label>
            <input
              id={durationId}
              type="number"
              value={serviceModal.durationMin}
              onChange={(e) =>
                setServiceModal({
                  ...serviceModal,
                  durationMin: Number(e.target.value),
                })
              }
              className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
            />
          </div>
          <div>
            <label
              htmlFor={bufferId}
              className="text-[10px] font-bold text-zinc-500 uppercase block"
            >
              Buffer post-cita (min)
            </label>
            <input
              id={bufferId}
              type="number"
              min={0}
              max={120}
              step={5}
              value={serviceModal.bufferAfterMin ?? 0}
              onChange={(e) =>
                setServiceModal({
                  ...serviceModal,
                  bufferAfterMin: Math.max(0, Math.min(120, Number(e.target.value) || 0)),
                })
              }
              className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
            />
          </div>
          <div>
            <label
              htmlFor={priceId}
              className="text-[10px] font-bold text-zinc-500 uppercase block"
            >
              Precio ({settings?.currencySymbol || "Bs"})
            </label>
            <input
              id={priceId}
              type="number"
              step="0.5"
              value={serviceModal.price}
              onChange={(e) =>
                setServiceModal({
                  ...serviceModal,
                  price: Number(e.target.value),
                })
              }
              className="mt-1 w-full p-2.5 rounded-2xl border border-zinc-300 font-bold text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
            />
          </div>
        </div>

        {serviceModal.id && (
          <label
            htmlFor={activeId}
            className="flex items-center justify-between p-2.5 rounded-2xl bg-zinc-50 border border-zinc-200 cursor-pointer"
          >
            <div>
              <span className="text-xs font-bold text-zinc-800 block">
                Servicio activo en catálogo público
              </span>
              <span className="text-[10px] text-zinc-500">
                Desmárcalo para archivarlo temporalmente sin borrar historial.
              </span>
            </div>
            <input
              id={activeId}
              type="checkbox"
              checked={serviceModal.isActive ?? true}
              onChange={(e) =>
                setServiceModal({
                  ...serviceModal,
                  isActive: e.target.checked,
                })
              }
              className="w-4 h-4 rounded accent-zinc-900"
            />
          </label>
        )}

        <div className="pt-2 border-t border-zinc-200">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-zinc-700 uppercase block">
              ¿Quiénes realizan este servicio?
            </span>
            <span className="text-[10px] text-zinc-500 font-bold">
              {(serviceModal.staffIds || []).length} de {staffList.length}{" "}
              asignados
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mb-2">
            Solo los profesionales marcados podrán recibir citas de este
            servicio. A los demás se les bloqueará automáticamente.
          </p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 bg-zinc-50 rounded-2xl border border-zinc-200">
            {staffList.map((st) => {
              const isChecked = (serviceModal.staffIds || []).includes(st.id);
              return (
                <label
                  key={st.id}
                  className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all ${
                    isChecked
                      ? "bg-white border border-zinc-300 shadow-2xs"
                      : "hover:bg-zinc-100/70"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        const currentIds = serviceModal.staffIds || [];
                        const next = e.target.checked
                          ? [...currentIds, st.id]
                          : currentIds.filter((id) => id !== st.id);
                        setServiceModal({
                          ...serviceModal,
                          staffIds: next,
                        });
                      }}
                      className="w-4 h-4 rounded text-zinc-900 accent-zinc-900 cursor-pointer"
                    />
                    <span className="font-bold text-zinc-800 text-xs">
                      {st.displayName}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-medium">
                    {st.specialtyTitle || "Especialista"}
                  </span>
                </label>
              );
            })}
          </div>
          {(serviceModal.staffIds || []).length === 0 && (
            <p className="text-[10px] text-amber-700 font-bold mt-1.5">
              ⚠️ Si no seleccionas a ningún profesional, este servicio no se
              mostrará para reservas en el portal.
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <Button
          variant="primary"
          size="pill"
          disabled={submitting}
          onClick={handleSubmit}
          className="flex-1 py-3"
        >
          {submitting
            ? "Guardando..."
            : serviceModal.id
            ? "Guardar Cambios"
            : "Crear Servicio"}
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
