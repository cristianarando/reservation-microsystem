import { redirect } from "next/navigation";
import { HomeClient } from "@/components/HomeClient";
import { getBootstrapPayload } from "@/lib/bootstrap";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser().catch(() => null);
  if (user?.role === "PROVIDER") {
    redirect("/admin");
  }

  let serializedBootstrap = null;
  try {
    const payload = await getBootstrapPayload();
    serializedBootstrap = JSON.parse(JSON.stringify(payload));
  } catch (err) {
    console.error("SSR bootstrap fallback:", err);
  }

  return <HomeClient initialData={serializedBootstrap} />;
}
