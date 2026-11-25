"use client";

import React, { useId } from "react";
import { AlertTriangle } from "lucide-react";
import { AccessibleModal } from "@/components/ui/AccessibleModal";
import { Button } from "@/components/ui/Button";

export interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

interface ConfirmModalProps {
  dialog: ConfirmModalState | null;
  onClose: () => void;
}

export function ConfirmModal({ dialog, onClose }: ConfirmModalProps) {
  const titleId = useId();
  const isOpen = Boolean(dialog?.isOpen);

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      maxWidthClass="max-w-sm"
      zIndexClass="z-[9999]"
      className="p-6 text-center"
    >
      <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h3 id={titleId} className="font-bold text-base text-zinc-900 mb-1">
        {dialog?.title}
      </h3>
      <p className="text-xs text-zinc-600 mb-5 leading-relaxed">
        {dialog?.message}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="pill"
          onClick={onClose}
          className="flex-1 min-h-[44px]"
        >
          Cancelar
        </Button>
        <button
          type="button"
          onClick={() => {
            dialog?.onConfirm();
            onClose();
          }}
          className="flex-1 min-h-[44px] py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
        >
          {dialog?.confirmLabel || "Confirmar"}
        </button>
      </div>
    </AccessibleModal>
  );
}
