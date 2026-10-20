"use client";

/**
 * 게시글 홍보 (설계 §C-12 · §F-1) — 커뮤니티 홍보 주문만 (`point_promotion_orders` domain=community).
 * 조치: 「노출 중지」 L2(사유) · 「노출 재개」 L2(exposeStart · 사유 · 종료일을 중지 시간만큼 연장) ·
 *       「홍보 종료」 L3(귀책 선택 → 환급 미리보기 → 대상 재입력 → 실행).
 * URL: tab=active|paused|ended|rejected|all · page
 */
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
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
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { adminCommunityLabel } from "@/lib/admin/status-labels/community-status-labels";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import {
  COMMUNITY_GONE_MESSAGE,
  COMMUNITY_STALE_MESSAGE,
  formatCommunityPoints,
  useCommunityAdminAccess,
  useCommunityAdminJson,
  type CommunityBannerState,
} from "@/components/admin/community/members/use-community-admin-data";

const PAGE_SIZE = 50;
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

const shortDate = (iso: string | null | undefined) => (iso ? formatAdminManilaDateTime(iso).slice(5, 16) : "—");

function remainingDays(o: Order): string | null {
  if (o.orderStatus !== "active" && o.orderStatus !== "paused") return null;
  const ms = Date.parse(o.endAt) - Date.now();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return "기간 끝남";
  const d = Math.ceil(ms / 86_400_000);
  return `${d}일 남음`;
}

type Sheet = { kind: "pause" | "end"; order: Order } | null;

export function AdminCommunityPromotionsPage() {
  const q = useCommunityQueryState();
  const access = useCommunityAdminAccess();
  const canAct = access.allowed("promotion");
  const tab = (TABS as readonly string[]).includes(q.get("tab")) ? q.get("tab") : "active";
  const [sheet, setSheet] = useState<Sheet>(null);
  const [banner, setBanner] = useState<CommunityBannerState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { state, reload } = useCommunityAdminJson<ListResponse>(
    `/api/admin/community-promotion-orders?status=${tab}&page=${q.page}&pageSize=${PAGE_SIZE}`
  );
  const rows = state.status === "ok" ? state.data.orders ?? [] : [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;

  const settle = (kind: CommunitySheetSettle, okMessage: string) => {
    setSheet(null);
    reload();
    setBanner({ ok: true, message: kind === "done" ? okMessage : kind === "stale" ? COMMUNITY_STALE_MESSAGE : COMMUNITY_GONE_MESSAGE });
  };

  const resume = async (o: Order) => {
    if (busyId) return;
    const c = await confirmAdminAction({
      level: adminActionLevel("exposeStart"),
      ko: true,
      title: "노출 재개",
      description: `「${o.post?.title || o.targetTitle || "게시글"}」 홍보를 다시 노출합니다. 종료일은 중지했던 시간만큼 늘어납니다.`,
      confirmLabel: "노출 재개",
    });
    if (!c.ok) return;
    setBusyId(o.id);
    const r = await communitySheetFetch(`/api/admin/community-promotion-orders/${encodeURIComponent(o.id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume", reason: c.reason }),
    });
    setBusyId(null);
    reload();
    if (r.ok) setBanner({ ok: true, message: "홍보 노출을 재개했습니다." });
    else if (r.status === 409) setBanner({ ok: true, message: COMMUNITY_STALE_MESSAGE });
    else setBanner({ ok: false, code: r.code });
  };

  return (
    <CommunityListShell
      title="게시글 홍보"
      description="회원이 포인트로 구매한 커뮤니티 게시글 홍보의 노출을 관리합니다."
      actions={
        <AdminActionLink href="/admin/advertising/boosts" variant="ghost">
          전체 상위노출(거래 포함) 보기
        </AdminActionLink>
      }
      banner={<AdminResultBanner ko result={banner} onClose={() => setBanner(null)} />}
      tabs={
        <CommunityTabs
          value={tab}
          onChange={(v) => q.set({ tab: v === "active" ? null : v })}
          tabs={[
            { value: "active", label: "노출 중", count: tab === "active" ? total : null },
            { value: "paused", label: "노출 중지", count: tab === "paused" ? total : null },
            { value: "ended", label: "종료", count: tab === "ended" ? total : null },
            { value: "rejected", label: "반려", count: tab === "rejected" ? total : null },
            { value: "all", label: "전체", count: tab === "all" ? total : null },
          ]}
        />
      }
      footer={
        total !== null && total > 0 ? (
          <CommunityPagination page={q.page} pageSize={PAGE_SIZE} total={total} onPage={(p) => q.set({ page: p })} />
        ) : null
      }
    >
      {state.status === "loading" && !state.data ? (
        <AdminLoadingState ko />
      ) : state.status === "error" ? (
        <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      ) : rows.length === 0 ? (
        <AdminEmptyState ko message="이 상태의 홍보가 없습니다." />
      ) : (
        <CommunityTable head={["게시글", "구매자", "기간", "결제 포인트", "상태", "환급", "조치"]}>
          {rows.map((o) => {
            const title = o.post?.title || o.targetTitle || "게시글";
            const left = remainingDays(o);
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
                  {!o.post && o.targetId ? <div className="text-[12px] text-sam-muted">게시글을 찾을 수 없습니다</div> : null}
                </td>
                <td className={COMMUNITY_TD}>
                  {o.userId ? (
                    <Link
                      href={communityDetailHref(`/admin/community/members/${encodeURIComponent(o.userId)}`, q.selfHref)}
                      className="font-medium text-sam-info hover:underline"
                    >
                      {o.buyerNickname || o.buyerLabel || "이름 없음"}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap`}>
                  {o.durationDays}일 · {shortDate(o.startAt)} ~ {shortDate(o.endAt)}
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
                      ? "없음"
                      : "—"}
                  {o.fault ? <div className="text-[12px] text-sam-muted">{adminCommunityLabel("promotion_fault", o.fault, true).label}</div> : null}
                </td>
                <td className={COMMUNITY_TD}>
                  {live ? (
                    <div className="flex flex-wrap gap-1">
                      {o.orderStatus === "active" ? (
                        <AdminActionButton
                          variant="secondary"
                          disabled={!canAct || busyId === o.id}
                          title={access.deniedTitle("promotion")}
                          onClick={() => setSheet({ kind: "pause", order: o })}
                        >
                          노출 중지
                        </AdminActionButton>
                      ) : (
                        <AdminActionButton
                          variant="secondary"
                          disabled={!canAct || busyId === o.id}
                          title={access.deniedTitle("promotion")}
                          onClick={() => void resume(o)}
                        >
                          {busyId === o.id ? "처리 중" : "노출 재개"}
                        </AdminActionButton>
                      )}
                      <AdminActionButton
                        variant="danger"
                        disabled={!canAct || busyId === o.id}
                        title={access.deniedTitle("promotion")}
                        onClick={() => setSheet({ kind: "end", order: o })}
                      >
                        홍보 종료
                      </AdminActionButton>
                    </div>
                  ) : (
                    <span className="text-sam-muted">—</span>
                  )}
                  <AdminTechDetails ko>
                    <div>order: {o.id}</div>
                    {o.endReasonCode ? <div>end_reason: {o.endReasonCode}</div> : null}
                  </AdminTechDetails>
                </td>
              </tr>
            );
          })}
        </CommunityTable>
      )}

      {sheet?.kind === "pause" ? (
        <CommunityActionSheet
          title="노출 중지"
          rows={orderRows(sheet.order)}
          notice="노출이 멈추고, 다시 재개하면 종료일이 중지한 시간만큼 늘어납니다. 환급은 없습니다."
          reason={{ minLength: 2, placeholder: "중지 사유" }}
          confirmLabel="노출 중지"
          onSubmit={(reason) =>
            communitySheetFetch(`/api/admin/community-promotion-orders/${encodeURIComponent(sheet.order.id)}`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "pause", reason }),
            })
          }
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, "홍보 노출을 중지했습니다.")}
        />
      ) : null}

      {sheet?.kind === "end" ? (
        <EndPromotionSheet
          order={sheet.order}
          onClose={() => setSheet(null)}
          onSettled={(k, refund) =>
            settle(k, refund > 0 ? `홍보를 종료했습니다. ${formatAdminNumber(refund)} P 를 환급했습니다.` : "홍보를 종료했습니다. 환급은 없습니다.")
          }
        />
      ) : null}
    </CommunityListShell>
  );
}

function orderRows(o: Order) {
  return [
    { label: "게시글", value: o.post?.title || o.targetTitle || "게시글" },
    { label: "구매자", value: o.buyerNickname || o.buyerLabel || "—" },
    { label: "기간", value: `${o.durationDays}일 · ${shortDate(o.startAt)} ~ ${shortDate(o.endAt)} PHT` },
    { label: "결제 포인트", value: formatCommunityPoints(o.paidPoints ?? o.pointCost) },
    { label: "상태", value: adminCommunityLabel("promotion_status", o.orderStatus, true).label },
  ];
}

/** 홍보 종료 L3 — 귀책을 고르면 서버 미리보기로 환급 예정 포인트를 먼저 보여 준다. */
function EndPromotionSheet({
  order,
  onClose,
  onSettled,
}: {
  order: Order;
  onClose: () => void;
  onSettled: (k: CommunitySheetSettle, refund: number) => void;
}) {
  const [fault, setFault] = useState<"operator" | "member" | null>(null);
  const [preview, setPreview] = useState<{ fault: string; data: Preview } | { fault: string; error: string } | null>(null);
  const lastRefund = useRef(0);
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
  const title = order.post?.title || order.targetTitle || "";
  const retype = title && title.length <= 40 ? title : "홍보 종료";

  return (
    <CommunityActionSheet
      title="홍보 종료"
      rows={[
        ...orderRows(order),
        ...(ready && preview && "data" in preview
          ? [{ label: "환급 예정", value: <strong>{formatCommunityPoints(preview.data.refundPoints)}</strong> }]
          : []),
      ]}
      notice="종료하면 다시 노출할 수 없습니다. 회원에게 종료 사유와 환급 포인트가 알림으로 전달됩니다."
      reason={{ minLength: 2, placeholder: "종료 사유 (회원에게 전달됩니다)" }}
      retypeValue={retype}
      ready={ready}
      destructive
      confirmLabel="홍보 종료"
      onSubmit={async (reason) => {
        try {
          const res = await fetch(url, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "end", fault, reason }),
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
        <legend className="sam-text-helper font-medium text-sam-fg">귀책 (필수)</legend>
        <label className="flex items-start gap-2 text-[13px]">
          <input type="radio" name="fault" checked={fault === "operator"} onChange={() => setFault("operator")} className="mt-0.5" />
          <span>
            <span className="font-medium text-sam-fg">운영 사유</span>
            <span className="block text-sam-muted">시스템 오류·정책 변경 등 — 남은 노출 기간만큼 포인트를 비례 환급합니다.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-[13px]">
          <input type="radio" name="fault" checked={fault === "member"} onChange={() => setFault("member")} className="mt-0.5" />
          <span>
            <span className="font-medium text-sam-fg">회원 사유</span>
            <span className="block text-sam-muted">홍보 정책 위반 등 — 환급하지 않습니다.</span>
          </span>
        </label>
      </fieldset>
      {fault && !preview ? <p className="text-[13px] text-sam-muted">환급 예정 포인트를 계산하는 중…</p> : null}
      {preview && "data" in preview ? (
        <p className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[13px] font-semibold text-sam-fg">
          환급 예정 {formatCommunityPoints(preview.data.refundPoints)}
          {!preview.data.hasPaymentRecord ? (
            <span className="block font-normal text-sam-warning">결제 기록을 찾지 못해 환급할 포인트가 없습니다.</span>
          ) : null}
        </p>
      ) : null}
      {preview && "error" in preview ? (
        <AdminResultBanner ko result={{ ok: false, code: preview.error }} />
      ) : null}
    </CommunityActionSheet>
  );
}
