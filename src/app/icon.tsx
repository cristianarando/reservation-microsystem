import { buildBrandIconResponse } from "@/lib/og-render";

export const revalidate = 300;

export function generateImageMetadata() {
  return [
    { id: "48", size: { width: 48, height: 48 }, contentType: "image/png" },
    { id: "96", size: { width: 96, height: 96 }, contentType: "image/png" },
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
    { id: "maskable-192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "maskable-512", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const raw = await id;
  const isMaskable = raw.startsWith("maskable-");
  const numeric = Number(isMaskable ? raw.replace("maskable-", "") : raw);
  const size = [48, 96, 192, 512].includes(numeric) ? numeric : 96;
  return buildBrandIconResponse(size, { rounded: !isMaskable, maskable: isMaskable });
}
