"use client";

import React from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "emerald";

export type ButtonSize = "sm" | "md" | "lg" | "pill";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--brand-primary,#1F1F23)] text-[var(--brand-primary-fg,#FFFFFF)] hover:opacity-90 border border-transparent shadow-sm",
  secondary:
    "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 border border-zinc-200/80",
  outline:
    "bg-white text-zinc-800 hover:bg-zinc-50 border border-zinc-300 shadow-2xs",
  ghost:
    "bg-transparent text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 border border-transparent",
  danger:
    "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200",
  emerald:
    "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs rounded-xl min-h-[40px] sm:min-h-[34px]",
  md: "px-4 py-2 text-xs rounded-xl min-h-[44px] sm:min-h-[38px]",
  lg: "px-5 py-3 text-sm rounded-2xl min-h-[48px]",
  pill: "px-3.5 py-1.5 text-xs rounded-full min-h-[44px] sm:min-h-[36px]",
};

/**
 * Standardized interactive button primitive with consistent WCAG focus-visible ring,
 * mobile-friendly touch targets, and dynamic brand theme support.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", className = "", type = "button", ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={`inline-flex items-center justify-center gap-1.5 font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
        {...props}
      />
    );
  }
);
