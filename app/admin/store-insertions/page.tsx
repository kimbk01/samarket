import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminStoreInsertionControlPage } from "@/components/admin/stores/AdminStoreInsertionControlPage";

export default async function AdminStoreInsertionsRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string | string[] }>;
}) {
  const raw = (await searchParams).focus;
  const focus = String(Array.isArray(raw) ? raw[0] : raw ?? "").toLowerCase();
  if (focus === "coupons") {
    redirect("/admin/store-coupon-control");
  }
  return (
    <Suspense fallback={null}>
      <AdminStoreInsertionControlPage />
    </Suspense>
  );
}
