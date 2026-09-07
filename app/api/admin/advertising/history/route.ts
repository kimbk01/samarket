import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  filterAdsHistoryRows,
  loadAdsHistoryLedger,
} from "@/lib/admin/ads-history/load-ads-history-ledger";
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

/** GET /api/admin/advertising/history — CUT R7 read-only audit ledger */
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

  try {
    const ledger = await loadAdsHistoryLedger(sb);
    const rows = filterAdsHistoryRows(ledger.rows, { domain, status, q });
    return NextResponse.json({
      ok: true,
      ledger: { ...ledger, rows },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "load_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
