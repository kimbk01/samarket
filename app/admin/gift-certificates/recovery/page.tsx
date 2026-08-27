import { redirect } from "next/navigation";
import { legacyGiftPathToOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v) qs.set(k, v);
    else if (Array.isArray(v) && v[0]) qs.set(k, v[0]);
  }
  redirect(legacyGiftPathToOpsHref("recovery", qs));
}
