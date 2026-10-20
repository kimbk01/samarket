"use client";

/**
 * 포인트 내역·지급 (설계 §C-13) — 커뮤니티 관련 원장(보상·회수·홍보 차감/환급·관리자 지급/회수).
 * 「포인트 지급/회수」 = 공통 지급 패널(L3, 확인 화면을 열 때 멱등 키 1회 생성)을 시트로 연다.
 * URL: type · userId · period/from/to · page
 */
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
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
  CommunityTable,
  CommunityTimeCell,
  communityDetailHref,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import { AdminPointAdjustPanel } from "@/components/admin/points/AdminPointAdjustPanel";
import {
  formatCommunityPoints,
  useCommunityAdminAccess,
  useCommunityAdminJson,
} from "@/components/admin/community/members/use-community-admin-data";
import {
  COMMUNITY_POINT_TYPE_OPTIONS,
  communityPointTypeLabel,
} from "@/components/admin/community/points/community-point-labels";

const PAGE_SIZE = 50;

type LedgerRow = {
  id: string;
  createdAt: string;
  userId: string | null;
  userNickname: string | null;
  entryType: string | null;
  amount: number | null;
  balanceAfter: number | null;
  relatedType: string | null;
  relatedId: string | null;
  description: string | null;
  actorType: string | null;
  actorId: string | null;
  actorNickname: string | null;
};

type PointsResponse = {
  ok?: boolean;
  error?: string;
  total?: number;
  sums?: { count: number; amountIn: number; amountOut: number } | null;
  promoOrderIdCapped?: boolean;
  rows?: LedgerRow[];
};

function actorLabel(r: LedgerRow): string {
  if (r.actorNickname) return r.actorNickname;
  if (r.actorType === "admin" || r.actorId) return "관리자";
  if (r.actorType === "user") return "회원";
  return "시스템";
}

export function AdminCommunityPointsPage() {
  const q = useCommunityQueryState();
  const access = useCommunityAdminAccess();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const type = q.get("type");
  const userId = q.get("userId");
  const period = q.get("period");

  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (userId) params.set("userId", userId);
  params.set("period", period || "all");
  if (period === "custom") {
    if (q.get("from")) params.set("from", q.get("from"));
    if (q.get("to")) params.set("to", q.get("to"));
  }
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String((q.page - 1) * PAGE_SIZE));
  const customIncomplete = period === "custom" && (!q.get("from") || !q.get("to"));
  const { state, reload } = useCommunityAdminJson<PointsResponse>(
    customIncomplete ? null : `/api/admin/community/points?${params.toString()}`
  );
  const rows = state.status === "ok" ? state.data.rows ?? [] : [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const sums = state.status === "ok" ? state.data.sums ?? null : null;
  const memberName = userId ? rows.find((r) => r.userId === userId)?.userNickname : null;

  return (
    <CommunityListShell
      title="포인트 내역·지급"
      description="커뮤니티 보상·회수·홍보 차감과 환급, 관리자 지급·회수 내역을 확인합니다. 포인트는 전체 서비스 공통입니다."
      actions={
        <AdminActionButton
          variant="primary"
          disabled={!access.allowed("points")}
          title={access.deniedTitle("points")}
          onClick={() => setAdjustOpen(true)}
        >
          포인트 지급/회수
        </AdminActionButton>
      }
      banner={
        state.status === "ok" ? (
          <div className="space-y-1">
            <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px] text-sam-fg">
              {sums
                ? `조건 합계: ${formatAdminNumber(sums.count)}건 · 들어온 포인트 +${formatAdminNumber(sums.amountIn)} P · 나간 포인트 -${formatAdminNumber(Math.abs(sums.amountOut))} P`
                : "조건 합계: 확인 불가"}
            </p>
            {state.data.promoOrderIdCapped ? (
              <p className="text-[12px] text-sam-warning">오래된 홍보 주문 일부는 이 목록에 포함되지 않을 수 있습니다.</p>
            ) : null}
          </div>
        ) : null
      }
      filters={
        <>
          <CommunityFilterField label="유형">
            <CommunitySelect value={type} onChange={(v) => q.set({ type: v })} options={COMMUNITY_POINT_TYPE_OPTIONS} />
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
                <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => q.set({ userId: null })}>
                  회원 필터 해제
                </AdminActionButton>
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
        <AdminEmptyState ko message="조건에 맞는 포인트 내역이 없습니다." />
      ) : (
        <CommunityTable head={["시각", "회원", "유형", "포인트", "잔액", "내용", "처리자"]}>
          {rows.map((r) => {
            const amt = r.amount ?? 0;
            return (
              <tr key={r.id} className="border-b border-sam-border-soft">
                <td className={COMMUNITY_TD}>
                  <CommunityTimeCell iso={r.createdAt} />
                </td>
                <td className={COMMUNITY_TD}>
                  {r.userId ? (
                    <span className="flex flex-col">
                      <Link
                        href={communityDetailHref(`/admin/community/members/${encodeURIComponent(r.userId)}`, q.selfHref)}
                        className="font-medium text-sam-info hover:underline"
                      >
                        {r.userNickname?.trim() || "이름 없음"}
                      </Link>
                      {!userId ? (
                        <AdminActionButton
                          variant="ghost"
                          size="sm"
                          className="h-auto! justify-start! px-0! text-left"
                          onClick={() => q.set({ userId: r.userId })}
                        >
                          이 회원만 보기
                        </AdminActionButton>
                      ) : null}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={COMMUNITY_TD}>{communityPointTypeLabel(r.relatedType, r.entryType)}</td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap font-semibold ${amt < 0 ? "text-sam-danger" : "text-sam-success"}`}>
                  {amt > 0 ? "+" : ""}
                  {formatAdminNumber(amt)} P
                </td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatCommunityPoints(r.balanceAfter)}</td>
                <td className={`${COMMUNITY_TD} max-w-[22rem]`}>
                  {r.description || "—"}
                  <AdminTechDetails ko>
                    <div>ledger: {r.id}</div>
                    <div>
                      related: {r.relatedType ?? "—"} / {r.relatedId ?? "—"} · entry: {r.entryType ?? "—"}
                    </div>
                  </AdminTechDetails>
                </td>
                <td className={COMMUNITY_TD}>{actorLabel(r)}</td>
              </tr>
            );
          })}
        </CommunityTable>
      )}

      {adjustOpen ? (
        <AdminFormSheet
          title="포인트 지급/회수"
          subtitle="회원 지갑에 바로 반영됩니다. 확인 화면에서 지급 전후 잔액을 확인하세요."
          onClose={() => setAdjustOpen(false)}
        >
          <AdminPointAdjustPanel onChanged={reload} />
        </AdminFormSheet>
      ) : null}
    </CommunityListShell>
  );
}
