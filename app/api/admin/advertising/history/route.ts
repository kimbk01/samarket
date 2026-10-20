import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { loadAdsHistoryLedgerPage } from "@/lib/admin/ads-history/load-ads-history-ledger";
import { parseAdminListPage } from "@/lib/admin/pagination/parse-admin-list-page";
import type {
  AdsHistoryDomainFilter,
  AdsHistoryStatusFilter,
} from "@/lib/admin/ads-history/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asDomain(v: string | null): AdsHistoryDomainFilter {
  if (v === "community" || v === "trade" || v === "delivery" || v === "popup") return v;
  return "all";
}

function asStatus(v: string | null): AdsHistoryStatusFilter {
  if (
    v === "approved" ||
    v === "rejected" ||
    v === "ended" ||
    v === "refunded" ||
    v === "paused"
  ) {
    return v;
  }
  return "all";
}

/**
 * GET /api/admin/advertising/history — CUT R7 read-only audit ledger.
 * R7 서버 페이지: `limit`(기본 20·최대 100)·`offset` + `total`(DB count). 영역·상태·검색은 DB 에서 적용.
 * 응답 `{ ok, ledger: { rows, total, limit, offset, … } }` — 기존 ledger 모양에 total/limit/offset 추가.
 */
export async function GET(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const url = new URL(req.url);
  const domain = asDomain(url.searchParams.get("domain"));
  const status = asStatus(url.searchParams.get("status"));
  const q = url.searchParams.get("q") ?? "";

  const page = parseAdminListPage(url.searchParams, { defaultLimit: 20, maxLimit: 100 });

  try {
    const ledger = await loadAdsHistoryLedgerPage(sb, {
      domain,
      status,
      q,
      limit: page.limit,
      offset: page.offset,
    });
    return NextResponse.json({ ok: true, ledger });
  } catch (e) {
    const message = e instanceof Error ? e.message : "load_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
