// src/app/api/bootstrap/route.ts
import { NextResponse } from "next/server";
import { EMPTY_BOOTSTRAP_PAYLOAD, getBootstrapPayload } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const usersLimitParam = searchParams.get("usersLimit");

    const agendaFrom =
      fromParam && !isNaN(new Date(fromParam).getTime())
        ? new Date(fromParam)
        : null;
    const agendaTo =
      toParam && !isNaN(new Date(toParam).getTime()) ? new Date(toParam) : null;
    const usersLimit =
      usersLimitParam && Number(usersLimitParam) > 0
        ? Math.min(Number(usersLimitParam), 500)
        : undefined;

    const payload = await getBootstrapPayload({
      agendaFrom,
      agendaTo,
      usersLimit,
    });
    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Bootstrap error:", error);
    return NextResponse.json(
      {
        error: "Error al cargar datos",
        ...EMPTY_BOOTSTRAP_PAYLOAD,
      },
      { status: 500 }
    );
  }
}
