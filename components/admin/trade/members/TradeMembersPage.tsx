"use client";

/**
 * 판매자·구매자 `/admin/trade/members` (설계 v2 §C-6) — 거래글을 올렸거나 거래 채팅을 한 회원.
 * 탭: 전체 / 거래 제한 중 / 계정 정지 (건수) · 닉네임 검색 · 행 → 판매자·구매자 상세.
 * URL: tab(탭 — 대시보드 딥링크 호환) · q · page · size(20/50/100)
 */
import Link from "next/link";
import {
  COMMUNITY_TD,
  CommunityFilterBar,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunityStatusBadge,
  CommunityTable,
  CommunityTabs,
  useCommunityListQuery,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { tradeDetailHref } from "@/components/admin/trade/kit/TradeAdminKit";
import { TRADE_RESTRICTION_SCOPE_LABEL } from "@/components/admin/trade/restrictions/TradeRestrictionsPage";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

type TabKey = "all" | "restricted" | "suspended";
const TABS: { value: TabKey; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "restricted", label: "거래 제한 중" },
  { value: "suspended", label: "계정 정지" },
];
const EMPTY_TEXT: Record<TabKey, string> = {
  all: "조건에 맞는 판매자·구매자가 없습니다.",
  restricted: "거래 제한 중인 회원이 없습니다.",
  suspended: "계정 정지된 회원이 없습니다.",
};

type MemberRow = {
  user_id: string;
  label: string | null;
  account_status: string | null;
  post_count: number;
  buyer_chat_count: number;
  trade_restrictions: string[];
  open_user_reports: number;
};

type ListResponse = {
  ok?: boolean;
  error?: string;
  total?: number;
  capped?: boolean;
  tabCounts?: Partial<Record<TabKey, number>>;
  rows?: MemberRow[];
};

/** 프로필 상태 → 계정 상태 라벨 키 (정상·계정 정지·계정 차단·탈퇴) */
export function tradeAccountStatusKey(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "suspended") return "suspended";
  if (v === "blocked" || v === "banned") return "blocked";
  if (v === "deleted" || v === "withdrawn" || v === "deactivated") return "withdrawn";
  return "active";
}

export function TradeMembersPage() {
  /** `tab` 은 조회 조건 밖 키 — [초기화] 후에도 유지, 탭을 바꾸면 1쪽으로 */
  const qs = useCommunityQueryState();
  const lq = useCommunityListQuery();
  const tabRaw = qs.get("tab");
  const tab: TabKey = (TABS.find((t) => t.value === tabRaw)?.value ?? "all") as TabKey;

  const params = lq.apiParams({ period: false });
  params.set("tab", tab);
  const { state, reload } = useCommunityAdminJson<ListResponse>(`/api/admin/trade/members?${params.toString()}`);
  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const counts = state.data?.tabCounts ?? {};

  return (
    <CommunityListShell
      title="판매자·구매자"
      description="거래글을 올렸거나 거래 채팅을 한 회원의 거래 활동·신고·제한을 확인하고 조치합니다."
      tabs={
        <CommunityTabs
          value={tab}
          onChange={(v) => qs.set({ tab: v === "all" ? null : v })}
          tabs={TABS.map((t) => ({ value: t.value, label: t.label, count: counts[t.value] ?? null }))}
        />
      }
      filterBar={
        <CommunityFilterBar lq={lq} showPeriod={false} searchPlaceholder="닉네임" pending={state.status === "loading"}>
          {state.data?.capped ? (
            <p className="w-full text-[12px] text-sam-muted">
              거래 회원이 많아 최근 활동 일부만 집계했습니다. 특정 회원은 닉네임으로 검색하세요.
            </p>
          ) : null}
        </CommunityFilterBar>
      }
      footer={<CommunityListPagination lq={lq} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody state={state} empty={rows.length === 0} lq={lq} onRetry={reload} emptyMessage={EMPTY_TEXT[tab]}>
        <CommunityTable head={["회원", "계정 상태", "판매글 수", "구매 채팅 수", "거래 제한", "회원 신고(대기)", "상세"]}>
          {rows.map((r) => {
            const href = tradeDetailHref(`/admin/trade/members/${encodeURIComponent(r.user_id)}`, lq.selfHref);
            return (
              <tr key={r.user_id} className="border-b border-sam-border-soft hover:bg-sam-app">
                <td className={COMMUNITY_TD}>
                  <Link href={href} className="font-medium text-sam-primary hover:underline">
                    {r.label?.trim() || "이름 없음"}
                  </Link>
                </td>
                <td className={COMMUNITY_TD}>
                  <CommunityStatusBadge domain="account_status" value={tradeAccountStatusKey(r.account_status)} />
                </td>
                <td className={`${COMMUNITY_TD} text-right tabular-nums`}>{formatAdminNumber(r.post_count)}</td>
                <td className={`${COMMUNITY_TD} text-right tabular-nums`}>{formatAdminNumber(r.buyer_chat_count)}</td>
                <td className={COMMUNITY_TD}>
                  {r.trade_restrictions.length === 0 ? (
                    <span className="text-sam-muted">없음</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {r.trade_restrictions.map((x, i) => (
                        <AdminToneBadge key={`${x}-${i}`} tone="danger">
                          {TRADE_RESTRICTION_SCOPE_LABEL[x] ?? "거래 제한"}
                        </AdminToneBadge>
                      ))}
                    </span>
                  )}
                </td>
                <td className={COMMUNITY_TD}>
                  {r.open_user_reports > 0 ? (
                    <AdminToneBadge tone="waiting">{formatAdminNumber(r.open_user_reports)}건</AdminToneBadge>
                  ) : (
                    <span className="text-sam-muted">0</span>
                  )}
                </td>
                <td className={COMMUNITY_TD}>
                  <AdminActionLink href={href} variant="ghost" size="sm">
                    상세
                  </AdminActionLink>
                </td>
              </tr>
            );
          })}
        </CommunityTable>
      </CommunityListBody>
    </CommunityListShell>
  );
}
