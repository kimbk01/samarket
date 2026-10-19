"use client";

/**
 * 충전 신청 (설계 §C-14 · §F-3) — 공통 충전 API 를 그대로 쓰는 전체 회원 충전 신청 목록.
 * 목록: 회원·요금제·포인트·결제 금액·상태·신청 시각. 입금자명·증빙·회원 메모는 상세 시트에서만.
 * 처리: 「입금 확인 후 승인」(확인 근거 필수 L2) · 「보류」(L1) · 「반려」(사유 필수 L2) — runPointChargeAction.
 * URL: status=pending|on_hold|approved|rejected|all · chargeId(시트 바로 열기) · page
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  COMMUNITY_TD,
  CommunityListShell,
  CommunityPagination,
  CommunityStatusBadge,
  CommunitySummaryCard,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  communityDetailHref,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { runPointChargeAction, type PointChargeAction } from "@/components/admin/points/point-charge-action-client";
import type { PointChargeRequest } from "@/lib/types/point";
import {
  COMMUNITY_STALE_MESSAGE,
  formatCommunityPeso,
  formatCommunityPoints,
  useCommunityAdminAccess,
  useCommunityAdminJson,
  type CommunityBannerState,
} from "@/components/admin/community/members/use-community-admin-data";

const PAGE_SIZE = 50;

const TAB_STATUSES: Record<string, readonly string[] | null> = {
  pending: ["pending", "waiting_confirm"],
  on_hold: ["on_hold"],
  approved: ["approved"],
  rejected: ["rejected"],
  all: null,
};

const OPEN_STATUSES = new Set(["pending", "waiting_confirm", "on_hold"]);

const PAYMENT_METHOD: Record<string, string> = {
  bank_transfer: "계좌 이체",
  gcash: "GCash",
  manual_confirm: "관리자 확인",
};

type ListResponse = { ok?: boolean; error?: string; requests?: PointChargeRequest[] };
type DetailResponse = { ok?: boolean; error?: string; request?: PointChargeRequest };

const abs = (iso: string | null | undefined) => (iso ? `${formatAdminManilaDateTime(iso)} PHT` : "—");

export function AdminCommunityPointChargesPage() {
  const q = useCommunityQueryState();
  const access = useCommunityAdminAccess();
  const status = q.get("status") in TAB_STATUSES ? q.get("status") : "pending";
  const [openId, setOpenId] = useState<string | null>(() => q.get("chargeId") || null);
  const [banner, setBanner] = useState<CommunityBannerState>(null);
  const { state, reload } = useCommunityAdminJson<ListResponse>("/api/admin/point-charges");

  const all = useMemo(() => (state.status === "ok" ? state.data.requests ?? [] : []), [state]);
  const countOf = (tab: string) => {
    const st = TAB_STATUSES[tab];
    return st ? all.filter((r) => st.includes(r.requestStatus)).length : all.length;
  };
  const filtered = useMemo(() => {
    const st = TAB_STATUSES[status];
    return st ? all.filter((r) => st.includes(r.requestStatus)) : all;
  }, [all, status]);
  const pageRows = filtered.slice((q.page - 1) * PAGE_SIZE, q.page * PAGE_SIZE);
  const loaded = state.status === "ok";

  return (
    <CommunityListShell
      title="충전 신청"
      description="회원의 포인트 충전 신청을 입금 확인 후 승인하거나 반려합니다."
      banner={
        <div className="space-y-2">
          <p
            data-community-charge-scope="all-members"
            className="rounded-ui-rect border border-sky-300 bg-sky-50 px-3 py-2 text-[13px] font-medium text-sky-950"
          >
            포인트는 전체 서비스 공통입니다. 이 목록은 모든 회원의 충전 신청입니다.
          </p>
          <AdminResultBanner ko result={banner} onClose={() => setBanner(null)} />
        </div>
      }
      tabs={
        <CommunityTabs
          value={status}
          onChange={(v) => q.set({ status: v === "pending" ? "pending" : v })}
          tabs={[
            { value: "pending", label: "승인 대기", count: loaded ? countOf("pending") : null },
            { value: "on_hold", label: "보류", count: loaded ? countOf("on_hold") : null },
            { value: "approved", label: "승인", count: loaded ? countOf("approved") : null },
            { value: "rejected", label: "반려", count: loaded ? countOf("rejected") : null },
            { value: "all", label: "전체", count: loaded ? countOf("all") : null },
          ]}
        />
      }
      footer={
        loaded && filtered.length > 0 ? (
          <CommunityPagination page={q.page} pageSize={PAGE_SIZE} total={filtered.length} onPage={(p) => q.set({ page: p })} />
        ) : null
      }
    >
      {state.status === "loading" && !state.data ? (
        <AdminLoadingState ko />
      ) : state.status === "error" ? (
        <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      ) : pageRows.length === 0 ? (
        <AdminEmptyState ko message="이 상태의 충전 신청이 없습니다." />
      ) : (
        <CommunityTable head={["회원", "요금제 · 포인트", "결제 금액", "상태", "신청", ""]}>
          {pageRows.map((r) => (
            <tr key={r.id} className="cursor-pointer border-b border-sam-border-soft hover:bg-sam-app" onClick={() => setOpenId(r.id)}>
              <td className={COMMUNITY_TD}>
                <Link
                  href={communityDetailHref(`/admin/community/members/${encodeURIComponent(r.userId)}`, q.selfHref)}
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium text-sky-800 hover:underline"
                >
                  {r.userNickname?.trim() || "이름 없음"}
                </Link>
              </td>
              <td className={COMMUNITY_TD}>
                {r.planName || "—"}
                <div className="text-[12px] text-sam-muted">{formatCommunityPoints(r.pointAmount)}</div>
              </td>
              <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatCommunityPeso(r.paymentAmount)}</td>
              <td className={COMMUNITY_TD}>
                <CommunityStatusBadge domain="charge_status" value={r.requestStatus} />
              </td>
              <td className={COMMUNITY_TD}>
                <CommunityTimeCell iso={r.requestedAt} />
              </td>
              <td className={COMMUNITY_TD}>
                <AdminActionButton variant="ghost" onClick={() => setOpenId(r.id)}>
                  자세히
                </AdminActionButton>
              </td>
            </tr>
          ))}
        </CommunityTable>
      )}

      {openId ? (
        <ChargeSheet
          id={openId}
          canAct={access.allowed("points")}
          deniedTitle={access.deniedTitle("points")}
          onClose={() => {
            setOpenId(null);
            if (q.get("chargeId")) q.set({ chargeId: null }, { keepPage: true });
          }}
          onDone={(result) => {
            setOpenId(null);
            if (q.get("chargeId")) q.set({ chargeId: null }, { keepPage: true });
            setBanner(result);
            reload();
          }}
        />
      ) : null}
    </CommunityListShell>
  );
}

function ChargeSheet({
  id,
  canAct,
  deniedTitle,
  onClose,
  onDone,
}: {
  id: string;
  canAct: boolean;
  deniedTitle?: string;
  onClose: () => void;
  onDone: (banner: CommunityBannerState) => void;
}) {
  const { state, reload } = useCommunityAdminJson<DetailResponse>(`/api/admin/point-charges/${encodeURIComponent(id)}`);
  const [busy, setBusy] = useState<PointChargeAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const r = state.status === "ok" ? state.data.request ?? null : null;
  const open = r ? OPEN_STATUSES.has(r.requestStatus) : false;

  const act = async (action: PointChargeAction) => {
    if (!r || busy) return;
    setBusy(action);
    setError(null);
    try {
      const out = await runPointChargeAction({
        requestId: r.id,
        action,
        ko: true,
        summary: `${r.userNickname || "회원"} · ${r.pointAmount.toLocaleString()}P · ₱${r.paymentAmount.toLocaleString()} · 입금자 ${
          r.depositorName || "-"
        }`,
      });
      if (!out.ok) {
        if (out.cancelled) return;
        if (out.error === "already_processed" || out.error === "stale_state" || out.error === "conflict") {
          onDone({ ok: true, message: COMMUNITY_STALE_MESSAGE });
          return;
        }
        setError(out.error);
        return;
      }
      onDone({
        ok: true,
        message: action === "approve" ? "충전을 승인했습니다. 포인트가 지급되었습니다." : action === "reject" ? "충전 신청을 반려했습니다." : "충전 신청을 보류했습니다.",
      });
    } finally {
      setBusy(null);
    }
  };

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <AdminActionButton variant="neutral" disabled={Boolean(busy)} onClick={onClose}>
        닫기
      </AdminActionButton>
      {r && open ? (
        <div className="flex flex-wrap gap-2">
          {r.requestStatus !== "on_hold" ? (
            <AdminActionButton variant="secondary" disabled={!canAct || Boolean(busy)} title={deniedTitle} onClick={() => void act("hold")}>
              {busy === "hold" ? "처리 중" : "보류"}
            </AdminActionButton>
          ) : null}
          <AdminActionButton variant="primary" disabled={!canAct || Boolean(busy)} title={deniedTitle} onClick={() => void act("approve")}>
            {busy === "approve" ? "처리 중" : "입금 확인 후 승인"}
          </AdminActionButton>
          <AdminActionButton variant="danger" disabled={!canAct || Boolean(busy)} title={deniedTitle} onClick={() => void act("reject")}>
            {busy === "reject" ? "처리 중" : "반려"}
          </AdminActionButton>
        </div>
      ) : null}
    </div>
  );

  return (
    <AdminFormSheet title="충전 신청 상세" onClose={busy ? () => undefined : onClose} dismissible={!busy} footer={footer}>
      {state.status === "loading" && !state.data ? (
        <AdminLoadingState ko />
      ) : state.status === "error" ? (
        <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      ) : r ? (
        <div className="space-y-3">
          {error ? <AdminResultBanner ko result={{ ok: false, code: error }} onClose={() => setError(null)} /> : null}
          <CommunitySummaryCard
            rows={[
              { label: "회원", value: r.userNickname || "이름 없음" },
              { label: "상태", value: <CommunityStatusBadge domain="charge_status" value={r.requestStatus} /> },
              { label: "요금제", value: r.planName || "—" },
              { label: "지급 포인트", value: formatCommunityPoints(r.pointAmount) },
              { label: "결제 금액", value: formatCommunityPeso(r.paymentAmount) },
              { label: "결제 수단", value: PAYMENT_METHOD[r.paymentMethod] ?? "기타" },
              { label: "입금자명", value: r.depositorName || "—" },
              { label: "신청", value: abs(r.requestedAt) },
              { label: "처리", value: abs(r.processedAt ?? r.approvedAt) },
              { label: "회원 메모", value: r.userMemo || "—" },
              { label: "관리자 메모", value: r.adminMemo || "—" },
            ]}
          />
          <div>
            <p className="mb-1 text-[13px] font-medium text-sam-fg">입금 증빙</p>
            {r.receiptImageUrl ? (
              <a href={r.receiptImageUrl} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- 회원이 올린 원본 증빙 (외부 저장소 URL) */}
                <img src={r.receiptImageUrl} alt="입금 증빙" className="max-h-80 rounded-ui-rect border border-sam-border object-contain" />
              </a>
            ) : (
              <p className="text-[13px] text-sam-muted">첨부된 증빙이 없습니다.</p>
            )}
          </div>
          <p className="text-[13px]">
            <Link
              href={`/admin/community/support?status=all&reference_type=POINT_CHARGE_REQUEST&reference_id=${encodeURIComponent(r.id)}`}
              className="text-sky-800 underline"
            >
              이 충전 건 관련 문의 보기
            </Link>
          </p>
          {!open ? <p className="text-[13px] text-sam-muted">이미 처리된 신청입니다. 정정은 포인트 회수로 처리합니다.</p> : null}
          <AdminTechDetails ko>
            <div>request: {r.id}</div>
            <div>user: {r.userId}</div>
            <div>plan: {r.planId} · rate v{r.rateVersion} · {r.appliedRate}</div>
          </AdminTechDetails>
        </div>
      ) : (
        <AdminEmptyState ko message="충전 신청을 찾을 수 없습니다." />
      )}
    </AdminFormSheet>
  );
}
