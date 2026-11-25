// src/app/api/availability/route.ts
import { NextResponse } from "next/server";
import { safeErrorResponse } from "@/lib/api-guard";
import {
  ScheduleServiceError,
  computeServiceAvailability,
} from "@/lib/services/schedule-service";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const serviceId = searchParams.get("serviceId");
    const staffId = searchParams.get("staffId") || "ANY";
    const dateStr = searchParams.get("date"); // "YYYY-MM-DD"

    if (!serviceId || !dateStr) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos: serviceId y date" },
        { status: 400 }
      );
    }

    const result = await computeServiceAvailability({
      serviceId,
      staffId,
      dateStr,
    });

    return NextResponse.json(result, { headers: NO_CACHE_HEADERS });
  } catch (error: unknown) {
    if (error instanceof ScheduleServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    return safeErrorResponse(error, "No se pudo consultar la disponibilidad.");
  }
}
