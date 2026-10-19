"use client";

/**
 * 작성자 상세 (설계 §C-10) — ① 요약 카드 ② 활동 탭(글·댓글·받은 신고·낸 신고·조치·포인트·홍보)
 * ③ 조치(경고 보내기 L2 · 활동 제한 L2 · 제한 해제 L2 · 계정 정지로 이동) ④ 기술 정보.
 * 구역 값이 null 이면 「확인 불가」 (빈 목록으로 대체하지 않는다).
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityStatusBadge,
  CommunitySummaryCard,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  CommunityTimeline,
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
import { AdminToneBadge, AdminUnavailableChip } from "@/components/admin/ui/AdminToneBadge";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { readAdminReturnToFromSearch } from "@/lib/admin/admin-operation-return-context";
import {
  adminCommunityLabel,
  communityRestrictionState,
  splitCommunityReportReason,
} from "@/lib/admin/status-labels/community-status-labels";
import {
  COMMUNITY_GONE_MESSAGE,
  COMMUNITY_STALE_MESSAGE,
  formatCommunityPoints,
  useCommunityAdminAccess,
  useCommunityAdminJson,
  type CommunityBannerState,
} from "@/components/admin/community/members/use-community-admin-data";
import { restrictionUntilLabel } from "@/components/admin/community/members/AdminCommunityMembersPage";
import { communityPointTypeLabel } from "@/components/admin/community/points/community-point-labels";

type Rec = Record<string, unknown>;

type SanctionRow = {
  id: string;
  sanction_type?: string | null;
  scope?: string | null;
  restriction?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  reason?: string | null;
  created_at?: string | null;
  revoked_at?: string | null;
  revoke_reason?: string | null;
};

type DetailResponse = {
  ok?: boolean;
  error?: string;
  userId?: string;
  isImportPrincipal?: boolean;
  profile?: Rec | null;
  summary?: {
    posts?: { total: number | null; active: number | null; hidden: number | null; deleted: number | null };
    comments?: { total: number | null; hidden: number | null; deleted: number | null };
    reportsReceived?: number | null;
    reportsMade?: number | null;
    activeRestrictions?: SanctionRow[] | null;
    warningCount?: number | null;
  };
  posts?: Rec[] | null;
  comments?: Rec[] | null;
  reportsReceived?: Rec[] | null;
  reportsMade?: Rec[] | null;
  sanctions?: SanctionRow[] | null;
  points?: Rec[] | null;
  promotions?: Rec[] | null;
  sectionErrors?: string[];
};

const TABS = [
  { value: "posts", label: "글" },
  { value: "comments", label: "댓글" },
  { value: "received", label: "받은 신고" },
  { value: "made", label: "낸 신고" },
  { value: "sanctions", label: "조치" },
  { value: "points", label: "포인트" },
  { value: "promotions", label: "홍보" },
];

const DAY_OPTIONS: { value: string; label: string }[] = [
  { value: "1", label: "1일" },
  { value: "3", label: "3일" },
  { value: "7", label: "7일" },
  { value: "30", label: "30일" },
  { value: "forever", label: "영구" },
];

type Sheet =
  | { kind: "warning" }
  | { kind: "restrict" }
  | { kind: "revoke"; sanction: SanctionRow }
  | null;

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const count = (v: number | null | undefined) => (typeof v === "number" ? v.toLocaleString() : null);
const abs = (iso: unknown) => (iso ? `${formatAdminManilaDateTime(String(iso))} PHT` : "—");

function CountOr({ v }: { v: number | null | undefined }) {
  const c = count(v);
  return c === null ? <AdminUnavailableChip ko /> : <>{c}</>;
}

export function AdminCommunityMemberDetailPage({ userId }: { userId: string }) {
  const q = useCommunityQueryState();
  const sp = useSearchParams();
  const backHref = readAdminReturnToFromSearch(sp) ?? "/admin/community/members";
  const tab = TABS.some((t) => t.value === q.get("tab")) ? q.get("tab") : "posts";
  const access = useCommunityAdminAccess();
  const canModerate = access.allowed("moderation");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [banner, setBanner] = useState<CommunityBannerState>(null);
  const [restriction, setRestriction] = useState<"post" | "comment" | "all">("all");
  const [days, setDays] = useState("7");

  const { state, reload } = useCommunityAdminJson<DetailResponse>(
    `/api/admin/community/members/${encodeURIComponent(userId)}?limit=30`
  );

  const settle = (kind: CommunitySheetSettle, okMessage: string) => {
    setSheet(null);
    reload();
    if (kind === "done") setBanner({ ok: true, message: okMessage });
    else if (kind === "stale") setBanner({ ok: true, message: COMMUNITY_STALE_MESSAGE });
    else setBanner({ ok: true, message: COMMUNITY_GONE_MESSAGE });
  };

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link href={backHref} className="text-[13px] font-medium text-sam-muted underline">
        ← 목록으로
      </Link>
    </div>
  );

  if (state.status === "loading" && !state.data) {
    return (
      <div className="space-y-3">
        {header}
        <AdminLoadingState ko />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="space-y-3">
        {header}
        {state.httpStatus === 404 ? (
          <AdminEmptyState ko message="회원을 찾을 수 없습니다." />
        ) : (
          <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
        )}
      </div>
    );
  }
  const d = state.data as DetailResponse;
  const p = (d.profile ?? null) as Rec | null;
  const nickname = s(p?.nickname).trim() || "이름 없음";
  const handle = s(p?.dibay_id) || s(p?.username);
  const sum = d.summary ?? {};
  const active = sum.activeRestrictions ?? null;

  const sheetRows = [
    { label: "회원", value: `${nickname}${handle ? ` (@${handle})` : ""}` },
    {
      label: "현재 제한",
      value:
        active === null
          ? "확인 불가"
          : active.length === 0
            ? "없음"
            : active.map((a) => `${adminCommunityLabel("restriction_scope", a.restriction, true).label} · ${restrictionUntilLabel(a.end_at)}`).join(", "),
    },
  ];

  return (
    <div data-community-member-detail="1" className="space-y-4">
      {header}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="sam-text-page-title font-semibold text-sam-fg">{nickname}</h1>
          <p className="mt-1 sam-text-body text-sam-muted">
            {handle ? `@${handle} · ` : ""}커뮤니티 활동과 조치 이력
          </p>
        </div>
      </header>

      <AdminResultBanner ko result={banner} onClose={() => setBanner(null)} />

      {d.isImportPrincipal ? (
        <p className="rounded-ui-rect border border-sky-300 bg-sky-50 px-3 py-2 text-[13px] text-sky-950">
          외부 수집 글을 게시하는 운영 계정입니다. 회원 조치 대상이 아닙니다.
        </p>
      ) : null}

      {/* ① 요약 */}
      <CommunitySummaryCard
        rows={[
          { label: "닉네임", value: nickname },
          { label: "DIBAY ID", value: handle ? `@${handle}` : "—" },
          { label: "가입", value: abs(p?.created_at) },
          { label: "계정 상태", value: <CommunityStatusBadge domain="account_status" value={s(p?.status) || "active"} /> },
          {
            label: "커뮤니티 제한",
            value:
              active === null ? (
                <AdminUnavailableChip ko />
              ) : active.length === 0 ? (
                "없음"
              ) : (
                <span className="flex flex-wrap gap-1">
                  {active.map((a) => (
                    <AdminToneBadge key={a.id} tone="danger">
                      {adminCommunityLabel("restriction_scope", a.restriction, true).label} · {restrictionUntilLabel(a.end_at)}
                    </AdminToneBadge>
                  ))}
                </span>
              ),
          },
          { label: "경고", value: sum.warningCount === null || sum.warningCount === undefined ? <AdminUnavailableChip ko /> : `${sum.warningCount}회` },
          {
            label: "게시글",
            value: (
              <span>
                <CountOr v={sum.posts?.total} /> (공개 {count(sum.posts?.active) ?? "확인 불가"} · 숨김{" "}
                {count(sum.posts?.hidden) ?? "확인 불가"} · 삭제 {count(sum.posts?.deleted) ?? "확인 불가"})
              </span>
            ),
          },
          {
            label: "댓글",
            value: (
              <span>
                <CountOr v={sum.comments?.total} /> (숨김 {count(sum.comments?.hidden) ?? "확인 불가"} · 삭제{" "}
                {count(sum.comments?.deleted) ?? "확인 불가"})
              </span>
            ),
          },
          { label: "받은 신고", value: <CountOr v={sum.reportsReceived} /> },
          { label: "낸 신고", value: <CountOr v={sum.reportsMade} /> },
          { label: "포인트", value: formatCommunityPoints(n(p?.points)) },
        ]}
      />

      {/* ③ 조치 */}
      <div className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        <AdminActionButton
          variant="secondary"
          disabled={!canModerate || d.isImportPrincipal}
          title={access.deniedTitle("moderation")}
          onClick={() => setSheet({ kind: "warning" })}
        >
          경고 보내기
        </AdminActionButton>
        <AdminActionButton
          variant="danger"
          disabled={!canModerate || d.isImportPrincipal}
          title={access.deniedTitle("moderation")}
          onClick={() => setSheet({ kind: "restrict" })}
        >
          활동 제한
        </AdminActionButton>
        {(active ?? []).map((a) => (
          <AdminActionButton
            key={a.id}
            variant="neutral"
            disabled={!canModerate}
            title={access.deniedTitle("moderation")}
            onClick={() => setSheet({ kind: "revoke", sanction: a })}
          >
            제한 해제 ({adminCommunityLabel("restriction_scope", a.restriction, true).label})
          </AdminActionButton>
        ))}
        <span className="ml-auto" />
        <AdminActionLink href={`/admin/users/${encodeURIComponent(userId)}`} variant="danger">
          계정 정지로 이동
        </AdminActionLink>
      </div>

      {/* ② 활동 */}
      <CommunityTabs tabs={TABS} value={tab} onChange={(v) => q.set({ tab: v === "posts" ? null : v })} />
      <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
        <TabBody tab={tab} d={d} selfHref={q.selfHref} userId={userId} />
      </div>

      {/* ④ 기술 정보 */}
      <AdminTechDetails ko>
        <div>user_id: {userId}</div>
        {(d.sectionErrors ?? []).map((e) => (
          <div key={e}>{e}</div>
        ))}
      </AdminTechDetails>

      {sheet?.kind === "warning" ? (
        <CommunityActionSheet
          title="경고 보내기"
          rows={sheetRows}
          notice="회원에게 경고 알림이 갑니다. 활동은 막히지 않습니다."
          reason={{ minLength: 2, placeholder: "경고 사유 (회원에게 전달됩니다)" }}
          confirmLabel="경고 보내기"
          onSubmit={(reason) =>
            communitySheetFetch("/api/admin/community/restrictions", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId, kind: "warning", reason }),
            })
          }
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, "경고를 보냈습니다.")}
        />
      ) : null}

      {sheet?.kind === "restrict" ? (
        <CommunityActionSheet
          title="활동 제한"
          rows={sheetRows}
          notice="커뮤니티 글·댓글·신고·모임만 막습니다. 거래·배달·메신저는 그대로 쓸 수 있습니다."
          reason={{ minLength: 2, placeholder: "제한 사유 (회원에게 전달됩니다)" }}
          destructive
          confirmLabel="활동 제한"
          onSubmit={(reason) =>
            communitySheetFetch("/api/admin/community/restrictions", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId,
                kind: "community_restriction",
                restriction,
                days: days === "forever" ? null : Number(days),
                reason,
              }),
            })
          }
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, "활동을 제한했습니다.")}
        >
          <fieldset className="space-y-1">
            <legend className="sam-text-helper font-medium text-sam-fg">제한 범위</legend>
            {(["post", "comment", "all"] as const).map((v) => (
              <label key={v} className="flex items-center gap-2 text-[13px]">
                <input type="radio" name="restriction" checked={restriction === v} onChange={() => setRestriction(v)} />
                {adminCommunityLabel("restriction_scope", v, true).label}
              </label>
            ))}
          </fieldset>
          <label className="block">
            <span className="sam-text-helper font-medium text-sam-fg">기간</span>
            <select
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="mt-1 block rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-[13px]"
            >
              {DAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </CommunityActionSheet>
      ) : null}

      {sheet?.kind === "revoke" ? (
        <CommunityActionSheet
          title="제한 해제"
          rows={[
            ...sheetRows.slice(0, 1),
            {
              label: "해제할 제한",
              value: `${adminCommunityLabel("restriction_scope", sheet.sanction.restriction, true).label} · ${restrictionUntilLabel(
                sheet.sanction.end_at
              )}`,
            },
            { label: "제한 사유", value: sheet.sanction.reason || "—" },
          ]}
          reason={{ minLength: 2, placeholder: "해제 사유" }}
          confirmLabel="제한 해제"
          onSubmit={(reason) =>
            communitySheetFetch(`/api/admin/community/restrictions/${encodeURIComponent(sheet.sanction.id)}/revoke`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason }),
            })
          }
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, "제한을 해제했습니다.")}
        />
      ) : null}
    </div>
  );
}

function Unavailable() {
  return (
    <div className="p-4">
      <AdminEmptyState ko message="이 항목은 지금 확인할 수 없습니다. 잠시 후 다시 불러오세요." />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="p-4">
      <AdminEmptyState ko message={text} />
    </div>
  );
}

function TabBody({ tab, d, selfHref, userId }: { tab: string; d: DetailResponse; selfHref: string; userId: string }): ReactNode {
  const link = (href: string, label: string) => (
    <Link href={communityDetailHref(href, selfHref)} className="font-medium text-sky-800 hover:underline">
      {label}
    </Link>
  );
  if (tab === "posts") {
    if (d.posts == null) return <Unavailable />;
    if (d.posts.length === 0) return <Empty text="쓴 글이 없습니다." />;
    return (
      <CommunityTable head={["제목", "작성 구분", "상태", "댓글", "신고", "게시"]}>
        {d.posts.map((r) => (
          <tr key={s(r.id)} className="border-b border-sam-border-soft">
            <td className={COMMUNITY_TD}>{link(`/admin/community/posts/${encodeURIComponent(s(r.id))}`, s(r.title) || "제목 없음")}</td>
            <td className={COMMUNITY_TD}>
              <CommunityStatusBadge domain="origin_kind" value={s(r.origin_kind) || "member"} />
            </td>
            <td className={COMMUNITY_TD}>
              <CommunityStatusBadge domain="content_status" value={s(r.status)} />
            </td>
            <td className={COMMUNITY_TD}>{n(r.comment_count) ?? "—"}</td>
            <td className={COMMUNITY_TD}>{n(r.report_count) ?? "—"}</td>
            <td className={COMMUNITY_TD}>
              <CommunityTimeCell iso={s(r.published_at) || s(r.created_at)} />
            </td>
          </tr>
        ))}
      </CommunityTable>
    );
  }
  if (tab === "comments") {
    if (d.comments == null) return <Unavailable />;
    if (d.comments.length === 0) return <Empty text="쓴 댓글이 없습니다." />;
    return (
      <CommunityTable head={["내용", "구분", "상태", "작성"]}>
        {d.comments.map((r) => (
          <tr key={s(r.id)} className="border-b border-sam-border-soft">
            <td className={`${COMMUNITY_TD} max-w-[28rem]`}>
              {link(`/admin/community/comments?commentId=${encodeURIComponent(s(r.id))}`, s(r.content).slice(0, 80) || "(내용 없음)")}
            </td>
            <td className={COMMUNITY_TD}>{r.parent_id ? "답글" : "댓글"}</td>
            <td className={COMMUNITY_TD}>
              <CommunityStatusBadge domain="content_status" value={s(r.status)} />
            </td>
            <td className={COMMUNITY_TD}>
              <CommunityTimeCell iso={s(r.created_at)} />
            </td>
          </tr>
        ))}
      </CommunityTable>
    );
  }
  if (tab === "received" || tab === "made") {
    const list = tab === "received" ? d.reportsReceived : d.reportsMade;
    if (list == null) return <Unavailable />;
    if (list.length === 0) return <Empty text={tab === "received" ? "받은 신고가 없습니다." : "낸 신고가 없습니다."} />;
    return (
      <CommunityTable head={["신고 사유", "대상", "상태", "접수"]}>
        {list.map((r) => {
          const { code, text } = splitCommunityReportReason(s(r.reason));
          return (
            <tr key={s(r.id)} className="border-b border-sam-border-soft">
              <td className={`${COMMUNITY_TD} max-w-[28rem]`}>
                {link(
                  `/admin/community/reports?reportId=${encodeURIComponent(s(r.id))}`,
                  adminCommunityLabel("report_reason", code, true).label
                )}
                {text ? <div className="text-[12px] text-sam-muted">{text.slice(0, 80)}</div> : null}
              </td>
              <td className={COMMUNITY_TD}>{adminCommunityLabel("report_target", s(r.target_type) || "post", true).label}</td>
              <td className={COMMUNITY_TD}>
                <CommunityStatusBadge domain="report_status" value={s(r.status)} />
              </td>
              <td className={COMMUNITY_TD}>
                <CommunityTimeCell iso={s(r.created_at)} />
              </td>
            </tr>
          );
        })}
      </CommunityTable>
    );
  }
  if (tab === "sanctions") {
    if (d.sanctions == null) return <Unavailable />;
    return (
      <div className="p-3">
        <CommunityTimeline
          emptyText="조치 기록이 없습니다."
          items={d.sanctions.map((r) => {
            const state = communityRestrictionState(r);
            const kind = adminCommunityLabel("sanction_kind", r.sanction_type, true).label;
            const scope = r.restriction ? ` · ${adminCommunityLabel("restriction_scope", r.restriction, true).label}` : "";
            const until = r.sanction_type === "community_restriction" ? ` · ${restrictionUntilLabel(r.end_at)}` : "";
            const st = r.sanction_type === "warning" ? "" : ` (${adminCommunityLabel("restriction_state", state, true).label})`;
            return {
              id: r.id,
              at: s(r.created_at) || s(r.start_at),
              actor: "관리자",
              action: `${kind}${scope}${until}${st}`,
              reason: r.revoked_at ? `${r.reason ?? ""}\n해제: ${r.revoke_reason ?? "—"}` : r.reason,
            };
          })}
        />
      </div>
    );
  }
  if (tab === "points") {
    if (d.points == null) return <Unavailable />;
    if (d.points.length === 0) return <Empty text="커뮤니티 관련 포인트 내역이 없습니다." />;
    return (
      <>
        <CommunityTable head={["시각", "유형", "포인트", "잔액", "내용"]}>
          {d.points.map((r) => {
            const amt = n(r.amount) ?? 0;
            return (
              <tr key={s(r.id)} className="border-b border-sam-border-soft">
                <td className={COMMUNITY_TD}>
                  <CommunityTimeCell iso={s(r.created_at)} />
                </td>
                <td className={COMMUNITY_TD}>{communityPointTypeLabel(s(r.related_type), s(r.entry_type))}</td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap ${amt < 0 ? "text-red-700" : "text-emerald-800"}`}>
                  {amt > 0 ? "+" : ""}
                  {amt.toLocaleString()} P
                </td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatCommunityPoints(n(r.balance_after))}</td>
                <td className={COMMUNITY_TD}>{s(r.description) || "—"}</td>
              </tr>
            );
          })}
        </CommunityTable>
        <div className="border-t border-sam-border-soft px-3 py-2 text-[13px]">
          <Link href={`/admin/community/points?userId=${encodeURIComponent(userId)}`} className="text-sky-800 underline">
            포인트 내역 전체 보기
          </Link>
        </div>
      </>
    );
  }
  if (d.promotions == null) return <Unavailable />;
  if (d.promotions.length === 0) return <Empty text="게시글 홍보 내역이 없습니다." />;
  return (
    <CommunityTable head={["게시글", "기간", "결제 포인트", "상태", "신청"]}>
      {d.promotions.map((r) => (
        <tr key={s(r.id)} className="border-b border-sam-border-soft">
          <td className={COMMUNITY_TD}>
            {s(r.target_id)
              ? link(`/admin/community/posts/${encodeURIComponent(s(r.target_id))}`, s(r.target_title) || "게시글")
              : s(r.target_title) || "—"}
          </td>
          <td className={`${COMMUNITY_TD} whitespace-nowrap`}>
            {n(r.duration_days) ?? "—"}일 · {r.start_at ? formatAdminManilaDateTime(s(r.start_at)).slice(5, 10) : "—"} ~{" "}
            {r.end_at ? formatAdminManilaDateTime(s(r.end_at)).slice(5, 10) : "—"}
          </td>
          <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatCommunityPoints(n(r.point_cost))}</td>
          <td className={COMMUNITY_TD}>
            <CommunityStatusBadge domain="promotion_status" value={s(r.order_status)} />
          </td>
          <td className={COMMUNITY_TD}>
            <CommunityTimeCell iso={s(r.created_at)} />
          </td>
        </tr>
      ))}
    </CommunityTable>
  );
}
