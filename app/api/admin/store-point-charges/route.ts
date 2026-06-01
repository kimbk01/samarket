import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/store-point-charges */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: rows, error } = await sb
    .from("store_point_charge_requests")
    .select(
      "id, store_id, owner_user_id, payment_method, payment_amount, point_amount, request_status, depositor_name, bank_name, receipt_image_url, user_memo, admin_memo, inquiry_id, requested_at, updated_at, approved_at, approved_by"
    )
    .order("requested_at", { ascending: false })
    .limit(300);

  if (error) {
    if (/store_point_charge_requests/i.test(error.message) && /does not exist/i.test(error.message)) {
      return NextResponse.json({ ok: true, requests: [] });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const storeIds = [...new Set(list.map((r) => r.store_id as string))];
  const inquiryIds = [
    ...new Set(list.map((r) => r.inquiry_id).filter(Boolean)),
  ] as string[];

  const storeById: Record<string, { name: string; pointBalance: number }> = {};
  if (storeIds.length) {
    const { data: stores } = await sb
      .from("stores")
      .select("id, store_name, point_balance")
      .in("id", storeIds);
    for (const s of stores ?? []) {
      storeById[s.id as string] = {
        name: (s.store_name as string) ?? "",
        pointBalance: Number(s.point_balance) || 0,
      };
    }
  }

  const inquiryById: Record<string, { subject: string; answer: string | null }> = {};
  if (inquiryIds.length) {
    const { data: inquiries } = await sb
      .from("platform_admin_inquiries")
      .select("id, subject, answer")
      .in("id", inquiryIds);
    for (const inq of inquiries ?? []) {
      inquiryById[inq.id as string] = {
        subject: (inq.subject as string) ?? "",
        answer: inq.answer != null ? String(inq.answer) : null,
      };
    }
  }

  return NextResponse.json({
    ok: true,
    requests: list.map((r) => {
      const storeMeta = storeById[r.store_id as string];
      const inq = r.inquiry_id ? inquiryById[r.inquiry_id as string] : undefined;
      return {
        ...r,
        store_name: storeMeta?.name ?? "",
        point_balance: storeMeta?.pointBalance ?? 0,
        inquiry_subject: inq?.subject ?? "",
        inquiry_answer_snippet: inq?.answer ? String(inq.answer).slice(0, 120) : "",
      };
    }),
  });
}
