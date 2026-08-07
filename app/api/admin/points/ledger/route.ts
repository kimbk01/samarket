import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import type { PointFinancialFilter } from "@/lib/points/point-financial-history";
import {
  loadPointFinancialHistory,
  serializePointFinancialPage,
} from "@/lib/points/project-point-financial-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseFilter(raw: string | null): PointFinancialFilter {
  const v = (raw ?? "all").trim().toLowerCase();
  if (v === "credit" || v === "debit") return v;
  return "all";
}

/** GET /api/admin/points/ledger?userId=&filter=&limit=&cursor=&dateFrom=&dateTo= */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;

  const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
  const filter = parseFilter(req.nextUrl.searchParams.get("filter"));
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const cursor = req.nextUrl.searchParams.get("cursor");
  const dateFrom = req.nextUrl.searchParams.get("dateFrom");
  const dateTo = req.nextUrl.searchParams.get("dateTo");

  const { sb } = gate;
  const historyRes = await loadPointFinancialHistory(sb, {
    userId: userId || undefined,
    filter,
    limit,
    cursor,
    dateFrom,
    dateTo,
  });
  if (!historyRes.ok) {
    if (historyRes.code === "table_missing") {
      return NextResponse.json({
        ok: true,
        history: { items: [], hasMore: false, nextCursor: null },
        entries: [],
      });
    }
    return NextResponse.json({ ok: false, error: historyRes.error }, { status: 500 });
  }

  const history = serializePointFinancialPage(historyRes.page);
  const userIds = [...new Set(history.items.map((i) => i.userId).filter(Boolean))];
  const nickById: Record<string, string> = {};
  if (userIds.length) {
    const { data: profiles } = await sb.from("profiles").select("id, nickname").in("id", userIds);
    for (const p of profiles ?? []) {
      nickById[String(p.id)] = String((p as { nickname?: string }).nickname ?? "");
    }
  }

  return NextResponse.json({
    ok: true,
    history: {
      ...history,
      items: history.items.map((e) => ({
        ...e,
        userNickname: nickById[e.userId] ?? "",
      })),
    },
    entries: history.items.map((e) => ({
      id: e.ledgerId,
      userId: e.userId,
      userNickname: nickById[e.userId] ?? "",
      entryType: e.entryType,
      amount: e.signedAmount,
      balanceAfter: e.balanceAfter,
      relatedType: e.relatedType,
      relatedId: e.relatedId,
      description: e.description,
      createdAt: e.occurredAt,
      actorType: e.actorType,
      financial: e,
    })),
  });
}
