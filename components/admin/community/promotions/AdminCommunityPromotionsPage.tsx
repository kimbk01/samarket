"use client";

/**
 * 게시글 상위노출 (설계 §C-12 · §F-1) — 커뮤니티 상위노출 주문만 (`point_promotion_orders` domain=community).
 * 조치: 「노출 중지」 L2(사유) · 「노출 재개」 L2(exposeStart · 사유 · 종료일을 중지 시간만큼 연장) ·
 *       「상위노출 종료」 L3(귀책 선택 → 환급 미리보기 → 공개 사유 + 내부 메모 → 실행 · 대상 재입력 없음 · 어드민 SSOT §3-1).
 * D-10: 정지·재개·종료는 공개 사유(회원에게 전달) + 내부 메모(운영자만 · `internalReason`) 두 칸.
 * 삭제는 공용 `AdminAdDeleteAction`(사유만).
 * URL: tab=active|paused|ended|rejected|all · page · size(20/50/100)
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityListBody,
  CommunityListShell,
  CommunityPagination,
  CommunityStatusBadge,
  CommunityTable,
  CommunityTabs,
  communityDetailHref,
  communitySheetFetch,
  useCommunityQueryState,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminResultBanner, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { adminCommunityLabel } from "@/lib/admin/status-labels/community-status-labels";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { adsWorkspaceActionSplitsReason } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";
import { AdsInternalMemoField } from "@/components/admin/community/kit/AdsInternalMemoField";
import { AdminAdDeleteAction } from "@/components/admin/ads/AdminAdDeleteAction";
import {
  formatCommunityPoints,
  useCommunityAdminJson,
  type CommunityBannerState,
} from "@/components/admin/community/members/use-community-admin-data";

const TABS = ["active", "paused", "ended", "rejected", "all"] as const;

type Order = {
  id: string;
  userId: string;
  targetId: string;
  targetTitle: string;
  orderStatus: string;
  startAt: string;
  endAt: string;
  durationDays: number;
  pointCost: number;
  paidPoints: number | null;
  refundPoints: number | null;
  fault: string | null;
  endReasonCode: string | null;
  endedAt: string | null;
  pausedAt: string | null;
  buyerNickname: string | null;
  buyerLabel: string | null;
  post: { id: string; title: string; status: string; authorId: string | null; authorLabel: string | null } | null;
};

type ListResponse = { ok?: boolean; error?: string; total?: number; orders?: Order[] };

type Preview = { refundPoints: number; paidPoints: number | null; remainingSeconds: number; hasPaymentRecord: boolean };

/** D-10 — 내부 메모가 있으면 `internalReason` 으로 보낸다(회원 응답·알림에 나가지 않음). */
function withInternalMemo(body: Record<string, unknown>, memo: string | null | undefined): Record<string, unknown> {
  const m = String(memo ?? "").trim();
  return m ? { ...body, internalReason: m } : body;
}

const shortDate = (iso: string | null | undefined) => (iso ? formatAdminManilaDateTime(iso).slice(5, 16) : "—");

type Tr = (key: MessageKey, vars?: Record<string, string | number>) => string;

function remainingDays(o: Order, t: Tr): string | null {
  if (o.orderStatus !== "active" && o.orderStatus !== "paused") return null;
  const ms = Date.parse(o.endAt) - Date.now();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return t("admin_community_promo_period_over");
  const d = Math.ceil(ms / 86_400_000);
  return t("admin_community_promo_days_left", { d });
}

type Sheet = { kind: "pause" | "end"; order: Order } | null;

export function AdminCommunityPromotionsPage() {
  const { t, language } = useI18n();
  const q = useCommunityQueryState();
  /** 쓰기(노출 중지·재개·상위노출 종료) — 접근표 action community("promotion"). 서버 가드는 그대로. */
  const action = useAdminRouteAction("/admin/community/promotions");
  const canAct = action.allowed;
  const tab = (TABS as readonly string[]).includes(q.get("tab")) ? q.get("tab") : "active";
  const [sheet, setSheet] = useState<Sheet>(null);
  const [banner, setBanner] = useState<CommunityBannerState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** D-10 — 노출 중지 시트의 내부 메모 */
  const [pauseMemo, setPauseMemo] = useState("");

  const { state, reload } = useCommunityAdminJson<ListResponse>(
    `/api/admin/community-promotion-orders?status=${tab}&limit=${q.size}&offset=${(q.page - 1) * q.size}`
  );
  const rows = state.data?.orders ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;

  const settle = (kind: CommunitySheetSettle, okMessage: string) => {
    setSheet(null);
    reload();
    setBanner({ ok: true, message: kind === "done" ? okMessage : kind === "stale" ? t("admin_community_post_stale") : t("admin_community_list_gone") });
  };

  const resume = async (o: Order) => {
    if (busyId || !canAct) return;
    const c = await confirmAdminAction({
      level: adminActionLevel("exposeStart"),
      ko: true,
      title: t("admin_community_promo_resume"),
      description: t("admin_community_promo_resume_desc", { title: o.post?.title || o.targetTitle || t("admin_community_promo_post_fallback") }),
      confirmLabel: t("admin_community_promo_resume"),
      splitReason: adsWorkspaceActionSplitsReason("resume"),
    });
    if (!c.ok) return;
    setBusyId(o.id);
    const r = await communitySheetFetch(`/api/admin/community-promotion-orders/${encodeURIComponent(o.id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withInternalMemo({ action: "resume", reason: c.reason }, c.internalMemo)),
    });
    setBusyId(null);
    reload();
    if (r.ok) setBanner({ ok: true, message: t("admin_community_promo_resumed") });
    else if (r.status === 409) setBanner({ ok: true, message: t("admin_community_post_stale") });
    else setBanner({ ok: false, code: r.code });
  };

  return (
    <CommunityListShell
      title={t("admin_community_promo_title")}
      description={t("admin_community_promo_desc")}
      actions={
        <AdminActionLink href="/admin/advertising/boosts" variant="ghost">
          {t("admin_community_promo_view_all")}
        </AdminActionLink>
      }
      banner={
        <>
          {!action.allowed && action.reason ? (
            <p className="sam-text-helper text-sam-muted" data-admin-action-denied="1">
              {t("admin_community_promo_actions_disabled", { reason: action.reason })}
            </p>
          ) : null}
          <AdminResultBanner ko result={banner} onClose={() => setBanner(null)} />
        </>
      }
      tabs={
        <CommunityTabs
          value={tab}
          onChange={(v) => q.set({ tab: v === "active" ? null : v })}
          tabs={[
            { value: "active", label: t("admin_community_promo_tab_active"), count: tab === "active" ? total : null },
            { value: "paused", label: t("admin_community_promo_tab_paused"), count: tab === "paused" ? total : null },
            { value: "ended", label: t("admin_community_promo_tab_ended"), count: tab === "ended" ? total : null },
            { value: "rejected", label: t("admin_community_promo_tab_rejected"), count: tab === "rejected" ? total : null },
            { value: "all", label: t("admin_community_promo_tab_all"), count: tab === "all" ? total : null },
          ]}
        />
      }
      footer={
        total !== null && total > 0 ? (
          <CommunityPagination
            page={q.page}
            pageSize={q.size}
            total={total}
            onPage={(p) => q.set({ page: p })}
            onPageSize={(size) => q.set({ size })}
            disabled={state.status === "loading"}
          />
        ) : null
      }
    >
      <CommunityListBody state={state} empty={rows.length === 0} onRetry={reload} emptyMessage={t("admin_community_promo_empty")}>
        <CommunityTable head={[
          t("admin_community_promo_col_post"),
          t("admin_community_promo_col_buyer"),
          t("admin_community_promo_col_period"),
          t("admin_community_promo_col_paid"),
          t("admin_community_promo_col_status"),
          t("admin_community_promo_col_refund"),
          t("admin_community_promo_col_action"),
        ]}>
          {rows.map((o) => {
            const title = o.post?.title || o.targetTitle || t("admin_community_promo_post_fallback");
            const left = remainingDays(o, t);
            const live = o.orderStatus === "active" || o.orderStatus === "paused";
            return (
              <tr key={o.id} className="border-b border-sam-border-soft">
                <td className={`${COMMUNITY_TD} max-w-[22rem]`}>
                  {o.targetId ? (
                    <Link
                      href={communityDetailHref(`/admin/community/posts/${encodeURIComponent(o.targetId)}`, q.selfHref)}
                      className="font-medium text-sam-info hover:underline"
                    >
                      {title}
                    </Link>
                  ) : (
                    title
                  )}
                  {o.post && o.post.status !== "active" ? (
                    <div className="mt-1">
                      <CommunityStatusBadge domain="content_status" value={o.post.status} />
                    </div>
                  ) : null}
                  {!o.post && o.targetId ? <div className="text-[12px] text-sam-muted">{t("admin_community_promo_post_missing")}</div> : null}
                </td>
                <td className={COMMUNITY_TD}>
                  {o.userId ? (
                    <Link
                      href={communityDetailHref(`/admin/community/members/${encodeURIComponent(o.userId)}`, q.selfHref)}
                      className="font-medium text-sam-info hover:underline"
                    >
                      {o.buyerNickname || o.buyerLabel || t("admin_community_promo_no_name")}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap`}>
                  {t("admin_community_promo_duration_range", { days: o.durationDays, start: shortDate(o.startAt), end: shortDate(o.endAt) })}
                  {left ? <div className="text-[12px] text-sam-muted">{left}</div> : null}
                </td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatCommunityPoints(o.paidPoints ?? o.pointCost)}</td>
                <td className={COMMUNITY_TD}>
                  <CommunityStatusBadge domain="promotion_status" value={o.orderStatus} />
                </td>
                <td className={COMMUNITY_TD}>
                  {o.refundPoints !== null && o.refundPoints > 0
                    ? formatCommunityPoints(o.refundPoints)
                    : o.orderStatus === "ended" && o.fault
                      ? t("admin_community_promo_no_refund")
                      : "—"}
                  {o.fault ? <div className="text-[12px] text-sam-muted">{adminCommunityLabel("promotion_fault", o.fault, language !== "en").label}</div> : null}
                </td>
                <td className={COMMUNITY_TD}>
                  {live ? (
                    <div className="flex flex-wrap gap-1">
                      {o.orderStatus === "active" ? (
                        <AdminActionButton
                          variant="ghost"
                          size="sm"
                          disabled={!canAct || busyId === o.id}
                          title={canAct ? undefined : (action.reason ?? undefined)}
                          onClick={() => {
                            if (!canAct) return;
                            setPauseMemo("");
                            setSheet({ kind: "pause", order: o });
                          }}
                        >
                          {t("admin_community_promo_pause")}
                        </AdminActionButton>
                      ) : (
                        <AdminActionButton
                          variant="ghost"
                          size="sm"
                          disabled={!canAct || busyId === o.id}
                          title={canAct ? undefined : (action.reason ?? undefined)}
                          onClick={() => void resume(o)}
                        >
                          {busyId === o.id ? t("admin_community_promo_processing") : t("admin_community_promo_resume")}
                        </AdminActionButton>
                      )}
                      <AdminActionButton
                        variant="danger"
                        size="sm"
                        disabled={!canAct || busyId === o.id}
                        title={canAct ? undefined : (action.reason ?? undefined)}
                        onClick={() => {
                          if (canAct) setSheet({ kind: "end", order: o });
                        }}
                      >
                        {t("admin_community_promo_end")}
                      </AdminActionButton>
                    </div>
                  ) : (
                    <span className="text-sam-muted">—</span>
                  )}
                  <div className="mt-1">
                    <AdminAdDeleteAction
                      kind="community_promotion"
                      id={o.id}
                      title={o.post?.title || o.targetTitle || t("admin_community_promo_post_fallback")}
                      size="sm"
                      onDone={() => reload()}
                    />
                  </div>
                  <AdminTechDetails ko>
                    <div>order: {o.id}</div>
                    {o.endReasonCode ? <div>end_reason: {o.endReasonCode}</div> : null}
                  </AdminTechDetails>
                </td>
              </tr>
            );
          })}
        </CommunityTable>
      </CommunityListBody>

      {sheet?.kind === "pause" ? (
        <CommunityActionSheet
          title={t("admin_community_promo_pause_title")}
          rows={orderRows(sheet.order, t, language !== "en")}
          notice={t("admin_community_promo_pause_notice")}
          reason={{ minLength: 2, placeholder: t("admin_community_promo_pause_reason") }}
          confirmLabel={t("admin_community_promo_pause_button")}
          onSubmit={(reason) =>
            !canAct
              ? Promise.resolve({ ok: false as const, status: 403, code: "forbidden" })
              : communitySheetFetch(`/api/admin/community-promotion-orders/${encodeURIComponent(sheet.order.id)}`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                withInternalMemo({ action: "pause", reason }, adsWorkspaceActionSplitsReason("pause") ? pauseMemo : "")
              ),
            })
          }
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, t("admin_community_promo_paused"))}
        >
          {adsWorkspaceActionSplitsReason("pause") ? (
            <AdsInternalMemoField value={pauseMemo} onChange={setPauseMemo} />
          ) : null}
        </CommunityActionSheet>
      ) : null}

      {sheet?.kind === "end" ? (
        <EndPromotionSheet
          order={sheet.order}
          canWrite={canAct}
          onClose={() => setSheet(null)}
          onSettled={(k, refund) =>
            settle(
              k,
              refund > 0
                ? t("admin_community_promo_ended_refund", { points: formatAdminNumber(refund) })
                : t("admin_community_promo_ended_no_refund")
            )
          }
        />
      ) : null}
    </CommunityListShell>
  );
}

function orderRows(o: Order, t: Tr, ko: boolean) {
  return [
    { label: t("admin_community_promo_col_post"), value: o.post?.title || o.targetTitle || t("admin_community_promo_post_fallback") },
    { label: t("admin_community_promo_col_buyer"), value: o.buyerNickname || o.buyerLabel || "—" },
    {
      label: t("admin_community_promo_col_period"),
      value: t("admin_community_promo_period_value", { days: o.durationDays, start: shortDate(o.startAt), end: shortDate(o.endAt) }),
    },
    { label: t("admin_community_promo_col_paid"), value: formatCommunityPoints(o.paidPoints ?? o.pointCost) },
    { label: t("admin_community_promo_col_status"), value: adminCommunityLabel("promotion_status", o.orderStatus, ko).label },
  ];
}

/** 상위노출 종료 L3 — 귀책을 고르면 서버 미리보기로 환급 예정 포인트를 먼저 보여 준다 (대상 재입력 없음). */
function EndPromotionSheet({
  order,
  canWrite,
  onClose,
  onSettled,
}: {
  order: Order;
  canWrite: boolean;
  onClose: () => void;
  onSettled: (k: CommunitySheetSettle, refund: number) => void;
}) {
  const { t, language } = useI18n();
  const [fault, setFault] = useState<"operator" | "member" | null>(null);
  const [preview, setPreview] = useState<{ fault: string; data: Preview } | { fault: string; error: string } | null>(null);
  const lastRefund = useRef(0);
  const [memo, setMemo] = useState("");
  const url = `/api/admin/community-promotion-orders/${encodeURIComponent(order.id)}`;

  useEffect(() => {
    if (!fault) return;
    let alive = true;
    setPreview(null);
    void (async () => {
      try {
        const res = await fetch(url, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          // 미리보기는 사유 검증을 통과해야 하므로 안내 문구를 함께 보낸다 (기록·변경 없음)
          body: JSON.stringify({ action: "end", fault, reason: "환급 미리보기", preview: true }),
        });
        const j = (await res.json().catch(() => ({}))) as Partial<Preview> & { ok?: boolean; error?: string };
        if (!alive) return;
        if (!res.ok || !j.ok) {
          setPreview({ fault, error: j.error || `http_${res.status}` });
          return;
        }
        setPreview({
          fault,
          data: {
            refundPoints: Number(j.refundPoints ?? 0),
            paidPoints: j.paidPoints ?? null,
            remainingSeconds: Number(j.remainingSeconds ?? 0),
            hasPaymentRecord: Boolean(j.hasPaymentRecord),
          },
        });
      } catch {
        if (alive) setPreview({ fault, error: "network_error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [fault, url]);

  const ready = Boolean(fault && preview && preview.fault === fault && "data" in preview);

  return (
    <CommunityActionSheet
      title={t("admin_community_promo_end_title")}
      rows={[
        ...orderRows(order, t, language !== "en"),
        ...(ready && preview && "data" in preview
          ? [{ label: t("admin_community_promo_refund_expected"), value: <strong>{formatCommunityPoints(preview.data.refundPoints)}</strong> }]
          : []),
      ]}
      notice={t("admin_community_promo_end_notice")}
      reason={{ minLength: 2, placeholder: t("admin_community_promo_end_reason") }}
      ready={ready && canWrite}
      destructive
      confirmLabel={t("admin_community_promo_end_button")}
      onSubmit={async (reason) => {
        if (!canWrite) return { ok: false, status: 403, code: "forbidden" };
        try {
          const res = await fetch(url, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withInternalMemo({ action: "end", fault, reason }, adsWorkspaceActionSplitsReason("end") ? memo : "")
            ),
          });
          const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; refundPoints?: number };
          if (res.ok && j.ok !== false) {
            lastRefund.current = Number(j.refundPoints ?? 0);
            return { ok: true };
          }
          return { ok: false, status: res.status, code: j.error || `http_${res.status}` };
        } catch {
          return { ok: false, status: 0, code: "network_error" };
        }
      }}
      onClose={onClose}
      onSettled={(k) => onSettled(k, lastRefund.current)}
    >
      <fieldset className="space-y-2">
        <legend className="sam-text-helper font-medium text-sam-fg">{t("admin_community_promo_fault_required")}</legend>
        <label className="flex items-start gap-2 text-[13px]">
          <input type="radio" name="fault" checked={fault === "operator"} onChange={() => setFault("operator")} className="mt-0.5" />
          <span>
            <span className="font-medium text-sam-fg">{t("admin_community_promo_fault_ops")}</span>
            <span className="block text-sam-muted">{t("admin_community_promo_fault_ops_hint")}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-[13px]">
          <input type="radio" name="fault" checked={fault === "member"} onChange={() => setFault("member")} className="mt-0.5" />
          <span>
            <span className="font-medium text-sam-fg">{t("admin_community_promo_fault_member")}</span>
            <span className="block text-sam-muted">{t("admin_community_promo_fault_member_hint")}</span>
          </span>
        </label>
      </fieldset>
      {fault && !preview ? <p className="text-[13px] text-sam-muted">{t("admin_community_promo_refund_calculating")}</p> : null}
      {preview && "data" in preview ? (
        <p className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[13px] font-semibold text-sam-fg">
          {t("admin_community_promo_refund_preview", { points: formatCommunityPoints(preview.data.refundPoints) })}
          {!preview.data.hasPaymentRecord ? (
            <span className="block font-normal text-sam-warning">{t("admin_community_promo_no_payment_record")}</span>
          ) : null}
        </p>
      ) : null}
      {preview && "error" in preview ? (
        <AdminResultBanner ko result={{ ok: false, code: preview.error }} />
      ) : null}
      {adsWorkspaceActionSplitsReason("end") ? <AdsInternalMemoField value={memo} onChange={setMemo} /> : null}
    </CommunityActionSheet>
  );
}
