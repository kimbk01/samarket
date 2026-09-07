import { redirect } from "next/navigation";

/** Daily list lives on store detail; keep canonical store filter path. */
export default async function AdminFinanceStoreDailyPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeId } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const s = qs.toString();
  redirect(`/admin/finance/stores/${encodeURIComponent(storeId)}${s ? `?${s}` : ""}`);
}
