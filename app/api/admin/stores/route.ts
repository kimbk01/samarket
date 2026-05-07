import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 관리자: 매장 목록 + 판매권한 요약 */
export async function GET(req: Request) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status")?.trim();
  const qRaw = searchParams.get("q")?.trim() ?? "";
  const qText = qRaw.replace(/^@+/, "").trim();

  let q = sb
    .from("stores")
    .select(
      [
        /* applicant_nickname 컬럼은 마이그레이션 전 DB에 없을 수 있어 select 제외 → profiles.nickname 으로 보강 */
        "id, store_name, slug, owner_user_id, approval_status, is_visible, business_type",
        "store_category_id, store_topic_id, owner_can_edit_store_identity",
        "description, kakao_id, phone, email, website_url, region, city, district",
        "address_line1, address_line2, lat, lng, profile_image_url",
        "created_at, approved_at, rejected_reason, revision_note, suspended_reason",
        "store_categories ( name ), store_topics ( name )",
      ].join(", ")
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (status && status !== "all") {
    q = q.eq("approval_status", status);
  }

  const { data: stores, error } = await q;
  if (error) {
    console.error("[admin/stores GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  type AdminStoreListRow = { id: string } & Record<string, unknown>;
  const list: AdminStoreListRow[] = Array.isArray(stores)
    ? (stores as unknown as AdminStoreListRow[])
    : [];

  const ids = list.map((s) => s.id);
  const ownerIds = [...new Set(list.map((s) => String(s.owner_user_id ?? "").trim()).filter(Boolean))];

  const [profsRes, nickRowsRes, permsRes] = await Promise.all([
    ownerIds.length > 0
      ? sb.from("profiles").select("id, display_name, nickname, username").in("id", ownerIds)
      : Promise.resolve({
          data: null as
            | { id: string; display_name: string | null; nickname: string | null; username: string | null }[]
            | null,
          error: null,
        }),
    ids.length > 0
      ? sb.from("stores").select("id, applicant_nickname").in("id", ids)
      : Promise.resolve({ data: null as { id?: string; applicant_nickname?: string | null }[] | null, error: null }),
    ids.length > 0
      ? sb
          .from("store_sales_permissions")
          .select("store_id, allowed_to_sell, sales_status, approved_at, rejection_reason, suspension_reason")
          .in("store_id", ids)
      : Promise.resolve({ data: null as Record<string, unknown>[] | null }),
  ]);

  const nickByOwner = new Map<string, string>();
  const usernameByOwner = new Map<string, string>();
  if (!profsRes.error && profsRes.data) {
    for (const p of profsRes.data) {
      const id = typeof p.id === "string" ? p.id : "";
      const display = typeof (p as any).display_name === "string" ? String((p as any).display_name).trim() : "";
      const legacy = typeof (p as any).nickname === "string" ? String((p as any).nickname).trim() : "";
      const username = typeof (p as any).username === "string" ? String((p as any).username).trim() : "";
      const label = labelFromDisplayAndUsername(display || legacy, username).trim();
      if (id && label) nickByOwner.set(id, label);
      if (id && username) usernameByOwner.set(id, username.replace(/^@+/, ""));
    }
  }

  const nickFromStoreCol = new Map<string, string>();
  if (!nickRowsRes.error && nickRowsRes.data) {
    for (const r of nickRowsRes.data) {
      const sid = String((r as { id?: string }).id ?? "");
      const an = String((r as { applicant_nickname?: string | null }).applicant_nickname ?? "").trim();
      if (sid && an) nickFromStoreCol.set(sid, an);
    }
  }

  const listWithApplicant = list.map((s) => {
    const oid = String(s.owner_user_id ?? "").trim();
    const fromProfile = oid ? nickByOwner.get(oid) : undefined;
    const ownerUsername = oid ? usernameByOwner.get(oid) : undefined;
    const fromCol = nickFromStoreCol.get(s.id);
    const ownerHandle = ownerUsername ? `@${ownerUsername}` : null;
    return {
      ...s,
      store_name: String((s as any).store_name ?? "").trim(),
      applicant_nickname: fromCol ?? fromProfile ?? null,
      owner_username: ownerUsername ?? null,
      owner_handle: ownerHandle,
    };
  });

  const filteredListWithApplicant = qText
    ? listWithApplicant.filter((s) => {
        const qLower = qText.toLowerCase();
        const handle = String((s as any).owner_handle ?? "").trim().toLowerCase().replace(/^@+/, "");
        const storeName = String((s as any).store_name ?? "").trim().toLowerCase();
        const slug = String((s as any).slug ?? "").trim().toLowerCase();
        const phone = String((s as any).phone ?? "").trim().toLowerCase();
        const kakao = String((s as any).kakao_id ?? "").trim().toLowerCase();
        return (
          storeName.includes(qLower) ||
          slug.includes(qLower) ||
          phone.includes(qLower) ||
          kakao.includes(qLower) ||
          handle.includes(qLower)
        );
      })
    : listWithApplicant;

  const statusCounts: Record<string, number> = {
    all: filteredListWithApplicant.length,
    pending: 0,
    under_review: 0,
    revision_requested: 0,
    approved: 0,
    rejected: 0,
    suspended: 0,
  };
  for (const r of filteredListWithApplicant) {
    const st = String((r as { approval_status?: unknown }).approval_status ?? "").trim();
    if (st && Object.prototype.hasOwnProperty.call(statusCounts, st)) {
      statusCounts[st] = (statusCounts[st] ?? 0) + 1;
    }
  }

  const permByStore: Record<string, Record<string, unknown>> = {};
  for (const p of permsRes.data ?? []) {
    const sid = p.store_id as string;
    permByStore[sid] = p as Record<string, unknown>;
  }

  return NextResponse.json({
    ok: true,
    stores: filteredListWithApplicant.map((s) => ({
      ...s,
      sales_permission: permByStore[s.id] ?? null,
    })),
    counts: statusCounts,
  });
}
