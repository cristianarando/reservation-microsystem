// src/app/api/push/vapid-public-key/route.ts
import { NextResponse } from "next/server";
import { getVapidKeys, isPushDispatcherPaused } from "@/lib/web-push";

export const dynamic = "force-dynamic";

export async function GET() {
  const keys = getVapidKeys();
  return NextResponse.json({
    ok: true,
    publicKey: keys.publicKey,
    enabled: !isPushDispatcherPaused(),
  });
}
