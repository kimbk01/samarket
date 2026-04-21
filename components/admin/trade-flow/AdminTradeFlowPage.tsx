"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentUser, isAdminUser } from "@/lib/auth/get-current-user";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import Link from "next/link";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";

interface SessionRow {
  id: string;
  post_id: string;
  postTitle?: string;
  postStatus?: string;
  sellerListingState?: string | null;
  seller_id: string;
  buyer_id: string;
  trade_flow_status: string;
  chat_mode: string;
  seller_completed_at: string | null;
  buyer_confirmed_at: string | null;
  last_message_preview?: string;
  hasBuyerReview?: boolean;
}

interface RepRow {
  id: string;
  user_id: string;
  source_type: string;
  delta: number;
  status: string;
  reason: string | null;
  created_at: string;
}

interface ReviewRow {
  id: string;
  product_id: string;
  product_title?: string;
  room_id: string | null;
  reviewer_id: string;
  reviewee_id: string;
  reviewer_nickname?: string;
  reviewee_nickname?: string;
  role_type: string;
  public_review_type: string;
  positive_tag_keys: string[] | null;
  negative_tag_keys: string[] | null;
  positive_tag_labels?: string;
  negative_tag_labels?: string;
  review_comment: string | null;
  is_anonymous_negative?: boolean | null;
  created_at: string;
}

const REVIEW_ROLE_LABELS: Record<string, string> = {
  buyer_to_seller: "구매→판매",
  seller_to_buyer: "판매→구매",
};

const PUBLIC_REVIEW_LABELS: Record<string, string> = {
  good: "좋아요",
  normal: "보통",
  bad: "별로",
};

export function AdminTradeFlowPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [logs, setLogs] = useState<RepRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const user = getCurrentUser();
    const uid = user?.id?.trim() ?? "";
    if (!uid || !isAdminUser(user)) {
      setError("관리자(테스트) 로그인이 필요합니다.");
      setSessions([]);
      setLogs([]);
      setReviews([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/trade-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "조회 실패");
        setSessions([]);
        setLogs([]);
        setReviews([]);
        return;
      }
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setLogs(Array.isArray(data.reputationLogs) ? data.reputationLogs : []);
      setReviews(Array.isArray(data.transactionReviews) ? data.transactionReviews : []);
    } catch {
      setError("네트워크 오류");
      setSessions([]);
      setLogs([]);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revertTrade = useCallback(
    async (roomId: string) => {
      const user = getCurrentUser();
      const uid = user?.id?.trim() ?? "";
      if (!uid || !isAdminUser(user)) return;
      if (
        !window.confirm(
          "이 채팅방의 거래·후기를 되돌립니다.\n· product_chats → 판매중(chatting)\n· 동일 글 다른 채팅도 다시 열림\n· 해당 방 후기 삭제 + 매너 로그 되돌림\n· 글이 이 구매자에게만 판매완료였다면 글 상태를 판매중(active)으로 복구\n\n계속할까요?"
        )
      ) {
        return;
      }
      setRevertingId(roomId);
      setError(null);
      try {
        const res = await fetch("/api/admin/trade-flow/revert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setError((data as { error?: string }).error ?? "되돌리기 실패");
          return;
        }
        await load();
      } catch {
        setError("네트워크 오류");
      } finally {
        setRevertingId(null);
      }
    },
    [load]
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader title="거래 흐름 · 온도 로그" />
      {error && (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 sam-text-body text-amber-900">
          {error}
        </div>
      )}
      {loading ? (
        <p className="sam-text-body text-sam-muted">불러오는 중…</p>
      ) : (
        <>
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
            <h2 className="border-b border-sam-border-soft px-4 py-3 sam-text-body font-semibold text-sam-fg">
              product_chats 거래 상태 (최대 200건)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse sam-text-body-secondary">
                <thead>
                  <tr className="border-b border-sam-border-soft bg-sam-app text-left text-sam-muted">
                    <th className="px-3 py-2 font-medium">채팅방</th>
                    <th className="px-3 py-2 font-medium">글</th>
                    <th className="px-3 py-2 font-medium">글상태</th>
                    <th className="px-3 py-2 font-medium">판매표시</th>
                    <th className="px-3 py-2 font-medium">거래흐름</th>
                    <th className="px-3 py-2 font-medium">구매자후기</th>
                    <th className="px-3 py-2 font-medium">채팅모드</th>
                    <th className="px-3 py-2 font-medium">판매자완료</th>
                    <th className="px-3 py-2 font-medium">거래완료 확인</th>
                    <th className="px-3 py-2 font-medium">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-b border-sam-border-soft hover:bg-sam-app/80">
                      <td className="px-3 py-2 font-mono sam-text-helper">
                        <Link href={tradeChatNotificationHref(s.id, "product_chat")} className="text-signature hover:underline" target="_blank">
                          {s.id.slice(0, 8)}…
                        </Link>
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-sam-fg" title={s.postTitle}>
                        {s.postTitle ?? s.post_id}
                      </td>
                      <td className="px-3 py-2 text-sam-fg">{s.postStatus ?? "—"}</td>
                      <td className="max-w-[100px] truncate px-3 py-2 text-sam-fg" title={s.sellerListingState ?? ""}>
                        {s.sellerListingState ?? "—"}
                      </td>
                      <td className="px-3 py-2">{s.trade_flow_status}</td>
                      <td className="px-3 py-2">{s.hasBuyerReview ? "Y" : "N"}</td>
                      <td className="px-3 py-2">{s.chat_mode}</td>
                      <td className="px-3 py-2 text-sam-muted">
                        {s.seller_completed_at
                          ? new Date(s.seller_completed_at).toLocaleString("ko-KR")
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-sam-muted">
                        {s.buyer_confirmed_at
                          ? new Date(s.buyer_confirmed_at).toLocaleString("ko-KR")
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {s.trade_flow_status !== "chatting" ? (
                          <button
                            type="button"
                            disabled={revertingId === s.id}
                            onClick={() => void revertTrade(s.id)}
                            className="rounded border border-amber-300 bg-amber-50 px-2 py-1 sam-text-xxs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                          >
                            {revertingId === s.id ? "처리 중…" : "거래 되돌리기"}
                          </button>
                        ) : (
                          <span className="text-sam-meta">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sessions.length === 0 && (
                <p className="px-4 py-8 text-center sam-text-body text-sam-muted">데이터가 없습니다.</p>
              )}
            </div>
          </section>

          <section className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
            <h2 className="flex flex-wrap items-baseline gap-x-2 border-b border-sam-border-soft px-4 py-3 sam-text-body font-semibold text-sam-fg">
              거래 후기 (최근 60건)
              <Link href="/admin/reviews" className="sam-text-body-secondary font-normal text-signature hover:underline">
                전체 목록 (최대 500건) →
              </Link>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse sam-text-body-secondary">
                <thead>
                  <tr className="border-b border-sam-border-soft bg-sam-app text-left text-sam-muted">
                    <th className="px-3 py-2 font-medium">시각</th>
                    <th className="px-3 py-2 font-medium">역할</th>
                    <th className="px-3 py-2 font-medium">공개</th>
                    <th className="px-3 py-2 font-medium">작성 → 대상</th>
                    <th className="px-3 py-2 font-medium">긍정 태그</th>
                    <th className="px-3 py-2 font-medium">부정 태그</th>
                    <th className="px-3 py-2 font-medium">코멘트</th>
                    <th className="px-3 py-2 font-medium">상품 · 채팅 · 상세</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((rv) => (
                    <tr key={rv.id} className="border-b border-sam-border-soft">
                      <td className="whitespace-nowrap px-3 py-2 text-sam-muted">
                        {rv.created_at ? new Date(rv.created_at).toLocaleString("ko-KR") : "—"}
                      </td>
                      <td className="px-3 py-2">{REVIEW_ROLE_LABELS[rv.role_type] ?? rv.role_type}</td>
                      <td className="px-3 py-2">
                        {PUBLIC_REVIEW_LABELS[rv.public_review_type] ?? rv.public_review_type}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-sam-fg" title={`${rv.reviewer_nickname ?? ""} → ${rv.reviewee_nickname ?? ""}`}>
                        {rv.reviewer_nickname ?? rv.reviewer_id.slice(0, 8) + "…"} →{" "}
                        {rv.reviewee_nickname ?? rv.reviewee_id.slice(0, 8) + "…"}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-sam-fg" title={rv.positive_tag_labels ?? ""}>
                        {rv.positive_tag_labels ?? ((rv.positive_tag_keys ?? []).join(", ") || "—")}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-sam-fg" title={rv.negative_tag_labels ?? ""}>
                        {rv.negative_tag_labels ?? ((rv.negative_tag_keys ?? []).join(", ") || "—")}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-sam-muted" title={rv.review_comment ?? ""}>
                        {rv.review_comment ?? "—"}
                      </td>
                      <td className="px-3 py-2 sam-text-helper text-sam-fg">
                        <span className="block max-w-[140px] truncate font-medium text-sam-fg" title={rv.product_title ?? rv.product_id}>
                          {rv.product_title ?? rv.product_id.slice(0, 8) + "…"}
                        </span>
                        <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                          {rv.room_id ? (
                            <Link href={tradeChatNotificationHref(rv.room_id, "product_chat")} className="text-signature hover:underline" target="_blank">
                              채팅
                            </Link>
                          ) : (
                            <span className="text-sam-meta">채팅 —</span>
                          )}
                          <Link href={`/admin/reviews/${rv.id}`} className="text-signature hover:underline">
                            어드민 상세
                          </Link>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reviews.length === 0 && (
                <p className="px-4 py-8 text-center sam-text-body text-sam-muted">후기가 없습니다.</p>
              )}
            </div>
          </section>

          <section className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
            <h2 className="border-b border-sam-border-soft px-4 py-3 sam-text-body font-semibold text-sam-fg">
              reputation_logs (최근 80건)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse sam-text-body-secondary">
                <thead>
                  <tr className="border-b border-sam-border-soft bg-sam-app text-left text-sam-muted">
                    <th className="px-3 py-2 font-medium">시각</th>
                    <th className="px-3 py-2 font-medium">사용자</th>
                    <th className="px-3 py-2 font-medium">유형</th>
                    <th className="px-3 py-2 font-medium">Δ</th>
                    <th className="px-3 py-2 font-medium">상태</th>
                    <th className="px-3 py-2 font-medium">사유</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b border-sam-border-soft">
                      <td className="whitespace-nowrap px-3 py-2 text-sam-muted">
                        {new Date(l.created_at).toLocaleString("ko-KR")}
                      </td>
                      <td className="px-3 py-2 font-mono sam-text-xxs">{l.user_id.slice(0, 8)}…</td>
                      <td className="px-3 py-2">{l.source_type}</td>
                      <td className="px-3 py-2">{l.delta}</td>
                      <td className="px-3 py-2">{l.status}</td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-sam-muted" title={l.reason ?? ""}>
                        {l.reason ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logs.length === 0 && (
                <p className="px-4 py-8 text-center sam-text-body text-sam-muted">로그가 없습니다.</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
