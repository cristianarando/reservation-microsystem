import { getBootstrapPayload } from "@/lib/bootstrap";
import { AdminPortalClient } from "@/components/admin/AdminPortalClient";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; email?: string }>;
}) {
  const params = await searchParams;
  let serializedBootstrap = null;
  try {
    const now = Date.now();
    const payload = await getBootstrapPayload({
      agendaFrom: new Date(now - 30 * 86_400_000),
      agendaTo: new Date(now + 90 * 86_400_000),
      usersLimit: 200,
    });
    serializedBootstrap = JSON.parse(JSON.stringify(payload));
  } catch (err) {
    console.error("SSR admin bootstrap fallback:", err);
  }

  return (
    <AdminPortalClient
      initialData={serializedBootstrap}
      initialInviteToken={typeof params?.invite === "string" ? params.invite : ""}
      initialEmail={typeof params?.email === "string" ? params.email : ""}
    />
  );
}
