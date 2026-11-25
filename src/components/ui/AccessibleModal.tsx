"use client";

import React, { useEffect, useRef } from "react";

interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  labelledBy?: string;
  ariaLabel?: string;
  maxWidthClass?: string;
  zIndexClass?: string;
  className?: string;
  children: React.ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog container implementing:
 * - role="dialog", aria-modal="true", aria-labelledby
 * - Escape key dismissal
 * - Tab / Shift+Tab focus trap
 * - Body scroll lock & trigger focus restoration on close
 */
export function AccessibleModal({
  isOpen,
  onClose,
  labelledBy,
  ariaLabel,
  maxWidthClass = "max-w-md",
  zIndexClass = "z-50",
  className = "",
  children,
}: AccessibleModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const container = dialogRef.current;
    if (container) {
      const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const first = focusables[0];
      if (first) {
        first.focus({ preventScroll: true });
      } else {
        container.focus({ preventScroll: true });
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;

      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !dialogRef.current.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else if (
        document.activeElement === last ||
        !dialogRef.current.contains(document.activeElement)
      ) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={!labelledBy ? ariaLabel : undefined}
        tabIndex={-1}
        className={`bg-white rounded-3xl ${maxWidthClass} w-full shadow-2xl border border-zinc-200 max-h-[92dvh] overflow-y-auto focus:outline-none animate-in zoom-in-95 duration-150 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
