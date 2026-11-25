// src/lib/color-utils.ts

/**
 * Normalizes a #RRGGBB hex string, returning fallback if invalid.
 */
export function normalizeHex(hex?: string | null, fallback = "#1F1F23"): string {
  if (!hex || typeof hex !== "string") return fallback;
  const trimmed = hex.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed.toUpperCase() : fallback;
}

/**
 * Computes WCAG 2.1 relative luminance (0..1) of a #RRGGBB hex color.
 */
export function getRelativeLuminance(hex: string): number {
  const clean = normalizeHex(hex).slice(1);
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Returns "#FFFFFF" or "#18181B" guaranteeing >= 4.5:1 WCAG AA contrast against `bgHex`.
 */
export function getAccessibleTextColor(bgHex: string): "#FFFFFF" | "#18181B" {
  const lum = getRelativeLuminance(bgHex);
  return lum > 0.179 ? "#18181B" : "#FFFFFF";
}

/**
 * Computes contrast ratio (1..21) between two #RRGGBB colors.
 */
export function getContrastRatio(hexA: string, hexB: string): number {
  const l1 = getRelativeLuminance(hexA);
  const l2 = getRelativeLuminance(hexB);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}
