"use client";

import React, { useState } from "react";

interface StaffAvatarProps {
  staff: {
    id?: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
  className?: string;
  textClassName?: string;
}

/**
 * Extracts crisp two-letter initials after stripping common Spanish professional honorifics.
 */
function extractStaffInitials(displayName?: string | null): string {
  const cleaned = (displayName || "")
    .replace(/^(Dr\.|Dra\.|Lic\.|Ing\.)\s+/i, "")
    .trim();
  if (!cleaned) return "PR";
  const words = cleaned.split(/\s+/).slice(0, 2);
  const initials = words.map((w) => w[0]?.toUpperCase() || "").join("");
  return initials || cleaned.slice(0, 2).toUpperCase();
}

/**
 * Reusable staff portrait with automatic broken-image fallback to initials.
 */
export function StaffAvatar({
  staff,
  className = "w-full h-full object-cover rounded-full",
  textClassName = "text-xs text-zinc-700",
}: StaffAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imgFailed = Boolean(staff?.avatarUrl && failedUrl === staff.avatarUrl);

  if (staff?.avatarUrl && !imgFailed) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- Dynamic staff avatar URL or base64 upload */
      <img
        src={staff.avatarUrl}
        alt={staff.displayName || "Profesional"}
        className={className}
        onError={() => setFailedUrl(staff.avatarUrl || null)}
      />
    );
  }

  return (
    <div
      className={`w-full h-full flex items-center justify-center font-bold ${textClassName}`}
    >
      {extractStaffInitials(staff?.displayName)}
    </div>
  );
}
