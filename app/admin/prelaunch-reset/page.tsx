import { redirect } from "next/navigation";
import { DATA_RESET_CANONICAL_ROUTE } from "@/lib/admin/data-reset/types";

/**
 * Compatibility shell — Prelaunch Reset UI superseded by Data Reset SSOT.
 */
export default async function AdminPrelaunchResetRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const scopesRaw = sp.scopes;
  const scopes = typeof scopesRaw === "string" ? scopesRaw : Array.isArray(scopesRaw) ? scopesRaw.join(",") : "";
  const domainHint = scopes.includes("community")
    ? "community"
    : scopes.includes("trade")
      ? "market"
      : scopes.includes("chat")
        ? "chat"
        : scopes.includes("delivery")
          ? "delivery"
          : null;
  const q = domainHint ? `?domain=${domainHint}` : "";
  redirect(`${DATA_RESET_CANONICAL_ROUTE}${q}`);
}
