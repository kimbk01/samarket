"use client";

/**
 * 작성자 조회 (설계 §C-10) — 커뮤니티 활동 기준 회원 목록. 행 → 작성자 상세(조치 포함).
 * URL: q · restricted=1 · account=suspended|active · sort · from/to(PHT) · (호환) period · page · size
 */
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import Link from "next/link";
import {
  COMMUNITY_TD,
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunitySelect,
  CommunityStatusBadge,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  communityDetailHref,
  useCommunityListQuery,
} from "@/components/admin/community/kit/CommunityAdminKit";
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
const SORTS = SORT_OPTIONS.map((o) => o.value);
const MEMBER_EXTRAS = ["restricted", "account"] as const;

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
  const q = useCommunityListQuery({ extras: MEMBER_EXTRAS, sorts: SORTS, defaults: { sort: "recent" } });
  const restricted = q.query.extras.restricted;
  const account = q.query.extras.account;
  const tab = tabOf(restricted, account);
  const hasPeriod = Boolean(q.query.from || q.query.to || q.legacyPeriod);

  const { state, reload } = useCommunityAdminJson<MembersResponse>(
    `/api/admin/community/members?${q.apiParams().toString()}`
  );

  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;

  return (
    <CommunityListShell
      title="작성자 조회"
      description="커뮤니티에 글·댓글을 쓴 회원의 활동·신고·조치 이력을 확인하고 조치합니다."
      tabs={
        <CommunityTabs
          value={tab}
          onChange={(v) =>
            q.patch({
              extras: {
                restricted: v === "restricted" ? "1" : "",
                account: v === "suspended" ? "suspended" : "",
              },
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
        <CommunityFilterBar lq={q} searchPlaceholder="닉네임 · 아이디 · DIBAY ID" pending={state.status === "loading"}>
          <CommunityFilterField label="정렬">
            <CommunitySelect value={q.query.sort || "recent"} onChange={q.setSort} options={SORT_OPTIONS} />
          </CommunityFilterField>
        </CommunityFilterBar>
      }
      banner={
        hasPeriod ? <p className="text-[12px] text-sam-muted">선택한 기간에 글이나 댓글을 쓴 회원만 표시합니다.</p> : null
      }
      footer={<CommunityListPagination lq={q} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody
        state={state}
        empty={rows.length === 0}
        lq={q}
        onRetry={reload}
        emptyMessage="작성자가 없습니다."
        filteredEmptyMessage="조건에 맞는 작성자가 없습니다."
      >
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
      </CommunityListBody>
    </CommunityListShell>
  );
}
