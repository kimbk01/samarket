import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { parseTradeAdminListPage } from "@/lib/admin/trade-admin/trade-admin-list-page";
import { callTradeAdminRpc, readJsonBody, tradeAuditMetaArgs } from "@/lib/admin/trade-admin/trade-admin-rpc";
import {
  parseTradeRestrictionDays,
  TRADE_RESTRICTION_SCOPES,
} from "@/lib/admin/trade-admin/trade-report-decision";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import {
  communityAdminUuidOrNull,
} from "@/lib/admin/community-admin/community-admin-period";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";
import { sanitizeAdminListSearch, escapeAdminIlike } from "@/lib/admin/pagination/parse-admin-list-page";
import { notifyTradeSanction } from "@/lib/notifications/notify-trade-moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 거래 경고·제한 + 대상 회원 닉네임 (service_role 전용 조회 뷰) */
const TRADE_SANCTIONS_SEARCH_VIEW = "admin_trade_sanctions_v";

const SELECT =
  "id, user_id, sanction_type, restriction, start_at, end_at, reason, created_by, created_at, revoked_at, revoked_by, revoke_reason, source_report_id";

/**
 * GET /api/admin/trade/restrictions — 거래 경고·활동 제한 (sanctions scope='trade', 설계 v2 §C-5)
 * query: status=active|expired|revoked|all (기본 active) · kind=warning|trade_restriction · userId · q(닉네임) · limit · offset
 */
export async function GET(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const sb = admin.sb;
  const sp = req.nextUrl.searchParams;

  const status = (sp.get("status") ?? "active").trim();
  if (!["active", "expired", "revoked", "all"].includes(status)) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }
  const kind = (sp.get("kind") ?? "").trim();
  if (kind && kind !== "warning" && kind !== "trade_restriction") {
    return NextResponse.json({ ok: false, error: "invalid_kind" }, { status: 400 });
  }
  const { limit, offset } = parseTradeAdminListPage(sp);
  const userId = communityAdminUuidOrNull(sp.get("userId"));
  const q = sanitizeAdminListSearch(sp.get("q"));

  const nowIso = new Date().toISOString();
  /**
   * 닉네임 검색 = 조회 전용 뷰 `admin_trade_sanctions_v`(sanctions scope='trade' + 대상 회원 닉네임 열, 마이그레이션 20270601150100)
   * 의 열 조건 — 예전 「닉네임 일치 회원 200명만 먼저 찾아 in(...)」 제거. 검색어가 없으면 기존대로 `sanctions` 를 읽는다.
   */
  let query = sb
    .from(q ? TRADE_SANCTIONS_SEARCH_VIEW : "sanctions")
    .select(SELECT, { count: "exact" })
    .eq("scope", "trade");
  if (kind) query = query.eq("sanction_type", kind);
  if (userId) query = query.eq("user_id", userId);
  if (q) query = query.ilike("user_nickname", `%${escapeAdminIlike(q)}%`);
  if (status === "active") query = query.is("revoked_at", null).or(`end_at.is.null,end_at.gt.${nowIso}`);
  else if (status === "expired") query = query.is("revoked_at", null).lte("end_at", nowIso);
  else if (status === "revoked") query = query.not("revoked_at", "is", null);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data ?? []) as Record<string, unknown>[];
  const identities = await loadAdminMemberIdentityMap(
    sb,
    rows.flatMap((r) => [String(r.user_id ?? ""), String(r.created_by ?? ""), String(r.revoked_by ?? "")])
  );
  const label = (uid: unknown) => (uid ? formatAdminMemberLabel(identities.get(String(uid))) : null);
  const nowMs = Date.now();
  return NextResponse.json({
    ok: true,
    total: count ?? rows.length,
    limit,
    offset,
    rows: rows.map((r) => ({
      ...r,
      user_label: label(r.user_id),
      created_by_label: label(r.created_by),
      revoked_by_label: label(r.revoked_by),
      status: r.revoked_at
        ? "revoked"
        : r.end_at && new Date(String(r.end_at)).getTime() <= nowMs
          ? "expired"
          : "active",
    })),
  });
}

/**
 * POST /api/admin/trade/restrictions — 경고·거래 활동 제한 직접 적용
 * body: { userId, kind: warning|trade_restriction, restriction?: post|chat|all, days?: n|null, reason }
 */
export async function POST(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const body = await readJsonBody(req);
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  const userId = communityAdminUuidOrNull(body.userId as string | null);
  if (!userId) return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  const kind = String(body.kind ?? "");
  if (kind !== "warning" && kind !== "trade_restriction") {
    return NextResponse.json({ ok: false, error: "invalid_kind" }, { status: 400 });
  }
  const restriction = kind === "trade_restriction" ? String(body.restriction ?? "all") : null;
  if (restriction && !(TRADE_RESTRICTION_SCOPES as readonly string[]).includes(restriction)) {
    return NextResponse.json({ ok: false, error: "invalid_restriction" }, { status: 400 });
  }
  const days = kind === "trade_restriction" ? parseTradeRestrictionDays(body.days) : null;
  if (days === "invalid") return NextResponse.json({ ok: false, error: "invalid_days" }, { status: 400 });
  const reason = normalizeCommunityAdminReason(body.reason);
  if (!reason) return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });

  const res = await callTradeAdminRpc(admin.sb, "admin_apply_trade_sanction", {
    p_user_id: userId,
    p_kind: kind,
    p_restriction: restriction,
    p_days: days,
    p_reason: reason,
    p_actor_id: admin.userId,
    p_source_report_id: null,
    ...tradeAuditMetaArgs(req),
  });
  if (!res.ok) return res.response;
  const duplicate = res.data.duplicate === true;
  let notifyWarning = false;
  if (!duplicate) {
    try {
      await notifyTradeSanction(admin.sb, {
        userId,
        sanctionId: String(res.data.id),
        kind: kind === "warning" ? "warning" : "restriction",
        restriction: restriction as "post" | "chat" | "all" | null,
        endAt: (res.data.end_at as string | null) ?? null,
        reason,
      });
    } catch (e) {
      notifyWarning = true;
      console.error("[trade-restrictions] notify", e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({
    ok: true,
    id: res.data.id,
    duplicate,
    end_at: res.data.end_at ?? null,
    ...(notifyWarning ? { sideEffectWarning: true } : {}),
  });
}
