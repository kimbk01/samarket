/**
 * 통합 신고 목록·상세 읽기 (서버 전용) — 거래 Admin 설계 v2 D-42 · D-43.
 * 예전엔 브라우저 RLS 로 읽고 닉네임을 `test_users` 에서 찾았다 → 서비스 롤 + 권한 키 `reports` API 로 옮기고
 * 닉네임은 회원 SSOT(`profiles`, `loadAdminMemberIdentityMap`)에서 읽는다. 조회·변환 규칙은 그대로.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { formatAdminMemberLabel, loadAdminMemberIdentityMap } from "@/lib/admin-community/member-identity";
import type { ReportActionLogItem } from "@/lib/admin-reports/getReportActionsFromDb";

import { ADMIN_DASHBOARD_REPORT_REASON_LABELS as REASON_LABELS } from "@/lib/admin-dashboard/report-reason-labels";
import type { Report, ReportStatus } from "@/lib/types/report";
import { TRADE_REPORT_ADMIN_ACTIONABLE } from "@/lib/admin/admin-ops-actionable-status";

/** Upper bound for the actionable set (Bell `reports` category); history is capped separately. */
const REPORT_ACTIONABLE_LIMIT = 2000;
const REPORT_HISTORY_LIMIT = 300;

export interface ReportRow {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  room_id: string | null;
  product_id: string | null;
  reason_code: string;
  reason_text: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}


function toReportStatus(s: string): ReportStatus {
  if (s === "pending" || s === "reviewing" || s === "resolved" || s === "rejected" || s === "sanctioned" || s === "reviewed") return s as ReportStatus;
  return "pending";
}

function toTargetType(t: string): Report["targetType"] {
  const x = (t ?? "").toLowerCase();
  if (x === "user") return "user";
  if (x === "chat_room" || x === "chat_message") return "chat";
  /** DB의 post·comment는 관리자 UI에서 게시글(product) 버킷으로 묶어 제목 조회 */
  if (x === "product" || x === "post" || x === "comment") return "product";
  return "product";
}

function resolvePostIdForReport(r: ReportRow): string | null {
  const tt = (r.target_type ?? "").toLowerCase();
  if (tt === "post" || tt === "product") return (r.product_id ?? r.target_id)?.trim() || null;
  if (tt === "comment") return r.product_id?.trim() || null;
  return null;
}

/**
 * 어드민 신고 목록 — reports 테이블 기준 (예전 호환 모드: `GET /api/admin/reports` 에 limit/offset 이 없을 때).
 * 통합 신고 화면은 서버 페이지(`admin-reports-unified-page.server.ts`)를 쓴다.
 */
export async function loadAdminReportsList(supabase: SupabaseClient): Promise<Report[]> {
  try {
    const cols =
      "id, reporter_id, target_type, target_id, room_id, product_id, reason_code, reason_text, status, admin_note, created_at, resolved_at, resolved_by";
    // Admin Action Queue rows (pending|reviewing) are loaded in full so the list always covers
    // the Bell count; processed history is the latest REPORT_HISTORY_LIMIT rows.
    const [actionableRes, historyRes] = await Promise.all([
      (supabase as any)
        .from("reports")
        .select(cols)
        .in("status", [...TRADE_REPORT_ADMIN_ACTIONABLE])
        .order("created_at", { ascending: false })
        .limit(REPORT_ACTIONABLE_LIMIT),
      (supabase as any)
        .from("reports")
        .select(cols)
        .not("status", "in", `(${TRADE_REPORT_ADMIN_ACTIONABLE.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(REPORT_HISTORY_LIMIT),
    ]);

    if (actionableRes.error || !Array.isArray(actionableRes.data)) {
      // Never present a failed load as "no reports".
      throw new Error(actionableRes.error?.message ?? "reports_load_failed");
    }
    if (actionableRes.data.length >= REPORT_ACTIONABLE_LIMIT) {
      console.warn("[getReportsForAdminFromDb] actionable reports reached the load cap", REPORT_ACTIONABLE_LIMIT);
    }
    const history = !historyRes.error && Array.isArray(historyRes.data) ? historyRes.data : [];
    const list = [...(actionableRes.data as ReportRow[]), ...(history as ReportRow[])].sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at))
    );
    return await mapTradeReportRowsForAdmin(supabase, list);
  } catch (e) {
    // Surface the failure to the page — an empty list would read as "no pending reports".
    throw e instanceof Error ? e : new Error("reports_load_failed");
  }
}

/**
 * 거래 신고 원본 행 → 화면 행 (신고자·처리자 이름, 대상 글 제목·작성자). 순서 유지.
 * 목록(`loadAdminReportsList`)·통합 서버 페이지(`admin-reports-unified-page.server.ts`) 공용.
 */
export async function mapTradeReportRowsForAdmin(supabase: SupabaseClient, list: ReportRow[]): Promise<Report[]> {
  const reporterIds = [...new Set(list.map((r) => r.reporter_id))];
  const resolvedByIds = [...new Set(list.map((r) => r.resolved_by).filter(Boolean))] as string[];
  const productIds = [...new Set(list.map(resolvePostIdForReport).filter(Boolean))] as string[];
  const userIds = [...new Set([...reporterIds, ...resolvedByIds])];

  const userTargetIds = list.filter((r) => toTargetType(r.target_type) === "user").map((r) => r.target_id);
  const identities = await loadAdminMemberIdentityMap(supabase, [...userIds, ...userTargetIds]);
  const nicknameById: Record<string, string> = {};
  for (const [id, identity] of identities) nicknameById[id] = formatAdminMemberLabel(identity, id);

  const productTitleById: Record<string, string> = {};
  const postAuthorById: Record<string, string> = {};
  if (productIds.length > 0) {
    const { data: posts } = await (supabase as any)
      .from(POSTS_TABLE_READ)
      .select("id, title, user_id")
      .in("id", productIds);
    if (Array.isArray(posts)) {
      posts.forEach((p: { id: string; title: string; user_id?: string }) => {
        productTitleById[p.id] = p.title ?? p.id;
        const author = (p.user_id ?? "").trim();
        if (author) postAuthorById[p.id] = author;
      });
    }
  }

  const reports: Report[] = list.map((r) => {
    const targetType = toTargetType(r.target_type);
    const postId = resolvePostIdForReport(r) ?? "";
    const productId = postId || (r.product_id ?? r.target_id);
    const targetTitle =
      targetType === "product"
        ? (productTitleById[productId] ?? r.target_id)
        : targetType === "chat"
          ? `채팅 ${r.target_id}`
          : (nicknameById[r.target_id] ?? r.target_id);
    const targetUserIdForProduct = postAuthorById[productId] ?? "";
    const ttRaw = (r.target_type ?? "").toLowerCase();
    const targetIdOut =
      ttRaw === "product" || ttRaw === "post" || ttRaw === "comment" ? productId : r.target_id;
    const targetUserIdOut =
      targetType === "product"
        ? targetUserIdForProduct || ""
        : targetType === "user"
          ? r.target_id
          : targetType === "chat"
            ? ""
            : "";
    return {
      id: r.id,
      reporterId: r.reporter_id,
      reporterNickname: nicknameById[r.reporter_id],
      targetType,
      targetId: targetIdOut,
      targetUserId: targetUserIdOut,
      targetTitle,
      productTitle: targetType === "product" ? productTitleById[productId] : undefined,
      reasonCode: r.reason_code,
      reasonLabel: REASON_LABELS[r.reason_code] ?? r.reason_text?.slice(0, 40) ?? r.reason_code,
      detail: r.reason_text ?? "",
      createdAt: r.created_at,
      status: toReportStatus(r.status),
      resolvedBy: r.resolved_by ? nicknameById[r.resolved_by] : undefined,
      resolvedAt: r.resolved_at ?? undefined,
      reportSource: "reports",
    };
  });

  return reports;
}

/**
 * 어드민 신고 1건 조회
 */
export async function loadAdminReportById(supabase: SupabaseClient, reportId: string): Promise<Report | null> {
  try {
    const { data: row, error } = await (supabase as any)
      .from("reports")
      .select("id, reporter_id, target_type, target_id, room_id, product_id, reason_code, reason_text, status, admin_note, created_at, resolved_at, resolved_by")
      .eq("id", reportId)
      .maybeSingle();

    if (error || !row) return null;
    const r = row as ReportRow;

    let reporterNickname = r.reporter_id;
    let resolvedByNickname: string | undefined;
    let targetTitle: string = r.target_id;
    let productTitle: string | undefined;

    const identities = await loadAdminMemberIdentityMap(supabase, [r.reporter_id, r.resolved_by ?? ""]);
    const reporterIdentity = identities.get(r.reporter_id);
    if (reporterIdentity) reporterNickname = formatAdminMemberLabel(reporterIdentity, r.reporter_id);
    if (r.resolved_by) {
      const resolverIdentity = identities.get(r.resolved_by);
      resolvedByNickname = resolverIdentity ? formatAdminMemberLabel(resolverIdentity, r.resolved_by) : r.resolved_by;
    }

    const targetType = toTargetType(r.target_type);
    let targetUserIdOut = r.target_id;
    const ttRaw = (r.target_type ?? "").toLowerCase();
    const postLookupId = resolvePostIdForReport(r);
    if (targetType === "product" && postLookupId) {
      const pid = postLookupId;
      const { data: post } = await (supabase as any)
        .from(POSTS_TABLE_READ)
        .select("title, user_id")
        .eq("id", pid)
        .maybeSingle();
      if (post) {
        targetTitle =
          ttRaw === "comment" ? `${post.title ?? pid} (댓글 신고)` : (post.title ?? pid);
        productTitle = post.title;
        const author = (post.user_id ?? "").trim();
        if (author) targetUserIdOut = author;
      }
    } else if (targetType === "chat") {
      targetTitle = `채팅 ${r.target_id}`;
      // Never treat room/message id as profiles.user_id (P1-2 P0 guard).
      targetUserIdOut = "";
    }

    return {
      id: r.id,
      reporterId: r.reporter_id,
      reporterNickname,
      targetType,
      targetId:
        ttRaw === "product" || ttRaw === "post" || ttRaw === "comment"
          ? (postLookupId ?? r.product_id ?? r.target_id)
          : r.target_id,
      targetUserId: targetUserIdOut,
      targetTitle,
      productTitle,
      reasonCode: r.reason_code,
      reasonLabel: REASON_LABELS[r.reason_code] ?? r.reason_text?.slice(0, 40) ?? r.reason_code,
      detail: r.reason_text ?? "",
      createdAt: r.created_at,
      status: toReportStatus(r.status),
      resolvedBy: resolvedByNickname,
      resolvedAt: r.resolved_at ?? undefined,
      reportSource: "reports",
    };
  } catch {
    return null;
  }
}

export async function loadAdminReportActions(supabase: SupabaseClient, reportId: string): Promise<ReportActionLogItem[]> {
  try {
    const sb = supabase as any;
    const { data: rows, error } = await sb
      .from("report_actions")
      .select("id, action_type, action_note, created_by, created_at")
      .eq("report_id", reportId)
      .order("created_at", { ascending: false });

    if (error || !Array.isArray(rows) || rows.length === 0) return [];

    const adminIds = [...new Set(rows.map((r: { created_by: string }) => r.created_by).filter(Boolean))];
    const identities = await loadAdminMemberIdentityMap(supabase, adminIds as string[]);
    const nicknameById: Record<string, string> = {};
    for (const [id, identity] of identities) nicknameById[id] = formatAdminMemberLabel(identity, id);

    return rows.map((r: { id: string; action_type: string; action_note: string | null; created_by: string; created_at: string }) => ({
      id: r.id,
      actionType: r.action_type,
      actionNote: r.action_note,
      createdAt: r.created_at,
      adminNickname: nicknameById[r.created_by] ?? r.created_by,
    }));
  } catch {
    return [];
  }
}
