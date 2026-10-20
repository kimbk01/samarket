"use client";

/**
 * 거래 운영 기록 (설계 v2 §F-4) — 탭: 운영 기록(관리자 조치) | 찜 기록.
 * URL: tab=favorites · targetType · targetId · actorId · userId · postId · action · period/from/to · page
 */
import Link from "next/link";
import { useState } from "react";
import {
  COMMUNITY_TD,
  CommunityFilterField,
  CommunityListShell,
  CommunityPagination,
  CommunityPeriodFilter,
  CommunityResetFilters,
  CommunitySelect,
  CommunitySummaryCard,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import { TradeMemberCell, tradeDetailHref } from "@/components/admin/trade/kit/TradeAdminKit";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

const PAGE_SIZE = 50;

/* ───────── 라벨 (대시보드 「최근 관리자 조치」와 공용) ───────── */

export const TRADE_AUDIT_TARGET_OPTIONS: { value: string; label: string }[] = [
  { value: "trade_post", label: "거래글" },
  { value: "post", label: "거래글 (이전 기록)" },
  { value: "trade_report", label: "신고" },
  { value: "trade_restriction", label: "거래 제한" },
  { value: "trade_promotion_order", label: "홍보" },
  { value: "trade_ad_product", label: "광고 상품" },
  { value: "trade_category", label: "카테고리" },
  { value: "trade_settings", label: "거래 설정" },
  { value: "transaction_review", label: "거래 후기" },
  { value: "product_chat", label: "거래 채팅" },
];
const TARGET_LABEL: Record<string, string> = Object.fromEntries(TRADE_AUDIT_TARGET_OPTIONS.map((o) => [o.value, o.label]));

export function tradeAuditTargetLabel(targetType: string | null | undefined): string {
  return TARGET_LABEL[String(targetType ?? "")] ?? "기타";
}

const ACTION_LABEL: Record<string, string> = {
  "trade_post.hide": "거래글 숨김",
  "trade_post.unhide": "거래글 숨김 해제",
  "trade_post.delete": "거래글 삭제",
  "trade_post.undelete": "거래글 삭제 복구",
  "trade_post.confirm_admin_hidden": "관리자 숨김으로 확정",
  "trade_post.edit": "거래글 수정",
  "trade_post.hard_delete": "거래글 영구 삭제",
  "trade_post.force_complete": "거래 완료로 정정",
  "trade_post.cancel_sale": "판매 취소",
  "trade_report.reject": "신고 반려",
  "trade_report.hide": "신고 처리 · 글 숨김",
  "trade_report.warn": "신고 처리 · 경고",
  "trade_report.restrict": "신고 처리 · 거래 제한",
  "trade_restriction.apply_warning": "경고",
  "trade_restriction.apply_trade_restriction": "거래 제한",
  "trade_restriction.revoke": "제한 해제",
  "trade_promotion_order.request_review": "홍보 신청",
  "trade_promotion_order.approve": "홍보 승인",
  "trade_promotion_order.reject": "홍보 반려",
  "trade_promotion_order.pause": "홍보 일시 중지",
  "trade_promotion_order.resume": "홍보 재개",
  "trade_promotion_order.end": "홍보 종료",
  "trade_promotion_order.expire": "홍보 기간 만료",
  "trade_category.create": "카테고리 추가",
  "trade_category.update": "카테고리 수정",
  "trade_category.delete": "카테고리 삭제",
  "trade_category.reorder": "카테고리 순서 변경",
  "trade_settings.update": "거래 설정 변경",
  "trade_settings.ops_policy_update": "운영 정책 변경",
  "trade_ad_product.update": "광고 상품 수정",
  "trade_flow.revert": "거래 단계 되돌리기",
  "trade_flow.confirm_buyer": "구매자 확정",
  "transaction_review.hide_review": "후기 숨김",
  "transaction_review.restore_review": "후기 복구",
};

/** 알려진 조치 코드면 한국어, 아니면 null (화면은 원래 값을 작게 표시) */
export function tradeAuditActionKnown(action: string | null | undefined): string | null {
  return ACTION_LABEL[String(action ?? "")] ?? null;
}

export function tradeAuditActionLabel(action: string | null | undefined): string {
  return tradeAuditActionKnown(action) ?? "기타 조치";
}

function targetHref(targetType: string | null, targetId: string | null, after: Record<string, unknown> | null): string | null {
  const id = String(targetId ?? "");
  switch (targetType) {
    case "trade_post":
    case "post":
      return id ? `/admin/products/${encodeURIComponent(id)}` : null;
    case "trade_report": {
      const postId = typeof after?.post_id === "string" ? after.post_id : null;
      return postId ? `/admin/trade/reports?tab=all&targetId=${encodeURIComponent(postId)}` : "/admin/trade/reports?tab=all";
    }
    case "trade_restriction":
      return "/admin/trade/restrictions";
    case "trade_promotion_order":
      return "/admin/trade/promotions?tab=all";
    default:
      return null;
  }
}

function reasonOf(after: unknown): string | null {
  if (after && typeof after === "object" && !Array.isArray(after)) {
    const r = (after as Record<string, unknown>).reason;
    if (typeof r === "string" && r.trim()) return r.trim();
  }
  return null;
}

/* ───────── 화면 ───────── */

type AuditRow = {
  id: string;
  actor_type: string | null;
  actor_id: string | null;
  actor_label: string | null;
  target_type: string | null;
  target_id: string | null;
  action: string | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
};
type AuditResponse = { ok?: boolean; error?: string; total?: number; rows?: AuditRow[] };

type FavoriteRow = {
  id: string;
  user_id: string | null;
  user_label: string | null;
  post_id: string | null;
  post_title: string | null;
  action: string;
  created_at: string;
};
type FavoriteResponse = { ok?: boolean; error?: string; total?: number; items?: FavoriteRow[] };

export function TradeAuditPage() {
  const q = useCommunityQueryState();
  const tab = q.get("tab") === "favorites" ? "favorites" : "ops";
  return tab === "favorites" ? <FavoritesTab /> : <OpsTab />;
}

function AuditTabs() {
  const q = useCommunityQueryState();
  const tab = q.get("tab") === "favorites" ? "favorites" : "ops";
  return (
    <CommunityTabs
      value={tab}
      // 탭을 바꾸면 다른 탭의 필터는 비운다
      onChange={(v) =>
        q.set({
          tab: v === "favorites" ? "favorites" : null,
          targetType: null,
          targetId: null,
          actorId: null,
          userId: null,
          postId: null,
          action: null,
          period: null,
          from: null,
          to: null,
        })
      }
      tabs={[
        { value: "ops", label: "운영 기록" },
        { value: "favorites", label: "찜 기록" },
      ]}
    />
  );
}

function periodParams(q: ReturnType<typeof useCommunityQueryState>, params: URLSearchParams, fallback: string) {
  const period = q.get("period") || fallback;
  params.set("period", period);
  if (period === "custom") {
    if (q.get("from")) params.set("from", q.get("from"));
    if (q.get("to")) params.set("to", q.get("to"));
  }
  return period === "custom" && (!q.get("from") || !q.get("to"));
}

function OpsTab() {
  const q = useCommunityQueryState();
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const targetType = q.get("targetType");
  const targetId = q.get("targetId");
  const actorId = q.get("actorId");
  const period = q.get("period") || "30d";

  const params = new URLSearchParams();
  if (targetType) params.set("targetType", targetType);
  if (targetId) params.set("targetId", targetId);
  if (actorId) params.set("actorId", actorId);
  const customIncomplete = periodParams(q, params, "30d");
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String((q.page - 1) * PAGE_SIZE));
  const { state, reload } = useCommunityAdminJson<AuditResponse>(
    customIncomplete ? null : `/api/admin/trade/audit?${params.toString()}`
  );
  const rows = state.status === "ok" ? state.data.rows ?? [] : [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const actorName = actorId ? rows.find((r) => r.actor_id === actorId)?.actor_label : null;

  return (
    <CommunityListShell
      title="운영 기록"
      description="거래에서 관리자가 한 조치를 누가·언제·무엇을·왜 했는지 확인합니다."
      tabs={<AuditTabs />}
      filters={
        <>
          <CommunityFilterField label="대상 유형">
            <CommunitySelect
              value={targetType}
              onChange={(v) => q.set({ targetType: v, targetId: null })}
              options={[{ value: "", label: "전체" }, ...TRADE_AUDIT_TARGET_OPTIONS]}
            />
          </CommunityFilterField>
          <CommunityPeriodFilter
            period={period === "all" ? "" : period}
            from={q.get("from")}
            to={q.get("to")}
            onChange={(v) => q.set({ period: v.period === "30d" ? null : v.period || "all", from: v.from, to: v.to })}
          />
          {actorId ? (
            <CommunityFilterField label="처리자">
              <span className="flex items-center gap-2 text-[13px] text-sam-fg">
                {actorName || "선택한 관리자"}
                <button type="button" className="text-sam-muted underline" onClick={() => q.set({ actorId: null })}>
                  해제
                </button>
              </span>
            </CommunityFilterField>
          ) : null}
          {targetId ? (
            <CommunityFilterField label="대상">
              <span className="flex items-center gap-2 text-[13px] text-sam-fg">
                한 대상의 기록만
                <button type="button" className="text-sam-muted underline" onClick={() => q.set({ targetId: null })}>
                  해제
                </button>
              </span>
            </CommunityFilterField>
          ) : null}
          <CommunityResetFilters onReset={() => q.reset()} />
        </>
      }
      footer={
        total !== null && total > 0 ? (
          <CommunityPagination page={q.page} pageSize={PAGE_SIZE} total={total} onPage={(p) => q.set({ page: p })} />
        ) : null
      }
    >
      {customIncomplete ? (
        <AdminEmptyState ko message="직접 지정 기간의 시작일과 종료일을 모두 선택하세요." />
      ) : state.status === "loading" && !state.data ? (
        <AdminLoadingState ko />
      ) : state.status === "error" ? (
        <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      ) : rows.length === 0 ? (
        <AdminEmptyState ko message="조건에 맞는 운영 기록이 없습니다." />
      ) : (
        <CommunityTable head={["시각 (PHT)", "처리자", "대상", "조치", "사유", ""]}>
          {rows.map((r) => {
            const href = targetHref(r.target_type, r.target_id, r.after_json);
            const known = tradeAuditActionKnown(r.action);
            const actor = r.actor_label || (r.actor_type === "system" ? "시스템" : "관리자");
            return (
              <tr key={r.id} className="border-b border-sam-border-soft">
                <td className={COMMUNITY_TD}>
                  <CommunityTimeCell iso={r.created_at} absolute />
                </td>
                <td className={COMMUNITY_TD}>
                  {r.actor_id && !actorId ? (
                    <button
                      type="button"
                      className="text-left font-medium text-sky-800 hover:underline"
                      title="이 처리자의 기록만 보기"
                      onClick={() => q.set({ actorId: r.actor_id })}
                    >
                      {actor}
                    </button>
                  ) : (
                    actor
                  )}
                </td>
                <td className={COMMUNITY_TD}>
                  {href ? (
                    <Link href={tradeDetailHref(href, q.selfHref)} className="font-medium text-sky-800 hover:underline">
                      {tradeAuditTargetLabel(r.target_type)}
                    </Link>
                  ) : (
                    tradeAuditTargetLabel(r.target_type)
                  )}
                  {r.target_id && !targetId ? (
                    <button
                      type="button"
                      className="block text-left sam-text-xxs text-sam-muted underline"
                      onClick={() => q.set({ targetType: r.target_type, targetId: r.target_id })}
                    >
                      이 대상 기록만 보기
                    </button>
                  ) : null}
                </td>
                <td className={COMMUNITY_TD}>
                  {known ?? (
                    <>
                      기타 조치
                      <span className="block font-mono sam-text-xxs text-sam-muted">{r.action || "—"}</span>
                    </>
                  )}
                </td>
                <td className={`${COMMUNITY_TD} max-w-[24rem] whitespace-pre-wrap [overflow-wrap:anywhere]`}>
                  {reasonOf(r.after_json) || "—"}
                </td>
                <td className={COMMUNITY_TD}>
                  <AdminActionButton variant="ghost" onClick={() => setDetail(r)}>
                    자세히
                  </AdminActionButton>
                </td>
              </tr>
            );
          })}
        </CommunityTable>
      )}

      {detail ? (
        <AdminFormSheet
          title="운영 기록 자세히"
          onClose={() => setDetail(null)}
          footer={
            <AdminActionButton variant="secondary" className="w-full" onClick={() => setDetail(null)}>
              닫기
            </AdminActionButton>
          }
        >
          <div className="space-y-3">
            <CommunitySummaryCard
              rows={[
                { label: "시각", value: `${formatAdminManilaDateTime(detail.created_at)} PHT` },
                { label: "처리자", value: detail.actor_label || (detail.actor_type === "system" ? "시스템" : "관리자") },
                { label: "대상", value: tradeAuditTargetLabel(detail.target_type) },
                { label: "조치", value: tradeAuditActionLabel(detail.action) },
                { label: "사유", value: reasonOf(detail.after_json) || "—" },
              ]}
            />
            <AdminTechDetails ko>
              <p className="mb-1 font-sans font-semibold text-sam-fg">변경 전</p>
              <pre className="whitespace-pre-wrap">{JSON.stringify(detail.before_json, null, 2) ?? "—"}</pre>
              <p className="mb-1 mt-2 font-sans font-semibold text-sam-fg">변경 후</p>
              <pre className="whitespace-pre-wrap">{JSON.stringify(detail.after_json, null, 2) ?? "—"}</pre>
              <p className="mt-2">
                {detail.action ?? "—"} · {detail.target_type ?? "—"} / {detail.target_id ?? "—"} · actor {detail.actor_id ?? "—"}
              </p>
            </AdminTechDetails>
          </div>
        </AdminFormSheet>
      ) : null}
    </CommunityListShell>
  );
}

const FAVORITE_ACTIONS = [
  { value: "", label: "전체" },
  { value: "add", label: "추가" },
  { value: "remove", label: "해제" },
];

function FavoritesTab() {
  const q = useCommunityQueryState();
  const userId = q.get("userId");
  const postId = q.get("postId");
  const action = q.get("action");
  const period = q.get("period");

  const params = new URLSearchParams();
  if (userId) params.set("userId", userId);
  if (postId) params.set("postId", postId);
  if (action) params.set("action", action);
  const customIncomplete = periodParams(q, params, "all");
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String((q.page - 1) * PAGE_SIZE));
  const { state, reload } = useCommunityAdminJson<FavoriteResponse>(
    customIncomplete ? null : `/api/admin/favorite-audit?${params.toString()}`
  );
  const rows = state.status === "ok" ? state.data.items ?? [] : [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const memberName = userId ? rows.find((r) => r.user_id === userId)?.user_label : null;
  const postName = postId ? rows.find((r) => r.post_id === postId)?.post_title : null;

  return (
    <CommunityListShell
      title="운영 기록"
      description="회원이 거래글을 찜하거나 해제한 기록입니다."
      tabs={<AuditTabs />}
      filters={
        <>
          <CommunityFilterField label="동작">
            <CommunitySelect value={action} onChange={(v) => q.set({ action: v })} options={FAVORITE_ACTIONS} />
          </CommunityFilterField>
          <CommunityPeriodFilter
            period={period}
            from={q.get("from")}
            to={q.get("to")}
            onChange={(v) => q.set({ period: v.period, from: v.from, to: v.to })}
          />
          {userId ? (
            <CommunityFilterField label="회원">
              <span className="flex items-center gap-2 text-[13px] text-sam-fg">
                {memberName || "선택한 회원"}
                <button type="button" className="text-sam-muted underline" onClick={() => q.set({ userId: null })}>
                  해제
                </button>
              </span>
            </CommunityFilterField>
          ) : null}
          {postId ? (
            <CommunityFilterField label="게시물">
              <span className="flex items-center gap-2 text-[13px] text-sam-fg">
                {postName || "선택한 게시물"}
                <button type="button" className="text-sam-muted underline" onClick={() => q.set({ postId: null })}>
                  해제
                </button>
              </span>
            </CommunityFilterField>
          ) : null}
          <CommunityResetFilters onReset={() => q.reset(["tab"])} />
        </>
      }
      footer={
        total !== null && total > 0 ? (
          <CommunityPagination page={q.page} pageSize={PAGE_SIZE} total={total} onPage={(p) => q.set({ page: p })} />
        ) : null
      }
    >
      {customIncomplete ? (
        <AdminEmptyState ko message="직접 지정 기간의 시작일과 종료일을 모두 선택하세요." />
      ) : state.status === "loading" && !state.data ? (
        <AdminLoadingState ko />
      ) : state.status === "error" ? (
        <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      ) : rows.length === 0 ? (
        <AdminEmptyState ko message="조건에 맞는 찜 기록이 없습니다." />
      ) : (
        <CommunityTable head={["시각 (PHT)", "회원", "게시물", "동작"]}>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-sam-border-soft">
              <td className={COMMUNITY_TD}>
                <CommunityTimeCell iso={r.created_at} absolute />
              </td>
              <td className={COMMUNITY_TD}>
                <TradeMemberCell userId={r.user_id} label={r.user_label} returnTo={q.selfHref} />
                {r.user_id && !userId ? (
                  <button
                    type="button"
                    className="block text-left sam-text-xxs text-sam-muted underline"
                    onClick={() => q.set({ userId: r.user_id })}
                  >
                    이 회원만 보기
                  </button>
                ) : null}
              </td>
              <td className={`${COMMUNITY_TD} max-w-[22rem]`}>
                {r.post_id ? (
                  <Link
                    href={tradeDetailHref(`/admin/products/${encodeURIComponent(r.post_id)}`, q.selfHref)}
                    className="font-medium text-sky-800 hover:underline [overflow-wrap:anywhere]"
                  >
                    {r.post_title || "삭제되었거나 찾을 수 없는 글"}
                  </Link>
                ) : (
                  "—"
                )}
                {r.post_id && !postId ? (
                  <button
                    type="button"
                    className="block text-left sam-text-xxs text-sam-muted underline"
                    onClick={() => q.set({ postId: r.post_id })}
                  >
                    이 게시물만 보기
                  </button>
                ) : null}
              </td>
              <td className={COMMUNITY_TD}>
                {r.action === "add" ? (
                  <AdminToneBadge tone="success">추가</AdminToneBadge>
                ) : r.action === "remove" ? (
                  <AdminToneBadge tone="neutral">해제</AdminToneBadge>
                ) : (
                  <span className="font-mono sam-text-xxs text-sam-muted">{r.action || "—"}</span>
                )}
              </td>
            </tr>
          ))}
        </CommunityTable>
      )}
    </CommunityListShell>
  );
}
