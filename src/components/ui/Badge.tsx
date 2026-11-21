"use client";

import React from "react";

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "neutral";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  default: "bg-[#1F1F23] text-white border border-transparent",
  success: "bg-emerald-50 text-emerald-800 border border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border border-amber-200",
  danger: "bg-rose-50 text-rose-700 border border-rose-200",
  neutral: "bg-zinc-100 text-zinc-700 border border-zinc-200",
};

/**
 * Standardized pill badge primitive for statuses, counts, and metadata tags.
 */
export function Badge({
  variant = "neutral",
  className = "",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${BADGE_VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
