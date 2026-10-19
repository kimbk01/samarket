"use client";

/**
 * 운영 통계 (설계 §C-21 · §D-4) — 선택 기간(필리핀 시간) 지표 + 일별 추이 + 카테고리별 활동 + CSV 내려받기.
 * URL: period=today|7d|30d|custom (+from,to) — 기본 최근 7일.
 */
import { type ReactNode } from "react";
import {
  COMMUNITY_TD,
  CommunityListShell,
  CommunityTable,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { CommunityStatsPeriodPicker } from "@/components/admin/community/dashboard/CommunityStatsPeriodPicker";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminUnavailableChip } from "@/components/admin/ui/AdminToneBadge";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import type { AdminCommunityPeriodStats } from "@/lib/admin/metrics/load-community-metrics";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { communityAuditActionLabel } from "@/components/admin/community/audit/community-audit-labels";
import { communityPointTypeLabel } from "@/components/admin/community/points/community-point-labels";

type StatsResponse = {
  ok?: boolean;
  error?: string;
  period?: { period: string; from: string | null; to: string | null };
  lastUpdatedAt?: string;
  stats?: AdminCommunityPeriodStats;
};

function v(n: number | null | undefined): ReactNode {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString() : <AdminUnavailableChip ko />;
}

function Tile({ label, value, sub }: { label: string; value: number | null | undefined; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
      <span className="text-[13px] font-medium text-sam-muted">{label}</span>
      <span className="text-[22px] font-bold leading-7 text-sam-fg">{v(value)}</span>
      {sub ? <span className="text-[12px] text-sam-muted">{sub}</span> : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[15px] font-semibold text-sam-fg">{title}</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

const n = (x: number | null | undefined) => (typeof x === "number" ? x.toLocaleString() : "확인 불가");

export function AdminCommunityStatsPage() {
  const q = useCommunityQueryState();
  const period = q.get("period") || "7d";
  const params = new URLSearchParams({ period });
  if (period === "custom") {
    if (q.get("from")) params.set("from", q.get("from"));
    if (q.get("to")) params.set("to", q.get("to"));
  }
  const customIncomplete = period === "custom" && (!q.get("from") || !q.get("to"));
  const url = `/api/admin/community/stats?${params.toString()}`;
  const { state, reload } = useCommunityAdminJson<StatsResponse>(customIncomplete ? null : url);
  const s = state.status === "ok" ? state.data.stats ?? null : null;
  const range = state.status === "ok" ? state.data.period : null;
  const updated = state.status === "ok" && state.data.lastUpdatedAt ? formatAdminManilaDateTime(state.data.lastUpdatedAt).slice(11) : null;

  const byAction = s
    ? Object.entries(s.admin_actions?.by_action ?? {})
        .map(([action, count]) => ({ label: communityAuditActionLabel(action), count }))
        .reduce<Map<string, number>>((m, x) => m.set(x.label, (m.get(x.label) ?? 0) + Number(x.count ?? 0)), new Map())
    : null;

  return (
    <div className="space-y-4" data-community-stats="1">
      <CommunityListShell
        title="운영 통계"
        description="선택한 기간의 게시글·댓글·신고·조치·포인트·충전·홍보 현황입니다. 기준: 필리핀 시간"
        actions={
          <>
            <span className="text-[13px] text-sam-muted">마지막 갱신 {updated ? `${updated} PHT` : "—"}</span>
            <AdminActionButton variant="secondary" onClick={reload} disabled={state.status === "loading"}>
              새로고침
            </AdminActionButton>
            {!customIncomplete ? (
              <a
                href={`${url}&format=csv`}
                download
                data-admin-action="secondary"
                className="inline-flex min-h-9 items-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-[13px] font-semibold text-sam-fg hover:bg-sam-app"
              >
                CSV 내려받기
              </a>
            ) : null}
          </>
        }
        filters={
          <>
            <CommunityStatsPeriodPicker
              key={`${period}-${q.get("from")}-${q.get("to")}`}
              period={period}
              from={q.get("from")}
              to={q.get("to")}
              onChange={(x) => q.set({ period: x.period === "7d" ? null : x.period, from: x.from || null, to: x.to || null })}
            />
            {range?.from && range?.to ? (
              <span className="pb-1.5 text-[13px] text-sam-muted">
                {range.from === range.to ? range.from : `${range.from} ~ ${range.to}`}
              </span>
            ) : null}
          </>
        }
      >
        {customIncomplete ? (
          <AdminEmptyState ko message="직접 지정 기간의 시작일과 종료일을 모두 선택하세요." />
        ) : state.status === "loading" && !state.data ? (
          <AdminLoadingState ko />
        ) : state.status === "error" ? (
          <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
        ) : !s ? (
          <AdminEmptyState ko message="통계가 없습니다." />
        ) : (
          <div className="space-y-5 p-3">
            <Group title="게시글">
              <Tile
                label="신규 게시글"
                value={s.posts?.total}
                sub={`회원 ${n(s.posts?.member)} · 외부 수집 ${n(s.posts?.imported)} · 운영팀 ${n(s.posts?.admin)}`}
              />
              <Tile label="그중 현재 공개" value={s.posts?.active_now} />
              <Tile label="그중 관리자 숨김" value={s.posts?.hidden_now} />
              <Tile label="그중 삭제됨" value={s.posts?.deleted_now} />
            </Group>
            <Group title="댓글·작성자">
              <Tile label="신규 댓글" value={s.comments?.top_level} />
              <Tile label="신규 답글" value={s.comments?.replies} />
              <Tile label="활성 작성자" value={s.authors?.active} sub="외부 수집 계정 제외" />
              <Tile label="신규 작성자" value={s.authors?.new} sub="기간 안에 처음 글·댓글을 쓴 회원" />
            </Group>
            <Group title="신고·조치">
              <Tile label="신고 접수" value={s.reports?.received} sub={`모임 신고 ${n(s.reports?.meeting_received)}`} />
              <Tile
                label="신고 처리"
                value={s.reports?.processed}
                sub={`인정 ${n(s.reports?.resolved)} · 기각 ${n(s.reports?.dismissed)} · 모임 ${n(s.reports?.meeting_processed)}`}
              />
              <Tile label="관리자 조치" value={s.admin_actions?.total} />
            </Group>
            <Group title="반응">
              <Tile label="게시글 조회" value={s.engagement?.post_views} />
              <Tile label="게시글 좋아요" value={s.engagement?.post_likes} />
              <Tile label="댓글 좋아요" value={s.engagement?.comment_likes} />
            </Group>
            <Group title="충전·홍보">
              <Tile
                label="충전 승인"
                value={s.charges?.approved_count}
                sub={`결제 ₱${n(s.charges?.approved_payment_amount)} · 지급 ${n(s.charges?.approved_point_amount)} P`}
              />
              <Tile label="충전 반려" value={s.charges?.rejected_count} />
              <Tile label="신규 홍보" value={s.promotions?.new_count} sub={`차감 ${n(s.promotions?.new_point_cost)} P`} />
              <Tile label="종료된 홍보" value={s.promotions?.ended_count} />
            </Group>

            <section className="space-y-2">
              <h2 className="text-[15px] font-semibold text-sam-fg">일별 추이</h2>
              {(s.daily ?? []).length === 0 ? (
                <AdminEmptyState ko message="일별 기록이 없습니다." />
              ) : (
                <div className="rounded-ui-rect border border-sam-border">
                  <CommunityTable head={["날짜", "게시글", "회원 글", "외부 수집", "댓글", "활성 작성자", "신고", "관리자 조치", "보상 지급 P", "보상 회수 P"]}>
                    {s.daily.map((d) => (
                      <tr key={d.date} className="border-b border-sam-border-soft">
                        <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{d.date}</td>
                        <td className={COMMUNITY_TD}>{n(d.posts)}</td>
                        <td className={COMMUNITY_TD}>{n(d.posts_member)}</td>
                        <td className={COMMUNITY_TD}>{n(d.posts_imported)}</td>
                        <td className={COMMUNITY_TD}>{n(d.comments)}</td>
                        <td className={COMMUNITY_TD}>{n(d.active_authors)}</td>
                        <td className={COMMUNITY_TD}>{n(d.reports)}</td>
                        <td className={COMMUNITY_TD}>{n(d.admin_actions)}</td>
                        <td className={COMMUNITY_TD}>{n(d.points_rewarded)}</td>
                        <td className={COMMUNITY_TD}>{n(d.points_reclaimed)}</td>
                      </tr>
                    ))}
                  </CommunityTable>
                </div>
              )}
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="space-y-2">
                <h2 className="text-[15px] font-semibold text-sam-fg">카테고리별 활동</h2>
                {(s.topics ?? []).length === 0 ? (
                  <AdminEmptyState ko message="이 기간의 카테고리 활동이 없습니다." />
                ) : (
                  <div className="rounded-ui-rect border border-sam-border">
                    <CommunityTable head={["카테고리", "게시글", "댓글"]}>
                      {s.topics.map((t, i) => (
                        <tr key={t.topic_id ?? `none-${i}`} className="border-b border-sam-border-soft">
                          <td className={COMMUNITY_TD}>{t.name || (t.topic_id ? "이름 없는 카테고리" : "카테고리 없음")}</td>
                          <td className={COMMUNITY_TD}>{n(t.posts)}</td>
                          <td className={COMMUNITY_TD}>{n(t.comments)}</td>
                        </tr>
                      ))}
                    </CommunityTable>
                  </div>
                )}
              </section>
              <section className="space-y-2">
                <h2 className="text-[15px] font-semibold text-sam-fg">포인트</h2>
                {(s.points ?? []).length === 0 ? (
                  <AdminEmptyState ko message="이 기간의 커뮤니티 포인트 내역이 없습니다." />
                ) : (
                  <div className="rounded-ui-rect border border-sam-border">
                    <CommunityTable head={["유형", "건수", "포인트"]}>
                      {s.points.map((p) => (
                        <tr key={`${p.related_type}-${p.entry_type}`} className="border-b border-sam-border-soft">
                          <td className={COMMUNITY_TD}>{communityPointTypeLabel(p.related_type, p.entry_type)}</td>
                          <td className={COMMUNITY_TD}>{n(p.count)}</td>
                          <td className={COMMUNITY_TD}>{n(p.amount)} P</td>
                        </tr>
                      ))}
                    </CommunityTable>
                  </div>
                )}
              </section>
            </div>

            {byAction && byAction.size > 0 ? (
              <section className="space-y-2">
                <h2 className="text-[15px] font-semibold text-sam-fg">조치 유형별</h2>
                <div className="rounded-ui-rect border border-sam-border">
                  <CommunityTable head={["조치", "건수"]}>
                    {[...byAction.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([label, count]) => (
                        <tr key={label} className="border-b border-sam-border-soft">
                          <td className={COMMUNITY_TD}>{label}</td>
                          <td className={COMMUNITY_TD}>{count.toLocaleString()}</td>
                        </tr>
                      ))}
                  </CommunityTable>
                </div>
              </section>
            ) : null}
          </div>
        )}
      </CommunityListShell>
    </div>
  );
}
