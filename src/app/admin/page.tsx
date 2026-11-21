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
    const payload = await getBootstrapPayload();
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
