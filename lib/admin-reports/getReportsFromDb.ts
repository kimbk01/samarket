"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { Report, ReportStatus } from "@/lib/types/report";

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

const REASON_LABELS: Record<string, string> = {
  spam: "스팸",
  inappropriate: "부적절한 내용",
  scam: "사기",
  fraud: "사기",
  harassment: "괴롭힘",
  fake_listing: "허위 게시",
  other: "기타",
  prohibited_item: "거래 금지 물품",
  professional_seller: "전문판매업자 의심",
  wrong_service: "잘못된 서비스 게시",
  inappropriate_behavior: "부적절한 행위",
};

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
 * 어드민 신고 목록 — reports 테이블 기준
 */
export async function getReportsForAdminFromDb(): Promise<Report[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const { data: rows, error } = await (supabase as any)
      .from("reports")
      .select("id, reporter_id, target_type, target_id, room_id, product_id, reason_code, reason_text, status, admin_note, created_at, resolved_at, resolved_by")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error || !Array.isArray(rows)) return [];
    const list = rows as ReportRow[];

    const reporterIds = [...new Set(list.map((r) => r.reporter_id))];
    const resolvedByIds = [...new Set(list.map((r) => r.resolved_by).filter(Boolean))] as string[];
    const productIds = [...new Set(list.map(resolvePostIdForReport).filter(Boolean))] as string[];
    const userIds = [...new Set([...reporterIds, ...resolvedByIds])];

    const nicknameById: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: users } = await (supabase as any)
        .from("test_users")
        .select("id, display_name, username")
        .in("id", userIds);
      if (Array.isArray(users)) {
        users.forEach((u: { id: string; display_name?: string; username?: string }) => {
          nicknameById[u.id] = (u.display_name ?? u.username ?? u.id).trim() || u.id;
        });
      }
    }

    const productTitleById: Record<string, string> = {};
    const postAuthorById: Record<string, string> = {};
    if (productIds.length > 0) {
      const { data: posts } = await (supabase as any)
        .from("posts")
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
      return {
        id: r.id,
        reporterId: r.reporter_id,
        reporterNickname: nicknameById[r.reporter_id],
        targetType,
        targetId: targetIdOut,
        targetUserId: targetType === "product" ? (targetUserIdForProduct || "") : r.target_id,
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
  } catch {
    return [];
  }
}

/**
 * 어드민 신고 1건 조회
 */
export async function getReportByIdFromDb(reportId: string): Promise<Report | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

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

    const { data: u } = await (supabase as any)
      .from("test_users")
      .select("display_name, username")
      .eq("id", r.reporter_id)
      .maybeSingle();
    if (u) reporterNickname = (u.display_name ?? u.username ?? r.reporter_id).trim() || r.reporter_id;

    if (r.resolved_by) {
      const { data: ru } = await (supabase as any)
        .from("test_users")
        .select("display_name, username")
        .eq("id", r.resolved_by)
        .maybeSingle();
      if (ru) resolvedByNickname = (ru.display_name ?? ru.username ?? r.resolved_by).trim() || r.resolved_by;
    }

    const targetType = toTargetType(r.target_type);
    let targetUserIdOut = r.target_id;
    const ttRaw = (r.target_type ?? "").toLowerCase();
    const postLookupId = resolvePostIdForReport(r);
    if (targetType === "product" && postLookupId) {
      const pid = postLookupId;
      const { data: post } = await (supabase as any)
        .from("posts")
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
