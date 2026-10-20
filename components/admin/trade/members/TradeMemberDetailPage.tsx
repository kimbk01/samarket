"use client";

/**
 * 판매자·구매자 상세 `/admin/trade/members/[userId]` (설계 v2 §C-6).
 * ① 요약(이름·계정 상태·거래 수치) ② 탭: 판매글 · 구매 채팅 · 신고 받은 내역 · 거래 제한 · 홍보 주문 · 포인트 원장 · 계정 조치.
 * 모든 조회·조치는 거래 Admin 경로(/api/admin/trade/...)만 쓴다. 연락처는 표시하지 않는다.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityPagination,
  CommunityStatusBadge,
  CommunitySummaryCard,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  CommunityTimeline,
  useCommunityQueryState,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge, AdminUnavailableChip } from "@/components/admin/ui/AdminToneBadge";
import { useCommunityAdminJson, type CommunityAdminLoad } from "@/components/admin/community/members/use-community-admin-data";
import {
  COMMUNITY_STALE_TEXT,
  CommunityBannerView,
  communityActionFetch,
  type CommunityBanner,
} from "@/components/admin/community/reports/community-report-admin-shared";
import {
  TradeStageBadge,
  formatTradePoints,
  formatTradePrice,
  tradeDetailHref,
  tradeErrorText,
} from "@/components/admin/trade/kit/TradeAdminKit";
import {
  TRADE_RESTRICTION_SCOPE_LABEL,
  TradeAddRestrictionSheet,
  TradeRevokeRestrictionSheet,
  TradeSanctionStateBadge,
  tradeSanctionKindLabel,
  tradeSanctionPeriodText,
  type TradeRestrictionRow,
} from "@/components/admin/trade/restrictions/TradeRestrictionsPage";
import {
  TradeReportStatusBadge,
  tradeReportReasonLabel,
  tradeReportTargetLabel,
} from "@/components/admin/trade/reports/TradeReportsPage";
import { tradeAccountStatusKey } from "@/components/admin/trade/members/TradeMembersPage";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { readAdminReturnToFromSearch } from "@/lib/admin/admin-operation-return-context";

type Rec = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const LIST_PAGE_SIZE = 20;
const SIDE_LIMIT = 50;
const REASON_MIN = 2;

const TABS = [
  { value: "listings", label: "판매글" },
  { value: "buyer", label: "구매 채팅" },
  { value: "reports", label: "신고 받은 내역" },
  { value: "restrictions", label: "거래 제한" },
  { value: "promotions", label: "홍보 주문" },
  { value: "points", label: "포인트 원장" },
  { value: "account", label: "계정 조치" },
];

type Metric = { ok: true; value: number } | { ok: false; error?: string };
type TradeTabResponse = {
  ok?: boolean;
  error?: string;
  summary?: Partial<Record<"listings" | "selling" | "reserved" | "completed" | "buyerChats" | "tradeChats", Metric>>;
  page?: number;
  pageSize?: number;
  total?: Metric;
  listings?: Array<{
    id: string;
    title: string;
    status: string;
    listingState: string;
    price: number | null;
    createdAt: string;
    updatedAt: string | null;
  }>;
  buyer?: Array<{ id: string; postId: string; postTitle: string; tradeFlowStatus: string; roomId: string | null; sellerId: string }>;
};
type RowsResponse = { ok?: boolean; error?: string; total?: number; rows?: Rec[] };
type ModerationResponse = { ok?: boolean; error?: string; events?: Rec[] };

const MOD_ACTION_LABEL: Record<string, string> = {
  warn: "계정 경고",
  suspend: "계정 정지",
  ban: "이용 차단",
  restore: "정지·차단 해제",
};

const FLOW_LABEL: Record<string, string> = {
  chatting: "대화 중",
  inquiry: "문의",
  negotiating: "거래 중",
  reserved: "예약",
  completed: "거래 완료",
  sold: "거래 완료",
  cancelled: "취소",
  canceled: "취소",
};

const POINT_RELATED: Record<string, string> = {
  promotion_order: "거래글 홍보",
  trade_post_ad: "거래 광고 (이전 방식)",
  admin_manual: "관리자",
};
const POINT_ENTRY: Record<string, string> = {
  spend: "차감",
  refund: "환급",
  hold: "보류",
  capture: "확정",
  release: "보류 해제",
  admin_credit: "지급",
  admin_debit: "회수",
  admin_adjust: "조정",
  charge: "충전",
  reward: "지급",
  reverse: "회수",
  expire: "소멸",
};
function pointTypeLabel(relatedType: string, entryType: string): string {
  const r = POINT_RELATED[relatedType] ?? "기타";
  const e = POINT_ENTRY[entryType];
  return e ? `${r} ${e}` : r;
}

function metricText(m: Metric | undefined): ReactNode {
  if (!m || !m.ok) return <AdminUnavailableChip ko />;
  return m.value.toLocaleString();
}

function rowsOf(st: CommunityAdminLoad<RowsResponse>): Rec[] | null {
  return st.status === "ok" ? st.data.rows ?? [] : null;
}

type Sheet =
  | { kind: "add" }
  | { kind: "revoke"; row: Rec }
  | { kind: "account"; action: "warn" | "suspend" | "ban" | "restore" }
  | null;

export function TradeMemberDetailPage({ userId }: { userId: string }) {
  const qs = useCommunityQueryState();
  const sp = useSearchParams();
  const backHref = readAdminReturnToFromSearch(sp) ?? "/admin/trade/members";
  const tab = TABS.some((t) => t.value === qs.get("tab")) ? qs.get("tab") : "listings";
  const listPage = Math.max(1, Number(qs.get("lp") || 1) || 1);
  const uid = encodeURIComponent(userId);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [banner, setBanner] = useState<CommunityBanner>(null);

  const tradeSection = tab === "buyer" ? "buyer" : "listings";
  const trade = useCommunityAdminJson<TradeTabResponse>(
    `/api/admin/trade/members/${uid}/trade?section=${tradeSection}&page=${tab === "listings" || tab === "buyer" ? listPage : 1}&pageSize=${LIST_PAGE_SIZE}`
  );
  const moderation = useCommunityAdminJson<ModerationResponse>(`/api/admin/trade/members/${uid}/moderation`);
  const restrictions = useCommunityAdminJson<RowsResponse>(
    `/api/admin/trade/restrictions?userId=${uid}&status=all&limit=${SIDE_LIMIT}`
  );
  // 신고 받은 내역 = 회원 본인 신고 + 이 회원 거래글 신고
  const reports = useCommunityAdminJson<RowsResponse>(`/api/admin/trade/reports?sellerId=${uid}&tab=all&limit=${SIDE_LIMIT}`);
  // 머리말 — 이름·계정 상태 (공용 회원 정보)
  const member = useCommunityAdminJson<RowsResponse>(`/api/admin/trade/members?userId=${uid}&limit=1`);
  const memberRow = rowsOf(member.state)?.[0] ?? null;
  const promotions = useCommunityAdminJson<RowsResponse>(
    `/api/admin/trade/promotions?userId=${uid}&tab=all&limit=${SIDE_LIMIT}`
  );
  const points = useCommunityAdminJson<RowsResponse>(`/api/admin/trade/points?userId=${uid}&period=all&limit=${SIDE_LIMIT}`);

  const restrictionRows = rowsOf(restrictions.state);
  const reportRows = rowsOf(reports.state);
  const promotionRows = rowsOf(promotions.state);
  const pointRows = rowsOf(points.state);
  const events = moderation.state.status === "ok" ? moderation.state.data.events ?? [] : null;

  // 이름 — 거래 화면 응답에 실린 회원 표시명 중 먼저 찾은 것
  const label =
    s(memberRow?.label).trim() ||
    (restrictionRows ?? []).map((r) => s(r.user_label).trim()).find(Boolean) ||
    (promotionRows ?? []).map((r) => s(r.user_label).trim()).find(Boolean) ||
    (pointRows ?? []).map((r) => s(r.userNickname).trim()).find(Boolean) ||
    (reportRows ?? [])
      .filter((r) => s(r.target_user_id) === userId)
      .map((r) => s(r.target_user_label).trim())
      .find(Boolean) ||
    "회원";

  // 계정 상태 — 공용 회원 정보(profiles.status) 우선, 없으면 최근 계정 조치 결과
  const lastStatus = memberRow
    ? s(memberRow.account_status)
    : events
      ? s(events.find((e) => s(e.to_status))?.to_status)
      : null;
  const accountKey = lastStatus === null ? null : tradeAccountStatusKey(lastStatus);
  const activeRestrictions = (restrictionRows ?? []).filter(
    (r) => s(r.status) === "active" && s(r.sanction_type) === "trade_restriction"
  );

  const reloadAll = () => {
    trade.reload();
    moderation.reload();
    member.reload();
    restrictions.reload();
    reports.reload();
    promotions.reload();
    points.reload();
  };
  const afterSheet = (b: CommunityBanner) => {
    setSheet(null);
    setBanner(b);
    reloadAll();
  };

  const sum = trade.state.data?.summary ?? {};

  return (
    <div data-trade-member-detail="1" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={backHref} className="text-[13px] font-medium text-sam-muted underline">
          ← 목록으로
        </Link>
        <Link href={`/admin/users/${uid}`} className="text-[12px] text-sam-muted underline">
          회원 전체 정보
        </Link>
      </div>

      <header className="flex flex-wrap items-center gap-2">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">{label}</h1>
        {accountKey ? <CommunityStatusBadge domain="account_status" value={accountKey} /> : null}
        {activeRestrictions.map((r) => (
          <AdminToneBadge key={s(r.id)} tone="danger">
            {TRADE_RESTRICTION_SCOPE_LABEL[s(r.restriction)] ?? "거래"} 제한
          </AdminToneBadge>
        ))}
      </header>

      <CommunityBannerView banner={banner} onClose={() => setBanner(null)} />

      <CommunitySummaryCard
        rows={[
          { label: "계정 상태", value: accountKey ? <CommunityStatusBadge domain="account_status" value={accountKey} /> : <AdminUnavailableChip ko /> },
          {
            label: "거래 제한",
            value:
              restrictionRows === null ? (
                <AdminUnavailableChip ko />
              ) : activeRestrictions.length === 0 ? (
                "없음"
              ) : (
                activeRestrictions
                  .map((r) => `${TRADE_RESTRICTION_SCOPE_LABEL[s(r.restriction)] ?? "거래"} · ${r.end_at ? `~${formatAdminManilaDateTime(s(r.end_at)).slice(0, 10)}` : "영구"}`)
                  .join(", ")
              ),
          },
          { label: "판매글", value: metricText(sum.listings) },
          {
            label: "판매 상태",
            value: (
              <span>
                판매중 {metricText(sum.selling)} · 예약 {metricText(sum.reserved)} · 완료 {metricText(sum.completed)}
              </span>
            ),
          },
          { label: "구매 채팅", value: metricText(sum.buyerChats) },
          {
            label: "받은 신고",
            value:
              reportRows === null
                ? <AdminUnavailableChip ko />
                : `${Number(reports.state.data?.total ?? reportRows.length).toLocaleString()}건 (대기 ${reportRows
                    .filter((r) => s(r.status) === "pending" || s(r.status) === "reviewing")
                    .length.toLocaleString()})`,
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        <AdminActionButton variant="danger" onClick={() => setSheet({ kind: "add" })}>
          거래 활동 제한
        </AdminActionButton>
        {activeRestrictions.map((r) => (
          <AdminActionButton key={s(r.id)} variant="neutral" onClick={() => setSheet({ kind: "revoke", row: r })}>
            제한 해제 ({TRADE_RESTRICTION_SCOPE_LABEL[s(r.restriction)] ?? "거래"})
          </AdminActionButton>
        ))}
        <span className="ml-auto" />
        <AdminActionButton variant="secondary" onClick={() => qs.set({ tab: "account", lp: null })}>
          계정 조치
        </AdminActionButton>
      </div>

      <CommunityTabs tabs={TABS} value={tab} onChange={(v) => qs.set({ tab: v === "listings" ? null : v, lp: null })} />
      <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
        {tab === "listings" || tab === "buyer" ? (
          <TradeSection
            tab={tab}
            st={trade.state}
            reload={trade.reload}
            userId={userId}
            selfHref={qs.selfHref}
            page={listPage}
            onPage={(p) => qs.set({ lp: p > 1 ? p : null }, { keepPage: true })}
          />
        ) : tab === "reports" ? (
          <ReportsSection st={reports.state} reload={reports.reload} userId={userId} selfHref={qs.selfHref} />
        ) : tab === "restrictions" ? (
          <RestrictionsSection
            st={restrictions.state}
            reload={restrictions.reload}
            userId={userId}
            selfHref={qs.selfHref}
            onAdd={() => setSheet({ kind: "add" })}
            onRevoke={(row) => setSheet({ kind: "revoke", row })}
          />
        ) : tab === "promotions" ? (
          <PromotionsSection st={promotions.state} reload={promotions.reload} userId={userId} selfHref={qs.selfHref} />
        ) : tab === "points" ? (
          <PointsSection st={points.state} reload={points.reload} userId={userId} />
        ) : (
          <AccountSection
            st={moderation.state}
            reload={moderation.reload}
            accountKey={accountKey}
            onAction={(action) => setSheet({ kind: "account", action })}
          />
        )}
      </div>

      <AdminTechDetails ko>
        <div>회원 ID: {userId}</div>
      </AdminTechDetails>

      {sheet?.kind === "add" ? (
        <TradeAddRestrictionSheet
          initialMember={{ id: userId, label }}
          lockMember
          onClose={() => setSheet(null)}
          onSettled={afterSheet}
        />
      ) : null}
      {sheet?.kind === "revoke" ? (
        <TradeRevokeRestrictionSheet row={sheet.row} onClose={() => setSheet(null)} onSettled={afterSheet} />
      ) : null}
      {sheet?.kind === "account" ? (
        <AccountActionSheet
          userId={userId}
          label={label}
          accountKey={accountKey}
          action={sheet.action}
          onClose={() => setSheet(null)}
          onSettled={afterSheet}
        />
      ) : null}
    </div>
  );
}

/* ───────── 탭 내용 ───────── */

function Empty({ text }: { text: string }) {
  return (
    <div className="p-4">
      <AdminEmptyState ko message={text} />
    </div>
  );
}

function LoadGate<T>({
  st,
  reload,
  children,
}: {
  st: CommunityAdminLoad<T>;
  reload: () => void;
  children: (data: T) => ReactNode;
}) {
  if (st.status === "loading" && !st.data) return <AdminLoadingState ko />;
  if (st.status === "error") return <AdminErrorState ko code={st.code} httpStatus={st.httpStatus} onRetry={reload} />;
  return <>{children(st.data as T)}</>;
}

function FooterLinks({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-3 border-t border-sam-border-soft px-3 py-2 text-[13px]">{children}</div>;
}

function TradeSection({
  tab,
  st,
  reload,
  userId,
  selfHref,
  page,
  onPage,
}: {
  tab: "listings" | "buyer";
  st: CommunityAdminLoad<TradeTabResponse>;
  reload: () => void;
  userId: string;
  selfHref: string;
  page: number;
  onPage: (p: number) => void;
}) {
  const uid = encodeURIComponent(userId);
  // 탭 전환 직후 이전 구역 응답이 남아 있으면 로딩으로 본다
  const stale = st.data && (st.data as TradeTabResponse & { section?: string }).section !== tab;
  if (stale && st.status === "loading") return <AdminLoadingState ko />;
  return (
    <LoadGate st={st} reload={reload}>
      {(d: TradeTabResponse) => {
        const total = d.total && d.total.ok ? d.total.value : null;
        const pager =
          total !== null && total > LIST_PAGE_SIZE ? (
            <div className="border-t border-sam-border-soft p-2">
              <CommunityPagination page={page} pageSize={LIST_PAGE_SIZE} total={total} onPage={onPage} />
            </div>
          ) : null;
        if (d.total && !d.total.ok) {
          return <AdminErrorState ko code="load_failed" httpStatus={500} onRetry={reload} />;
        }
        if (tab === "listings") {
          const list = d.listings ?? [];
          return (
            <>
              {list.length === 0 ? (
                <Empty text="올린 거래글이 없습니다." />
              ) : (
                <CommunityTable head={["제목", "가격", "판매 상태", "등록", "수정"]}>
                  {list.map((r) => (
                    <tr key={r.id} className="border-b border-sam-border-soft">
                      <td className={COMMUNITY_TD}>
                        <Link
                          href={tradeDetailHref(`/admin/products/${encodeURIComponent(r.id)}`, selfHref)}
                          className="font-medium text-sky-800 hover:underline"
                        >
                          {r.title || "제목 없음"}
                        </Link>
                      </td>
                      <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatTradePrice(r.price)}</td>
                      <td className={COMMUNITY_TD}>
                        <TradeStageBadge value={r.listingState} />
                      </td>
                      <td className={COMMUNITY_TD}>
                        <CommunityTimeCell iso={r.createdAt || null} />
                      </td>
                      <td className={COMMUNITY_TD}>
                        <CommunityTimeCell iso={r.updatedAt} />
                      </td>
                    </tr>
                  ))}
                </CommunityTable>
              )}
              {pager}
              <FooterLinks>
                <Link href={tradeDetailHref(`/admin/posts-management?sellerId=${uid}`, selfHref)} className="text-sky-800 underline">
                  거래글 관리에서 이 회원 글 보기
                </Link>
              </FooterLinks>
            </>
          );
        }
        const list = d.buyer ?? [];
        return (
          <>
            {list.length === 0 ? (
              <Empty text="구매 문의 채팅이 없습니다." />
            ) : (
              <CommunityTable head={["거래글", "진행 상태"]}>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-sam-border-soft">
                    <td className={COMMUNITY_TD}>
                      {r.postId ? (
                        <Link
                          href={tradeDetailHref(`/admin/products/${encodeURIComponent(r.postId)}`, selfHref)}
                          className="font-medium text-sky-800 hover:underline"
                        >
                          {r.postTitle || "제목 없음"}
                        </Link>
                      ) : (
                        <span className="text-sam-muted">삭제된 거래글</span>
                      )}
                    </td>
                    <td className={COMMUNITY_TD}>{FLOW_LABEL[r.tradeFlowStatus] ?? (r.tradeFlowStatus ? "기타" : "—")}</td>
                  </tr>
                ))}
              </CommunityTable>
            )}
            {pager}
            <FooterLinks>
              <Link href={tradeDetailHref(`/admin/chats?type=trade&buyerId=${uid}`, selfHref)} className="text-sky-800 underline">
                거래 채팅 관리에서 보기
              </Link>
            </FooterLinks>
          </>
        );
      }}
    </LoadGate>
  );
}

function ReportsSection({
  st,
  reload,
  userId,
  selfHref,
}: {
  st: CommunityAdminLoad<RowsResponse>;
  reload: () => void;
  userId: string;
  selfHref: string;
}) {
  return (
    <LoadGate st={st} reload={reload}>
      {(d: RowsResponse) => {
        const list = d.rows ?? [];
        return (
          <>
            {list.length === 0 ? (
              <Empty text="받은 신고가 없습니다." />
            ) : (
              <CommunityTable head={["접수", "대상", "신고 사유", "신고자", "상태"]}>
                {list.map((r) => (
                  <tr key={s(r.id)} className="border-b border-sam-border-soft">
                    <td className={COMMUNITY_TD}>
                      <CommunityTimeCell iso={s(r.created_at) || null} />
                    </td>
                    <td className={COMMUNITY_TD}>
                      {(r.post as Rec | null)?.title ? s((r.post as Rec).title) : tradeReportTargetLabel(s(r.target_type))}
                    </td>
                    <td className={COMMUNITY_TD}>
                      <Link
                        href={tradeDetailHref(`/admin/trade/reports?tab=all&reportId=${encodeURIComponent(s(r.id))}`, selfHref)}
                        className="font-medium text-sky-800 hover:underline"
                      >
                        {tradeReportReasonLabel(s(r.reason_code))}
                      </Link>
                      {s(r.reason_text) ? <p className="line-clamp-1 sam-text-xxs text-sam-muted">{s(r.reason_text)}</p> : null}
                    </td>
                    <td className={COMMUNITY_TD}>{s(r.reporter_label) || "회원"}</td>
                    <td className={COMMUNITY_TD}>
                      <TradeReportStatusBadge value={s(r.status)} />
                    </td>
                  </tr>
                ))}
              </CommunityTable>
            )}
            <FooterLinks>
              <Link
                href={tradeDetailHref(`/admin/trade/reports?tab=all&sellerId=${encodeURIComponent(userId)}`, selfHref)}
                className="text-sky-800 underline"
              >
                거래 신고에서 모두 보기
              </Link>
            </FooterLinks>
          </>
        );
      }}
    </LoadGate>
  );
}

function RestrictionsSection({
  st,
  reload,
  userId,
  selfHref,
  onAdd,
  onRevoke,
}: {
  st: CommunityAdminLoad<RowsResponse>;
  reload: () => void;
  userId: string;
  selfHref: string;
  onAdd: () => void;
  onRevoke: (row: Rec) => void;
}) {
  return (
    <LoadGate st={st} reload={reload}>
      {(d: RowsResponse) => {
        const list = (d.rows ?? []) as unknown as TradeRestrictionRow[];
        return (
          <>
            <div className="flex justify-end border-b border-sam-border-soft p-2">
              <AdminActionButton variant="primary" onClick={onAdd}>
                제한 추가
              </AdminActionButton>
            </div>
            {list.length === 0 ? (
              <Empty text="경고·거래 활동 제한 기록이 없습니다." />
            ) : (
              <CommunityTable head={["종류", "범위", "기간", "사유", "처리자", "상태", "처리"]}>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-sam-border-soft">
                    <td className={COMMUNITY_TD}>{tradeSanctionKindLabel(r.sanction_type)}</td>
                    <td className={COMMUNITY_TD}>
                      {r.sanction_type === "warning" ? "—" : TRADE_RESTRICTION_SCOPE_LABEL[s(r.restriction)] ?? "범위 확인 불가"}
                    </td>
                    <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{tradeSanctionPeriodText(r)}</td>
                    <td className={COMMUNITY_TD}>
                      <p className="line-clamp-3 max-w-[16rem] whitespace-pre-wrap">{r.reason || "—"}</p>
                      {r.revoked_at ? (
                        <p className="mt-1 max-w-[16rem] sam-text-xxs text-sam-muted">해제: {r.revoke_reason || "—"}</p>
                      ) : null}
                    </td>
                    <td className={COMMUNITY_TD}>
                      <span className="flex flex-col">
                        <span>{r.created_by_label ?? "관리자"}</span>
                        <span className="sam-text-xxs text-sam-muted">
                          <CommunityTimeCell iso={r.created_at} />
                        </span>
                      </span>
                    </td>
                    <td className={COMMUNITY_TD}>
                      <TradeSanctionStateBadge row={r} />
                    </td>
                    <td className={COMMUNITY_TD}>
                      {r.status === "active" ? (
                        <AdminActionButton variant="ghost" size="sm" onClick={() => onRevoke(r as unknown as Rec)}>
                          해제
                        </AdminActionButton>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </CommunityTable>
            )}
            <FooterLinks>
              <Link
                href={tradeDetailHref(`/admin/trade/restrictions?tab=all&userId=${encodeURIComponent(userId)}`, selfHref)}
                className="text-sky-800 underline"
              >
                거래 활동 제한에서 보기
              </Link>
            </FooterLinks>
          </>
        );
      }}
    </LoadGate>
  );
}

function PromotionsSection({
  st,
  reload,
  userId,
  selfHref,
}: {
  st: CommunityAdminLoad<RowsResponse>;
  reload: () => void;
  userId: string;
  selfHref: string;
}) {
  return (
    <LoadGate st={st} reload={reload}>
      {(d: RowsResponse) => {
        const list = d.rows ?? [];
        return (
          <>
            {list.length === 0 ? (
              <Empty text="거래글 홍보 주문이 없습니다." />
            ) : (
              <CommunityTable head={["거래글", "기간", "결제 포인트", "환급", "상태"]}>
                {list.map((r) => (
                  <tr key={s(r.id)} className="border-b border-sam-border-soft">
                    <td className={COMMUNITY_TD}>
                      {s(r.target_id) ? (
                        <Link
                          href={tradeDetailHref(`/admin/products/${encodeURIComponent(s(r.target_id))}`, selfHref)}
                          className="font-medium text-sky-800 hover:underline"
                        >
                          {s(r.target_title) || "거래글"}
                        </Link>
                      ) : (
                        s(r.target_title) || "—"
                      )}
                    </td>
                    <td className={`${COMMUNITY_TD} whitespace-nowrap`}>
                      {r.start_at ? formatAdminManilaDateTime(s(r.start_at)).slice(0, 10) : "—"} ~{" "}
                      {r.end_at ? formatAdminManilaDateTime(s(r.end_at)).slice(0, 10) : "—"}
                    </td>
                    <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatTradePoints(r.point_cost)}</td>
                    <td className={`${COMMUNITY_TD} whitespace-nowrap`}>
                      {n(r.refund_points) ? formatTradePoints(r.refund_points) : "—"}
                    </td>
                    <td className={COMMUNITY_TD}>
                      <CommunityStatusBadge domain="promotion_status" value={s(r.order_status)} />
                    </td>
                  </tr>
                ))}
              </CommunityTable>
            )}
            <FooterLinks>
              <Link
                href={tradeDetailHref(`/admin/trade/promotions?tab=all&userId=${encodeURIComponent(userId)}`, selfHref)}
                className="text-sky-800 underline"
              >
                홍보 주문에서 모두 보기
              </Link>
            </FooterLinks>
          </>
        );
      }}
    </LoadGate>
  );
}

function PointsSection({ st, reload, userId }: { st: CommunityAdminLoad<RowsResponse>; reload: () => void; userId: string }) {
  return (
    <LoadGate st={st} reload={reload}>
      {(d: RowsResponse) => {
        const list = d.rows ?? [];
        return (
          <>
            {list.length === 0 ? (
              <Empty text="거래 관련 포인트 내역이 없습니다." />
            ) : (
              <CommunityTable head={["시각", "유형", "포인트", "잔액", "내용"]}>
                {list.map((r) => {
                  const amt = n(r.amount) ?? 0;
                  return (
                    <tr key={s(r.id)} className="border-b border-sam-border-soft">
                      <td className={COMMUNITY_TD}>
                        <CommunityTimeCell iso={s(r.createdAt) || null} />
                      </td>
                      <td className={COMMUNITY_TD}>{pointTypeLabel(s(r.relatedType), s(r.entryType))}</td>
                      <td className={`${COMMUNITY_TD} whitespace-nowrap ${amt < 0 ? "text-red-700" : "text-emerald-800"}`}>
                        {amt > 0 ? "+" : ""}
                        {amt.toLocaleString()} P
                      </td>
                      <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatTradePoints(r.balanceAfter)}</td>
                      <td className={COMMUNITY_TD}>{s(r.description) || "—"}</td>
                    </tr>
                  );
                })}
              </CommunityTable>
            )}
            <FooterLinks>
              <Link
                href={`/admin/trade/points?userId=${encodeURIComponent(userId)}&period=all`}
                className="text-sky-800 underline"
              >
                포인트 원장에서 모두 보기
              </Link>
            </FooterLinks>
          </>
        );
      }}
    </LoadGate>
  );
}

function AccountSection({
  st,
  reload,
  accountKey,
  onAction,
}: {
  st: CommunityAdminLoad<ModerationResponse>;
  reload: () => void;
  accountKey: string | null;
  onAction: (a: "warn" | "suspend" | "ban" | "restore") => void;
}) {
  const k = accountKey ?? "active";
  const withdrawn = k === "withdrawn";
  return (
    <div className="space-y-3 p-3" id="account">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-sam-muted">현재 계정 상태</span>
        {accountKey ? <CommunityStatusBadge domain="account_status" value={accountKey} /> : <AdminUnavailableChip ko />}
      </div>
      {withdrawn ? (
        <p className="text-[13px] text-sam-muted">탈퇴한 회원은 계정 조치를 할 수 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <AdminActionButton variant="secondary" disabled={!accountKey} onClick={() => onAction("warn")}>
            계정 경고
          </AdminActionButton>
          {k === "active" ? (
            <AdminActionButton variant="danger" disabled={!accountKey} onClick={() => onAction("suspend")}>
              계정 정지
            </AdminActionButton>
          ) : null}
          {k !== "blocked" ? (
            <AdminActionButton variant="danger" disabled={!accountKey} onClick={() => onAction("ban")}>
              이용 차단
            </AdminActionButton>
          ) : null}
          {k === "suspended" || k === "blocked" ? (
            <AdminActionButton variant="primary" onClick={() => onAction("restore")}>
              정지·차단 해제
            </AdminActionButton>
          ) : null}
        </div>
      )}
      <h3 className="pt-2 text-[13px] font-semibold text-sam-fg">계정 조치 기록</h3>
      <LoadGate st={st} reload={reload}>
        {(d: ModerationResponse) => (
          <CommunityTimeline
            emptyText="계정 조치 기록이 없습니다."
            items={(d.events ?? []).map((e) => ({
              id: s(e.id),
              at: s(e.created_at),
              actor: "관리자",
              action: MOD_ACTION_LABEL[s(e.action)] ?? "계정 조치",
              reason: s(e.reason).replace(/^\[SUCCESS\]\s*/, "") || null,
            }))}
          />
        )}
      </LoadGate>
    </div>
  );
}

const ACCOUNT_SHEET: Record<
  "warn" | "suspend" | "ban" | "restore",
  { title: string; confirm: string; notice: string; destructive: boolean; ok: string }
> = {
  warn: {
    title: "계정 경고",
    confirm: "계정 경고",
    notice: "계정 조치 기록에 경고를 남깁니다. 이용은 막히지 않습니다.",
    destructive: false,
    ok: "계정 경고를 남겼습니다.",
  },
  suspend: {
    title: "계정 정지",
    confirm: "계정 정지",
    notice: "거래뿐 아니라 앱 전체 이용이 정지되고 로그인 중인 기기에서 로그아웃됩니다. 운영하는 매장이 있으면 판매도 멈춥니다.",
    destructive: true,
    ok: "계정을 정지했습니다.",
  },
  ban: {
    title: "이용 차단",
    confirm: "이용 차단",
    notice: "로그인 자체가 막히고 모든 기기에서 로그아웃됩니다. 운영하는 매장이 있으면 판매도 멈춥니다. 해제 전까지 앱을 쓸 수 없습니다.",
    destructive: true,
    ok: "이용을 차단했습니다.",
  },
  restore: {
    title: "정지·차단 해제",
    confirm: "해제",
    notice: "다시 앱을 이용할 수 있게 됩니다. 멈춘 매장 판매는 따로 다시 열어야 합니다.",
    destructive: false,
    ok: "정지·차단을 해제했습니다.",
  },
};

function AccountActionSheet({
  userId,
  label,
  accountKey,
  action,
  onClose,
  onSettled,
}: {
  userId: string;
  label: string;
  accountKey: string | null;
  action: "warn" | "suspend" | "ban" | "restore";
  onClose: () => void;
  onSettled: (b: CommunityBanner) => void;
}) {
  const cfg = ACCOUNT_SHEET[action];
  return (
    <CommunityActionSheet
      title={cfg.title}
      rows={[
        { label: "회원", value: label },
        { label: "현재 상태", value: accountKey ? <CommunityStatusBadge domain="account_status" value={accountKey} /> : "확인 불가" },
      ]}
      notice={cfg.notice}
      reason={{ minLength: REASON_MIN, placeholder: "사유 (운영 기록에 남습니다)" }}
      destructive={cfg.destructive}
      confirmLabel={cfg.confirm}
      onClose={onClose}
      onSubmit={async (reason) => {
        const { result } = await communityActionFetch(
          `/api/admin/trade/members/${encodeURIComponent(userId)}/moderation`,
          "POST",
          { action, reason }
        );
        return result;
      }}
      onSettled={(k: CommunitySheetSettle) =>
        onSettled(
          k === "done"
            ? { tone: "success", text: cfg.ok }
            : k === "stale"
              ? { tone: "warning", text: `${COMMUNITY_STALE_TEXT}. 현재 계정 상태에서는 할 수 없는 조치일 수 있습니다.` }
              : { tone: "error", text: tradeErrorText("not_found") }
        )
      }
    />
  );
}

