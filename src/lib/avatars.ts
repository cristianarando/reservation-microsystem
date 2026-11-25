// src/lib/avatars.ts

export const DEFAULT_BUSINESS_LOGO = "/avatars/default-business.svg";

export const STAFF_AVATAR_PRESETS = [
  { id: "specialist-slate", label: "Perfil Azul", url: "/avatars/avatar-1.svg" },
  { id: "specialist-amber", label: "Perfil Ámbar", url: "/avatars/avatar-2.svg" },
  { id: "specialist-emerald", label: "Perfil Esmeralda", url: "/avatars/avatar-3.svg" },
  { id: "specialist-rose", label: "Perfil Coral", url: "/avatars/avatar-4.svg" },
  { id: "specialist-violet", label: "Perfil Índigo", url: "/avatars/avatar-5.svg" },
  { id: "specialist-cyan", label: "Perfil Celeste", url: "/avatars/avatar-6.svg" },
] as const;

export const DEFAULT_STAFF_AVATAR = STAFF_AVATAR_PRESETS[0].url;

export function getRandomStaffAvatar(excludeUrl?: string): string {
  const pool = excludeUrl
    ? STAFF_AVATAR_PRESETS.filter((a) => a.url !== excludeUrl)
    : STAFF_AVATAR_PRESETS;
  const pick =
    pool[Math.floor(Math.random() * pool.length)] || STAFF_AVATAR_PRESETS[0];
  return pick.url;
}
