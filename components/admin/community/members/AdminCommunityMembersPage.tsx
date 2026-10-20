"use client";

/**
 * 작성자 조회 (설계 §C-10) — 커뮤니티 활동 기준 회원 목록. 행 → 작성자 상세(조치 포함).
 * URL: q · restricted=1 · account=suspended|active · sort · period/from/to · page · size(20/50/100)
 */
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import Link from "next/link";
import {
  COMMUNITY_TD,
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListPagination,
  CommunityListShell,
  CommunitySelect,
  CommunityStatusBadge,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  communityDetailHref,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatCommunityPoints, useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";

type MemberRow = {
  user_id: string;
  nickname: string | null;
  username: string | null;
  dibay_id: string | null;
  joined_at: string | null;
  post_count: number | null;
  comment_count: number | null;
  last_activity_at: string | null;
  account_status: string | null;
  member_status: string | null;
  points: number | null;
  active_restrictions: { id: string; restriction: string | null; start_at: string | null; end_at: string | null; reason: string | null }[] | null;
  warning_count: number | null;
  reports_received: number | null;
  reports_made: number | null;
};

type MembersResponse = { ok?: boolean; error?: string; total?: number; rows?: MemberRow[] };

const SORT_OPTIONS = [
  { value: "recent", label: "최근 활동 순" },
  { value: "posts", label: "게시글 많은 순" },
  { value: "comments", label: "댓글 많은 순" },
  { value: "joined", label: "최근 가입 순" },
  { value: "nickname", label: "닉네임 순" },
];

function tabOf(restricted: string, account: string): string {
  if (restricted === "1") return "restricted";
  if (account === "suspended") return "suspended";
  return "all";
}

function num(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? formatAdminNumber(n) : "—";
}

export function restrictionUntilLabel(endAt: string | null | undefined): string {
  if (!endAt) return "커뮤니티 제한 · 영구";
  return `커뮤니티 제한 ~${formatAdminManilaDateTime(endAt).slice(5, 10)}`;
}

export function AdminCommunityMembersPage() {
  const q = useCommunityQueryState();
  const restricted = q.get("restricted");
  const account = q.get("account");
  const tab = tabOf(restricted, account);
  const sort = q.get("sort") || "recent";
  const period = q.get("period");

  const params = new URLSearchParams();
  if (q.get("q")) params.set("q", q.get("q"));
  if (restricted === "1") params.set("restricted", "1");
  if (account === "suspended" || account === "active") params.set("account", account);
  params.set("sort", sort);
  params.set("period", period || "all");
  if (period === "custom") {
    if (q.get("from")) params.set("from", q.get("from"));
    if (q.get("to")) params.set("to", q.get("to"));
  }
  params.set("limit", String(q.limitOffset.limit));
  params.set("offset", String(q.limitOffset.offset));
  const customIncomplete = period === "custom" && (!q.get("from") || !q.get("to"));
  const { state, reload } = useCommunityAdminJson<MembersResponse>(
    customIncomplete ? null : `/api/admin/community/members?${params.toString()}`
  );

  const rows = state.status === "ok" ? state.data.rows ?? [] : [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;

  return (
    <CommunityListShell
      title="작성자 조회"
      description="커뮤니티에 글·댓글을 쓴 회원의 활동·신고·조치 이력을 확인하고 조치합니다."
      tabs={
        <CommunityTabs
          value={tab}
          onChange={(v) =>
            q.set({
              restricted: v === "restricted" ? "1" : null,
              account: v === "suspended" ? "suspended" : null,
            })
          }
          tabs={[
            { value: "all", label: "전체" },
            { value: "restricted", label: "활동 제한 중" },
            { value: "suspended", label: "계정 정지 중" },
          ]}
        />
      }
      filterBar={
        <>
          <CommunityFilterBar showPeriod searchPlaceholder="닉네임 · 아이디 · DIBAY ID" onRefresh={reload}>
            <CommunityFilterField label="정렬">
              <CommunitySelect value={sort} onChange={(v) => q.set({ sort: v === "recent" ? null : v })} options={SORT_OPTIONS} />
            </CommunityFilterField>
          </CommunityFilterBar>
          {period ? <p className="text-[12px] text-sam-muted">선택한 기간에 글이나 댓글을 쓴 회원만 표시합니다.</p> : null}
        </>
      }
      footer={<CommunityListPagination q={q} total={total} disabled={state.status === "loading"} />}
    >
      {customIncomplete ? (
        <AdminEmptyState ko message="직접 지정 기간의 시작일과 종료일을 모두 선택하세요." />
      ) : state.status === "loading" && !state.data ? (
        <AdminLoadingState ko />
      ) : state.status === "error" ? (
        <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      ) : rows.length === 0 ? (
        <AdminEmptyState
          ko
          message="조건에 맞는 작성자가 없습니다."
          onReset={q.hasAny(["q", "restricted", "account", "sort", "period", "from", "to"]) ? () => q.reset() : undefined}
        />
      ) : (
        <CommunityTable head={["회원", "가입일", "게시글", "댓글", "받은 신고", "조치 이력", "계정 상태", "포인트", "최근 활동"]}>
          {rows.map((r) => {
            const href = communityDetailHref(`/admin/community/members/${encodeURIComponent(r.user_id)}`, q.selfHref);
            const handle = r.dibay_id || r.username;
            const active = r.active_restrictions ?? [];
            return (
              <tr key={r.user_id} className="border-b border-sam-border-soft hover:bg-sam-app">
                <td className={COMMUNITY_TD}>
                  <Link href={href} className="font-medium text-sam-info hover:underline">
                    {r.nickname?.trim() || "이름 없음"}
                  </Link>
                  {handle ? <div className="sam-text-xxs text-sam-muted">@{handle}</div> : null}
                </td>
                <td className={COMMUNITY_TD}>
                  {r.joined_at ? formatAdminManilaDateTime(r.joined_at).slice(0, 10) : "—"}
                </td>
                <td className={COMMUNITY_TD}>{num(r.post_count)}</td>
                <td className={COMMUNITY_TD}>{num(r.comment_count)}</td>
                <td className={COMMUNITY_TD}>{num(r.reports_received)}</td>
                <td className={COMMUNITY_TD}>
                  <div className="flex flex-wrap gap-1">
                    {active.map((a) => (
                      <AdminToneBadge key={a.id} tone="danger">
                        {restrictionUntilLabel(a.end_at)}
                      </AdminToneBadge>
                    ))}
                    {r.warning_count ? <AdminToneBadge tone="warning">경고 {r.warning_count}회</AdminToneBadge> : null}
                    {active.length === 0 && !r.warning_count ? <span className="text-sam-muted">없음</span> : null}
                  </div>
                </td>
                <td className={COMMUNITY_TD}>
                  <CommunityStatusBadge domain="account_status" value={r.account_status} />
                </td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatCommunityPoints(r.points)}</td>
                <td className={COMMUNITY_TD}>
                  <CommunityTimeCell iso={r.last_activity_at} />
                </td>
              </tr>
            );
          })}
        </CommunityTable>
      )}
    </CommunityListShell>
  );
}
