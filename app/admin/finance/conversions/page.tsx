import { redirect } from "next/navigation";

/** Conversions = filtered transaction list (CONVERT*). Preserve filters. */
export default async function AdminFinanceConversionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v.trim()) qs.set(k, v);
  }
  if (!qs.has("type")) qs.set("type", "CONVERT_TO_BUSINESS_CASH");
  redirect(`/admin/finance/transactions?${qs.toString()}`);
}
