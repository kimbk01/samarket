import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import {
  APPLE_IAP_RECON_SELECT,
  appleIapReconCsv,
  phtDayRange,
  summarizeAppleIapRecon,
  type AppleIapReconRow,
} from "@/lib/apple-iap/apple-iap-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = 1000;
const MAX_ROWS = 50_000;

/**
 * GET /api/admin/apple-iap/reconciliation?from=YYYY-MM-DD&to=YYYY-MM-DD[&format=csv]
 * 구매 시각(PHT) 기준 기간의 Apple 결제 완료 거래 — 통화·국가별 합계 또는 거래별 CSV. 읽기 전용.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const sp = req.nextUrl.searchParams;
  const range = phtDayRange(sp.get("from"), sp.get("to"));
  if (!range) return NextResponse.json({ ok: false, error: "invalid_range" }, { status: 400 });

  const rows: AppleIapReconRow[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const { data, error } = await guard.sb
      .from("apple_iap_transactions")
      .select(APPLE_IAP_RECON_SELECT)
      .not("transaction_id", "is", null)
      .gte("purchase_date", range.fromIso)
      .lt("purchase_date", range.toIso)
      .order("purchase_date", { ascending: true })
      .order("transaction_id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const page = (data ?? []) as unknown as AppleIapReconRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
    if (offset + PAGE >= MAX_ROWS) {
      return NextResponse.json({ ok: false, error: "range_too_large" }, { status: 400 });
    }
  }

  if (sp.get("format") === "csv") {
    return new NextResponse(appleIapReconCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="dibay-apple-iap-${sp.get("from")}_${sp.get("to")}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return NextResponse.json({ ok: true, from: sp.get("from"), to: sp.get("to"), groups: summarizeAppleIapRecon(rows) });
}
