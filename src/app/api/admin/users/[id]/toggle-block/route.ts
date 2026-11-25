// src/app/api/admin/users/[id]/toggle-block/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  parseJsonObject,
  requireAdmin,
  safeErrorResponse,
  sanitizeUserForClient,
  verifySameOrigin,
} from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { id } = await params;
    const parsedBody = await parseJsonObject(req);
    if (parsedBody.error) return parsedBody.error;
    const body = parsedBody.data;

    const updated = await prisma.$transaction(async (tx) => {
      const freshTarget = await tx.user.findUnique({ where: { id } });
      if (!freshTarget) {
        throw new Error("USER_NOT_FOUND");
      }

      if (freshTarget.role !== "CUSTOMER") {
        throw new Error("CANNOT_BLOCK_STAFF_OR_ADMIN");
      }

      let newBlockedState =
        body.isBlocked !== undefined
          ? Boolean(body.isBlocked)
          : !freshTarget.isBlocked;

      const shouldArchiveAndResetStrikes =
        Boolean(body.resetNoShows) || (freshTarget.isBlocked && !newBlockedState);

      let nextNoShowCount: number | undefined = undefined;
      if (shouldArchiveAndResetStrikes) {
        nextNoShowCount = 0;
        newBlockedState = false;
        // Archive no-shows from the previous cycle within the same transaction
        await tx.appointment.updateMany({
          where: {
            customerId: id,
            status: "NO_SHOW",
          },
          data: {
            status: "NO_SHOW_ARCHIVED",
          },
        });
      } else if (body.incrementNoShow) {
        nextNoShowCount = freshTarget.noShowCount + 1;
        if (nextNoShowCount >= 2) {
          newBlockedState = true;
        }
      }

      return tx.user.update({
        where: { id },
        data: {
          isBlocked: newBlockedState,
          adminNotes:
            body.adminNotes !== undefined
              ? typeof body.adminNotes === "string"
                ? body.adminNotes.trim().slice(0, 500)
                : null
              : undefined,
          noShowCount: nextNoShowCount,
          completedCount:
            body.incrementCompleted
              ? freshTarget.completedCount + 1
              : undefined,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      user: sanitizeUserForClient(updated, { includeAdminNotes: true }),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "CANNOT_BLOCK_STAFF_OR_ADMIN") {
      return NextResponse.json(
        { error: "Solo se pueden bloquear o gestionar faltas de cuentas de clientes." },
        { status: 400 }
      );
    }
    return safeErrorResponse(error, "No se pudo actualizar el estado del cliente.");
  }
}
