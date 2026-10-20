"use client";

/**
 * 거래 홍보 (설계 v2 §G-1) — 거래글 홍보(더 알리기) 주문의 승인·반려·일시 중지·재개·종료.
 * 종료: 책임 구분 선택 → 환급 미리보기(변경 없음) → 사유 → 2단계 확인.
 * URL: tab(탭 — 대시보드 딥링크) · userId · postId · from/to(PHT) · (호환) period · page · size(20/50/100)
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunityTable,
  CommunityTabs,
  useCommunityListQuery,
  useCommunityQueryState,
  type CommunitySheetResult,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import {
  COMMUNITY_GONE_MESSAGE,
  COMMUNITY_STALE_MESSAGE,
  useCommunityAdminJson,
  type CommunityBannerState,
} from "@/components/admin/community/members/use-community-admin-data";
import { AdminResultBanner, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import {
  TradeMemberCell,
  TradePostThumb,
  formatTradePoints,
  tradeDetailHref,
  tradeErrorText,
} from "@/components/admin/trade/kit/TradeAdminKit";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

const LIST_EXTRAS = ["userId", "postId"] as const;
const TABS = ["pending_review", "active", "paused", "ended", "rejected", "all"] as const;
const TAB_LABELS: Record<string, string> = {
  pending_review: "승인 대기",
  active: "노출 중",
  paused: "일시 중지",
  ended: "종료",
  rejected: "반려·취소",
  all: "전체",
};

const STATUS: Record<string, { label: string; tone: AdminTone }> = {
  pending_review: { label: "승인 대기", tone: "waiting" },
  active: { label: "노출 중", tone: "success" },
  paused: { label: "일시 중지", tone: "warning" },
  ended: { label: "종료", tone: "neutral" },
  expired: { label: "기간 만료", tone: "neutral" },
  rejected: { label: "반려", tone: "danger" },
  cancelled: { label: "취소", tone: "neutral" },
};

const FAULT_LABELS: Record<string, string> = { operator: "운영 사유", member: "회원 사유", none: "해당 없음" };

type Row = {
  id: string;
  user_id: string | null;
  user_label: string | null;
  target_id: string | null;
  target_title: string | null;
  post: { title?: string | null; thumbnail_url?: unknown; images?: unknown } | null;
  placement: string | null;
  duration_days: number | null;
  point_cost: number | null;
  order_status: string;
  overdue: boolean;
  start_at: string | null;
  end_at: string | null;
  created_at: string | null;
  ended_at: string | null;
  ended_by_label: string | null;
  fault: string | null;
  refund_points: number | null;
  review_reason: string | null;
};

type ListResponse = {
  ok?: boolean;
  error?: string;
  total?: number;
  tabCounts?: Record<string, number | null>;
  rows?: Row[];
};

type ActionKind = "approve" | "reject" | "pause" | "resume" | "end";
type Sheet = { kind: ActionKind; row: Row } | null;

const shortDate = (iso: string | null | undefined) => (iso ? formatAdminManilaDateTime(iso).slice(5, 16) : "—");
const titleOf = (r: Row) => r.post?.title || r.target_title || "거래글";

/** POST 실행 — sideEffectWarning·환급 포인트를 함께 돌려받는다 */
async function postAction(
  id: string,
  body: Record<string, unknown>
): Promise<{ result: CommunitySheetResult; json: Record<string, unknown> }> {
  try {
    const res = await fetch(`/api/admin/trade/promotions/${encodeURIComponent(id)}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && json.ok !== false) return { result: { ok: true }, json };
    return { result: { ok: false, status: res.status, code: String(json.error || `http_${res.status}`) }, json };
  } catch {
    return { result: { ok: false, status: 0, code: "network_error" }, json: {} };
  }
}

export function TradePromotionsPage() {
  /** `tab` 은 조회 조건 밖 키 — [초기화] 후에도 유지, 탭을 바꾸면 1쪽으로 */
  const q = useCommunityQueryState();
  const lq = useCommunityListQuery({ extras: LIST_EXTRAS });
  const tab = (TABS as readonly string[]).includes(q.get("tab")) ? q.get("tab") : "pending_review";
  const { userId, postId } = lq.query.extras;
  const [sheet, setSheet] = useState<Sheet>(null);
  const [banner, setBanner] = useState<CommunityBannerState>(null);
  const [warning, setWarning] = useState(false);

  const params = lq.apiParams();
  params.set("tab", tab);
  const { state, reload } = useCommunityAdminJson<ListResponse>(`/api/admin/trade/promotions?${params.toString()}`);
  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const counts = state.data?.tabCounts ?? {};
  const memberName = userId ? rows.find((r) => r.user_id === userId)?.user_label : null;
  const postName = postId ? rows.find((r) => r.target_id === postId) : null;

  const settle = (k: CommunitySheetSettle, okMessage: string, sideEffectWarning: boolean) => {
    setSheet(null);
    reload();
    setWarning(k === "done" && sideEffectWarning);
    setBanner({ ok: true, message: k === "done" ? okMessage : k === "stale" ? COMMUNITY_STALE_MESSAGE : COMMUNITY_GONE_MESSAGE });
  };

  return (
    <CommunityListShell
      title="거래 홍보"
      description="회원이 포인트로 신청한 거래글 홍보를 승인하고 노출을 관리합니다."
      banner={
        <div className="space-y-1">
          <AdminResultBanner ko result={banner} onClose={() => setBanner(null)} />
          {warning ? (
            <p className="text-[12px] text-sam-warning">처리는 완료되었지만 회원 알림을 보내지 못했습니다.</p>
          ) : null}
        </div>
      }
      tabs={
        <CommunityTabs
          value={tab}
          onChange={(v) => q.set({ tab: v === "pending_review" ? null : v })}
          tabs={TABS.map((t) => ({ value: t, label: TAB_LABELS[t], count: counts[t] ?? null }))}
        />
      }
      filterBar={
        <CommunityFilterBar lq={lq} showSearch={false} pending={state.status === "loading"}>
          {userId ? (
            <CommunityFilterField label="신청자">
              <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
                {memberName || "선택한 회원"}
                <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => lq.setExtra("userId", "")}>
                  해제
                </AdminActionButton>
              </span>
            </CommunityFilterField>
          ) : null}
          {postId ? (
            <CommunityFilterField label="게시물">
              <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
                {postName ? titleOf(postName) : "선택한 게시물"}
                <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => lq.setExtra("postId", "")}>
                  해제
                </AdminActionButton>
              </span>
            </CommunityFilterField>
          ) : null}
        </CommunityFilterBar>
      }
      footer={<CommunityListPagination lq={lq} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody state={state} empty={rows.length === 0} lq={lq} onRetry={reload} emptyMessage="이 상태의 홍보가 없습니다.">
        <CommunityTable head={["게시물", "신청자", "기간", "포인트", "상태", "환급", "처리"]}>
          {rows.map((r) => {
            const st = STATUS[r.order_status] ?? { label: "확인 필요", tone: "neutral" as AdminTone };
            return (
              <tr key={r.id} className="border-b border-sam-border-soft">
                <td className={`${COMMUNITY_TD} max-w-[22rem]`}>
                  <div className="flex items-start gap-2">
                    <TradePostThumb post={r.post ?? {}} size={40} />
                    <div className="min-w-0">
                      {r.target_id ? (
                        <Link
                          href={tradeDetailHref(`/admin/products/${encodeURIComponent(r.target_id)}`, lq.selfHref)}
                          className="font-medium text-sam-primary hover:underline [overflow-wrap:anywhere]"
                        >
                          {titleOf(r)}
                        </Link>
                      ) : (
                        titleOf(r)
                      )}
                      {!r.post && r.target_id ? (
                        <div className="text-[12px] text-sam-muted">게시물을 찾을 수 없습니다</div>
                      ) : null}
                      {r.target_id && !postId ? (
                        <AdminActionButton
                          variant="quiet"
                          size="sm"
                          className="!h-auto !px-0 text-left text-[12px] font-normal"
                          onClick={() => lq.setExtra("postId", r.target_id ?? "")}
                        >
                          이 게시물만 보기
                        </AdminActionButton>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className={COMMUNITY_TD}>
                  <TradeMemberCell userId={r.user_id} label={r.user_label} returnTo={lq.selfHref} />
                  {r.user_id && !userId ? (
                    <AdminActionButton
                      variant="quiet"
                      size="sm"
                      className="!h-auto !px-0 text-left text-[12px] font-normal"
                      onClick={() => lq.setExtra("userId", r.user_id ?? "")}
                    >
                      이 회원만 보기
                    </AdminActionButton>
                  ) : null}
                </td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap`}>
                  {r.duration_days ?? "—"}일
                  <div className="text-[12px] text-sam-muted">
                    {r.start_at ? `${shortDate(r.start_at)} ~ ${shortDate(r.end_at)}` : `신청 ${shortDate(r.created_at)}`}
                  </div>
                </td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatTradePoints(r.point_cost)}</td>
                <td className={COMMUNITY_TD}>
                  <span className="flex flex-wrap gap-1">
                    <AdminToneBadge tone={st.tone}>{st.label}</AdminToneBadge>
                    {r.overdue ? <AdminToneBadge tone="danger">종료일 지남</AdminToneBadge> : null}
                  </span>
                  {r.review_reason ? (
                    <div className="mt-1 max-w-[14rem] text-[12px] text-sam-muted [overflow-wrap:anywhere]">사유: {r.review_reason}</div>
                  ) : null}
                </td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap`}>
                  {typeof r.refund_points === "number" && r.refund_points > 0
                    ? formatTradePoints(r.refund_points)
                    : r.order_status === "ended" && r.fault
                      ? "없음"
                      : "—"}
                  {r.fault ? <div className="text-[12px] text-sam-muted">{FAULT_LABELS[r.fault] ?? r.fault}</div> : null}
                  {r.ended_by_label ? <div className="text-[12px] text-sam-muted">처리: {r.ended_by_label}</div> : null}
                </td>
                <td className={COMMUNITY_TD}>
                  <RowActions row={r} onPick={(kind) => setSheet({ kind, row: r })} />
                  <AdminTechDetails ko>
                    <div>order: {r.id}</div>
                    {r.placement ? <div>placement: {r.placement}</div> : null}
                  </AdminTechDetails>
                </td>
              </tr>
            );
          })}
        </CommunityTable>
      </CommunityListBody>

      {sheet && sheet.kind === "approve" ? (
        <ApproveSheet row={sheet.row} onClose={() => setSheet(null)} onSettled={settle} />
      ) : null}
      {sheet && (sheet.kind === "reject" || sheet.kind === "pause" || sheet.kind === "resume") ? (
        <ReasonActionSheet kind={sheet.kind} row={sheet.row} onClose={() => setSheet(null)} onSettled={settle} />
      ) : null}
      {sheet && sheet.kind === "end" ? <EndSheet row={sheet.row} onClose={() => setSheet(null)} onSettled={settle} /> : null}
    </CommunityListShell>
  );
}

/** 행 버튼 — ghost/sm 2개 이하 (각 조치는 확인 시트에서 2단계 확인) */
function RowActions({ row, onPick }: { row: Row; onPick: (k: ActionKind) => void }) {
  if (row.order_status === "pending_review") {
    return (
      <div className="flex flex-wrap gap-1">
        <AdminActionButton variant="ghost" size="sm" onClick={() => onPick("approve")}>
          승인
        </AdminActionButton>
        <AdminActionButton variant="ghost" size="sm" onClick={() => onPick("reject")}>
          반려
        </AdminActionButton>
      </div>
    );
  }
  if (row.order_status === "active" || row.order_status === "paused") {
    return (
      <div className="flex flex-wrap gap-1">
        {row.order_status === "active" ? (
          <AdminActionButton variant="ghost" size="sm" onClick={() => onPick("pause")}>
            일시 중지
          </AdminActionButton>
        ) : (
          <AdminActionButton variant="ghost" size="sm" onClick={() => onPick("resume")}>
            재개
          </AdminActionButton>
        )}
        <AdminActionButton variant="ghost" size="sm" onClick={() => onPick("end")}>
          종료
        </AdminActionButton>
      </div>
    );
  }
  return <span className="text-sam-muted">—</span>;
}

function orderRows(r: Row) {
  return [
    { label: "게시물", value: titleOf(r) },
    { label: "신청자", value: r.user_label || "—" },
    {
      label: "기간",
      value: r.start_at ? `${r.duration_days ?? "—"}일 · ${shortDate(r.start_at)} ~ ${shortDate(r.end_at)} PHT` : `${r.duration_days ?? "—"}일`,
    },
    { label: "포인트", value: formatTradePoints(r.point_cost) },
    { label: "상태", value: (STATUS[r.order_status] ?? { label: "확인 필요" }).label },
  ];
}

type SettleFn = (k: CommunitySheetSettle, okMessage: string, sideEffectWarning: boolean) => void;

/** 승인 — 사유 없이 2단계 확인 (확인 화면에서 내용 재확인) */
function ApproveSheet({ row, onClose, onSettled }: { row: Row; onClose: () => void; onSettled: SettleFn }) {
  const warn = useRef(false);
  return (
    <CommunityActionSheet
      title="홍보 승인"
      rows={orderRows(row)}
      notice="승인하면 바로 노출이 시작되고 보류한 포인트가 차감 확정됩니다. 회원에게 알림이 전달됩니다."
      reason={null}
      confirmLabel="승인"
      onSubmit={async () => {
        const { result, json } = await postAction(row.id, { action: "approve" });
        warn.current = json.sideEffectWarning === true;
        return result;
      }}
      onClose={onClose}
      onSettled={(k) => onSettled(k, "홍보를 승인했습니다.", warn.current)}
    />
  );
}

const REASON_ACTION: Record<"reject" | "pause" | "resume", { title: string; notice: string; ok: string; placeholder: string; destructive?: boolean }> = {
  reject: {
    title: "홍보 반려",
    notice: "반려하면 보류한 포인트가 회원에게 돌아갑니다. 회원에게 반려 사유가 알림으로 전달됩니다.",
    ok: "홍보를 반려했습니다.",
    placeholder: "반려 사유 (회원에게 전달됩니다)",
    destructive: true,
  },
  pause: {
    title: "홍보 일시 중지",
    notice: "노출이 멈춥니다. 다시 재개하면 종료일이 중지한 시간만큼 늘어납니다. 환급은 없습니다.",
    ok: "홍보를 일시 중지했습니다.",
    placeholder: "중지 사유",
  },
  resume: {
    title: "홍보 재개",
    notice: "노출을 다시 시작합니다. 종료일은 중지했던 시간만큼 늘어납니다.",
    ok: "홍보를 재개했습니다.",
    placeholder: "재개 사유",
  },
};

function ReasonActionSheet({
  kind,
  row,
  onClose,
  onSettled,
}: {
  kind: "reject" | "pause" | "resume";
  row: Row;
  onClose: () => void;
  onSettled: SettleFn;
}) {
  const cfg = REASON_ACTION[kind];
  const warn = useRef(false);
  return (
    <CommunityActionSheet
      title={cfg.title}
      rows={orderRows(row)}
      notice={cfg.notice}
      reason={{ minLength: 2, placeholder: cfg.placeholder }}
      destructive={cfg.destructive}
      confirmLabel={cfg.title.replace("홍보 ", "")}
      onSubmit={async (reason) => {
        const { result, json } = await postAction(row.id, { action: kind, reason });
        warn.current = json.sideEffectWarning === true;
        return result;
      }}
      onClose={onClose}
      onSettled={(k) => onSettled(k, cfg.ok, warn.current)}
    />
  );
}

type Preview = { refund: number; paid: number | null; remainingSeconds: number | null };

/** 종료 — 책임 구분을 고르면 미리보기(변경 없음)로 환급 예정 포인트를 먼저 보여 준다 */
function EndSheet({ row, onClose, onSettled }: { row: Row; onClose: () => void; onSettled: SettleFn }) {
  const [fault, setFault] = useState<"operator" | "member" | "none" | null>(null);
  const [preview, setPreview] = useState<{ fault: string; data: Preview } | { fault: string; error: string } | null>(null);
  const done = useRef({ refund: 0, warn: false });

  useEffect(() => {
    if (!fault) return;
    let alive = true;
    void (async () => {
      const { result, json } = await postAction(row.id, { action: "end", fault, preview: true });
      if (!alive) return;
      if (!result.ok) {
        setPreview({ fault, error: result.code });
        return;
      }
      setPreview({
        fault,
        data: {
          refund: Number(json.refund_points ?? 0) || 0,
          paid: typeof json.paid_points === "number" ? json.paid_points : null,
          remainingSeconds: typeof json.remaining_seconds === "number" ? json.remaining_seconds : null,
        },
      });
    })();
    return () => {
      alive = false;
    };
  }, [fault, row.id]);

  const current = preview && preview.fault === fault ? preview : null;
  const ready = Boolean(current && "data" in current);
  const remainDays =
    current && "data" in current && current.data.remainingSeconds !== null
      ? Math.max(0, Math.ceil(current.data.remainingSeconds / 86_400))
      : null;

  return (
    <CommunityActionSheet
      title="홍보 종료"
      rows={[
        ...orderRows(row),
        ...(current && "data" in current
          ? [{ label: "환급 예정", value: <strong>{formatTradePoints(current.data.refund)}</strong> }]
          : []),
      ]}
      notice="종료하면 다시 노출할 수 없습니다. 회원에게 종료 사유와 환급 포인트가 알림으로 전달됩니다."
      reason={{ minLength: 2, placeholder: "종료 사유 (회원에게 전달됩니다)" }}
      ready={ready}
      destructive
      confirmLabel="종료"
      onSubmit={async (reason) => {
        const { result, json } = await postAction(row.id, { action: "end", fault, reason });
        done.current = { refund: Number(json.refund_points ?? 0) || 0, warn: json.sideEffectWarning === true };
        return result;
      }}
      onClose={onClose}
      onSettled={(k) =>
        onSettled(
          k,
          done.current.refund > 0
            ? `홍보를 종료했습니다. ${formatAdminNumber(done.current.refund)} P 를 환급했습니다.`
            : "홍보를 종료했습니다. 환급은 없습니다.",
          done.current.warn
        )
      }
    >
      <fieldset className="space-y-2">
        <legend className="sam-text-helper font-medium text-sam-fg">책임 구분 (필수)</legend>
        {(
          [
            ["operator", "운영 사유", "남은 기간 비례 환급"],
            ["member", "회원 사유", "환급하지 않습니다"],
            ["none", "해당 없음", "환급하지 않습니다"],
          ] as const
        ).map(([v, label, hint]) => (
          <label key={v} className="flex items-start gap-2 text-[13px]">
            <input type="radio" name="fault" checked={fault === v} onChange={() => setFault(v)} className="mt-0.5" />
            <span>
              <span className="font-medium text-sam-fg">{label}</span>
              <span className="block text-sam-muted">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {fault && !current ? <p className="text-[13px] text-sam-muted">환급 예정 포인트를 계산하는 중…</p> : null}
      {current && "data" in current ? (
        <p className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[13px] font-semibold text-sam-fg">
          환급 예정 {formatTradePoints(current.data.refund)}
          {current.data.paid !== null || remainDays !== null ? (
            <span className="block font-normal text-sam-muted">
              {current.data.paid !== null ? `결제 ${formatTradePoints(current.data.paid)}` : ""}
              {current.data.paid !== null && remainDays !== null ? " · " : ""}
              {remainDays !== null ? `남은 기간 약 ${remainDays}일` : ""}
            </span>
          ) : null}
        </p>
      ) : null}
      {current && "error" in current ? (
        <p role="alert" className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 text-[13px] text-sam-fg">
          {tradeErrorText(current.error)}
        </p>
      ) : null}
    </CommunityActionSheet>
  );
}
