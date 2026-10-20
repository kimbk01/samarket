"use client";

/**
 * 피드 신고 처리 패널 (설계 §C-2·C-3·E-5) — 처리함 오른쪽 시트와 `/admin/reports/[id]` 상세가 **같은 컴포넌트**를 쓴다.
 * 고정 순서: ① 대상 요약 ② 관련 기록(같은 대상 신고 n건 · 이전 조치) ③ 조치 버튼 + 메모 ④ 기술 정보.
 * - 「검토 시작」 L0 → PATCH status=reviewing (expectedStatus)
 * - 「신고 기각」·「신고 인정」 L2 → POST ./decision (신고 CAS · 콘텐츠 조치 · 경고/활동 제한 · 같은 대상 함께 종결 한 요청)
 * - 「다시 열기」 L2 최고 관리자 → PATCH status=open + reason
 * - 메모는 별도 「메모 저장」 (adminMemo 키만 — 상태 변경이 메모를 지우지 않는다)
 * 실패 시 입력·화면 상태 유지 + 배너, 409 → 최신 내용 다시 불러오기.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CommunityReportAdminRow } from "@/lib/community-feed/admin-community-reports";
import { useAdminMe } from "@/hooks/useAdminMe";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { communityAreaAllowed } from "@/lib/admin/community-admin/community-admin-permissions";
import { COMMUNITY_ADMIN_REASON_MIN_LENGTH } from "@/lib/admin/community-admin/community-admin-reason";
import { COMMUNITY_RESTRICTION_DAY_OPTIONS } from "@/lib/admin/community-admin/community-sanction-input";
import {
  adminCommunityLabel,
  splitCommunityReportReason,
} from "@/lib/admin/status-labels/community-status-labels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  CommunityActionSheet,
  CommunityAuthorCell,
  CommunityStatusBadge,
  CommunitySummaryCard,
  CommunityTimeline,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminErrorState, AdminLoadingState, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import {
  COMMUNITY_STALE_TEXT,
  CommunityBannerView,
  CommunitySection,
  communityActionFetch,
  communityAdminErrorText,
  communityPlainExcerpt,
  communityWarningsOf,
  type CommunityBanner,
} from "./community-report-admin-shared";

type Sheet = null | "dismiss" | "resolve" | "reopen";
type TargetAction = "none" | "hide" | "delete";
type MemberAction = "none" | "warning" | "community_restriction";
type Scope = "post" | "comment" | "all";

const PHT = (iso: string | null | undefined) => (iso ? `${formatAdminManilaDateTime(iso)} PHT` : "—");

const ACTION_LABEL: Record<string, string> = {
  hide: "콘텐츠 숨김",
  delete: "콘텐츠 삭제",
  warning: "경고",
  community_restriction: "커뮤니티 활동 제한",
};

function describeActions(actions: unknown[] | null | undefined, ko: boolean): string[] {
  if (!Array.isArray(actions)) return [];
  const out: string[] = [];
  for (const raw of actions) {
    const a = (raw ?? {}) as { action?: string; skipped?: string; restriction?: string | null; days?: number | null };
    if (!a.action) continue;
    let label = ACTION_LABEL[a.action] ?? "기타 조치";
    if (a.action === "community_restriction") {
      const scope = adminCommunityLabel("restriction_scope", a.restriction ?? "", ko).label;
      label += ` (${scope} · ${a.days ? `${a.days}일` : "영구"})`;
    }
    if (a.skipped) label += " — 대상이 없어 건너뜀";
    out.push(label);
  }
  return out;
}

function isMerged(r: CommunityReportAdminRow): boolean {
  return Array.isArray(r.resolution_actions) && r.resolution_actions.some((a) => Boolean((a as { merged_into?: string })?.merged_into));
}

/** 신고 상태별 허용 버튼 (전이표 §C-0-3) */
export function nextReportActions(status: string, isSuperAdmin: boolean): Array<"review" | "dismiss" | "resolve" | "reopen"> {
  const s = status.trim().toLowerCase();
  if (s === "open") return ["review", "dismiss", "resolve"];
  if (s === "reviewing") return ["dismiss", "resolve"];
  if ((s === "resolved" || s === "dismissed") && isSuperAdmin) return ["reopen"];
  return [];
}

export function CommunityReportDecisionPanel({
  reportId,
  initialRow = null,
  onMutated,
}: {
  reportId: string;
  initialRow?: CommunityReportAdminRow | null;
  /** 처리 후 목록 갱신 등 */
  onMutated?: () => void;
}) {
  const { t: tr, language } = useI18n();
  const ko = language !== "en";
  const { permissions, isSuperAdmin, loading: meLoading } = useAdminMe();
  const [row, setRow] = useState<CommunityReportAdminRow | null>(initialRow);
  const [loadErr, setLoadErr] = useState<{ code: string; status: number } | null>(null);
  const [banner, setBanner] = useState<CommunityBanner>(null);
  const [memo, setMemo] = useState(initialRow?.admin_memo ?? "");
  const [memoBusy, setMemoBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const lastJson = useRef<Record<string, unknown>>({});

  // 신고 인정 조치 선택
  const [targetAction, setTargetAction] = useState<TargetAction>("none");
  const [memberAction, setMemberAction] = useState<MemberAction>("none");
  const [scope, setScope] = useState<Scope>("all");
  const [days, setDays] = useState<string>("7");
  const [closeSameTarget, setCloseSameTarget] = useState(true);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const res = await fetch(`/api/admin/community-reports/${encodeURIComponent(reportId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; row?: CommunityReportAdminRow; error?: string };
      if (res.ok && j.ok && j.row) {
        setRow(j.row);
        setMemo(j.row.admin_memo ?? "");
        return j.row;
      }
      setLoadErr({ code: j.error ?? `http_${res.status}`, status: res.status });
    } catch {
      setLoadErr({ code: "network_error", status: 0 });
    }
    return null;
  }, [reportId]);

  useEffect(() => {
    // 단건 조회에만 같은 대상 신고 목록이 있다 → initialRow 가 있어도 목록이 없으면 다시 읽는다
    if (!initialRow || !initialRow.same_target_reports) void load();
  }, [initialRow, load]);

  const canModerate = meLoading || communityAreaAllowed(permissions, "moderation", isSuperAdmin);
  const canUsers = isSuperAdmin || permissions.includes("users");

  if (!row) {
    if (loadErr) {
      return (
        <AdminErrorState
          ko={ko}
          code={loadErr.code === "not_found" ? "not_found" : loadErr.code}
          httpStatus={loadErr.status}
          onRetry={() => void load()}
        />
      );
    }
    return <AdminLoadingState ko={ko} />;
  }

  const status = row.status;
  const allowed = canModerate ? nextReportActions(status, isSuperAdmin) : [];
  const displayTarget = row.display_target ?? (row.target_type === "comment" ? "comment" : "post");
  const isUserTarget = row.target_type === "user";
  const targetTypeLabel = isUserTarget
    ? "회원"
    : displayTarget === "reply"
      ? tr("admin_community_target_type_reply")
      : displayTarget === "comment"
        ? tr("admin_community_target_type_comment")
        : tr("admin_community_target_type_post");
  const authorId = String(row.post_author_id ?? "").trim();
  const postId = displayTarget === "post" && !isUserTarget ? row.target_id : String(row.context_post_id ?? "");
  const siblings = row.same_target_reports ?? [row];
  const pendingSiblings = siblings.filter((r) => r.id !== row.id && (r.status === "open" || r.status === "reviewing"));
  const reporterCount = new Set(siblings.map((r) => r.reporter_id).filter(Boolean)).size;
  const contentActionAvailable = !isUserTarget && row.target_found !== false;

  const finishStale = async () => {
    setSheet(null);
    await load();
    onMutated?.();
    setBanner({ tone: "warning", text: COMMUNITY_STALE_TEXT });
  };

  const settle = async (kind: CommunitySheetSettle, success: () => CommunityBanner) => {
    if (kind === "stale") return finishStale();
    setSheet(null);
    if (kind === "gone") {
      setBanner({ tone: "error", text: communityAdminErrorText("not_found", ko) });
      await load();
      onMutated?.();
      return;
    }
    const b = success();
    await load();
    onMutated?.();
    setBanner(b);
  };

  const startReview = async () => {
    setReviewBusy(true);
    setBanner(null);
    const { result, json } = await communityActionFetch(
      `/api/admin/community-reports/${encodeURIComponent(row.id)}`,
      "PATCH",
      { status: "reviewing", expectedStatus: status }
    );
    setReviewBusy(false);
    if (result.ok) {
      const warn = communityWarningsOf(json);
      await load();
      onMutated?.();
      setBanner({ tone: warn.length ? "warning" : "success", text: "검토를 시작했습니다.", extra: warn });
      return;
    }
    if (result.status === 409) return finishStale();
    setBanner({ tone: "error", text: communityAdminErrorText(result.code, ko) });
  };

  const saveMemo = async () => {
    setMemoBusy(true);
    setBanner(null);
    const { result, json } = await communityActionFetch(
      `/api/admin/community-reports/${encodeURIComponent(row.id)}`,
      "PATCH",
      { adminMemo: memo.trim() ? memo.trim().slice(0, 2000) : null }
    );
    setMemoBusy(false);
    if (result.ok) {
      const warn = communityWarningsOf(json);
      setRow((prev) => (prev ? { ...prev, admin_memo: memo.trim() || null } : prev));
      setBanner({ tone: warn.length ? "warning" : "success", text: "메모를 저장했습니다.", extra: warn });
      return;
    }
    // 입력한 메모는 그대로 둔다
    setBanner({ tone: "error", text: communityAdminErrorText(result.code, ko) });
  };

  const openResolve = () => {
    setTargetAction("none");
    setMemberAction("none");
    setScope("all");
    setDays("7");
    setCloseSameTarget(true);
    setSheet("resolve");
  };
  const openDismiss = () => {
    setCloseSameTarget(true);
    setSheet("dismiss");
  };

  const decisionSummary = (json: Record<string, unknown>, verb: string): CommunityBanner => {
    const closed = Array.isArray(json.closedReportIds) ? json.closedReportIds.length : 0;
    const extra: string[] = [];
    if (closed > 0) extra.push(`같은 대상의 다른 신고 ${closed}건도 함께 종결했습니다.`);
    const acts = describeActions(Array.isArray(json.actions) ? (json.actions as unknown[]) : [], ko);
    if (acts.length) extra.push(`실행한 조치: ${acts.join(", ")}`);
    const warn = communityWarningsOf(json);
    return { tone: warn.length ? "warning" : "success", text: verb, extra: [...extra, ...warn] };
  };

  const sheetRows = [
    { label: "신고 대상", value: targetTypeLabel },
    {
      label: "대상",
      value: isUserTarget
        ? row.author_label ?? "—"
        : communityPlainExcerpt(
            displayTarget === "post" ? row.post_title || row.target_content_preview : row.target_content_preview,
            80
          ) || "—",
    },
    { label: "작성자", value: row.author_label ?? "—" },
    { label: "신고", value: `${siblings.length}건 · 신고자 ${reporterCount}명` },
  ];

  const sameTargetCheckbox =
    pendingSiblings.length > 0 ? (
      <label className="flex items-start gap-2 text-[13px] text-sam-fg">
        <input
          type="checkbox"
          checked={closeSameTarget}
          onChange={(e) => setCloseSameTarget(e.target.checked)}
          className="mt-0.5"
        />
        <span>같은 대상의 다른 신고도 함께 종결 ({pendingSiblings.length}건)</span>
      </label>
    ) : null;

  const timelineItems = siblings
    .filter((r) => (r.status === "resolved" || r.status === "dismissed") && r.processed_at && !isMerged(r))
    .map((r) => {
      const acts = describeActions(r.resolution_actions, ko);
      const decision = adminCommunityLabel("report_status", r.status, ko).label;
      return {
        id: r.id,
        at: r.processed_at as string,
        actor: r.processed_by_label ?? "관리자",
        action: acts.length ? `${decision} · ${acts.join(", ")}` : decision,
        reason: r.decision_reason,
      };
    });
  const mergedCount = siblings.filter(isMerged).length;

  return (
    <div className="space-y-4" data-community-report-panel={row.id}>
      <CommunityBannerView banner={banner} onClose={() => setBanner(null)} />

      {/* ① 대상 요약 */}
      <CommunitySection title="신고 대상">
        <CommunitySummaryCard
          rows={[
            { label: "유형", value: targetTypeLabel },
            {
              label: "대상",
              value: isUserTarget ? (
                <CommunityAuthorCell
                  userId={row.target_id}
                  nickname={row.author_identity?.nickname}
                  handle={row.author_identity?.username}
                />
              ) : (
                <span className="flex flex-col gap-1">
                  {row.moderation_href ? (
                    <Link href={row.moderation_href} className="font-medium text-sam-info hover:underline">
                      {displayTarget === "post"
                        ? row.post_title?.trim() || tr("admin_posts_no_title")
                        : communityPlainExcerpt(row.target_content_preview, 60) || "내용 없음"}
                    </Link>
                  ) : (
                    <span>{row.post_title?.trim() || "—"}</span>
                  )}
                  {displayTarget !== "post" && row.post_title ? (
                    <span className="sam-text-xxs text-sam-muted">글: {row.post_title}</span>
                  ) : null}
                </span>
              ),
            },
            ...(isUserTarget
              ? []
              : [
                  {
                    label: "내용 미리보기",
                    value: (
                      <span className="whitespace-pre-wrap text-sam-fg">
                        {communityPlainExcerpt(row.target_content_preview, 200) || "—"}
                      </span>
                    ),
                  },
                  { label: "카테고리", value: row.post_topic_name ?? "—" },
                  {
                    label: "작성자",
                    value: (
                      <CommunityAuthorCell
                        userId={authorId || null}
                        nickname={row.author_identity?.nickname}
                        handle={row.author_identity?.username}
                      />
                    ),
                  },
                  { label: "작성 시각", value: PHT(row.target_created_at) },
                  {
                    label: "대상 상태",
                    value:
                      row.target_found === false ? (
                        <span className="text-sam-danger">찾을 수 없음 (영구 삭제됨)</span>
                      ) : (
                        <CommunityStatusBadge domain="content_status" value={row.target_status} ko={ko} />
                      ),
                  },
                ]),
            { label: "신고 상태", value: <CommunityStatusBadge domain="report_status" value={status} ko={ko} /> },
            { label: "신고", value: `${siblings.length}건 · 신고자 ${reporterCount}명` },
          ]}
        />
        <div className="flex flex-wrap gap-3 text-[13px]">
          {row.moderation_href ? (
            <Link href={row.moderation_href} className="text-sam-info hover:underline">
              {isUserTarget ? "작성자 조회" : tr("admin_community_report_moderate_target")}
            </Link>
          ) : null}
          {postId ? (
            <Link
              href={`/philife/${encodeURIComponent(postId)}`}
              target="_blank"
              rel="noreferrer"
              className="text-sam-info hover:underline"
            >
              {tr("admin_community_view_on_site")}
            </Link>
          ) : null}
          {authorId ? (
            <Link
              href={`/admin/community/reports?status=all&authorId=${encodeURIComponent(authorId)}`}
              className="text-sam-info hover:underline"
            >
              이 작성자가 받은 신고
            </Link>
          ) : null}
        </div>
      </CommunitySection>

      {/* ② 관련 기록 */}
      <CommunitySection title={`이 대상의 신고 ${siblings.length}건`}>
        <ol className="space-y-2">
          {siblings.map((r) => {
            const { code, text } = splitCommunityReportReason(r.reason_text);
            const reason = adminCommunityLabel("report_reason", code, ko);
            return (
              <li
                key={r.id}
                className={`rounded-ui-rect border px-3 py-2 text-[13px] ${
                  r.id === row.id ? "border-sam-primary bg-sam-surface" : "border-sam-border-soft bg-sam-surface"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <CommunityAuthorCell
                      userId={r.reporter_id || null}
                      nickname={r.reporter_identity?.nickname}
                      handle={r.reporter_identity?.username}
                    />
                  </span>
                  <span className="flex items-center gap-2 text-sam-muted">
                    <CommunityStatusBadge domain="report_status" value={r.status} ko={ko} />
                    {PHT(r.created_at)}
                  </span>
                </div>
                <p className="mt-1">
                  <span className="font-semibold text-sam-fg">{reason.known ? reason.label : "기타"}</span>
                  {text ? <span className="ml-2 whitespace-pre-wrap text-sam-muted">{text}</span> : null}
                </p>
              </li>
            );
          })}
        </ol>
      </CommunitySection>

      <CommunitySection title="이전 조치">
        <CommunityTimeline items={timelineItems} />
        {mergedCount > 0 ? (
          <p className="text-[12px] text-sam-muted">위 처리와 함께 종결된 신고 {mergedCount}건</p>
        ) : null}
      </CommunitySection>

      {/* ③ 조치 */}
      <CommunitySection title="처리">
        {allowed.length === 0 && !canModerate ? (
          <p className="text-[13px] text-sam-muted">권한 필요: 신고 처리</p>
        ) : null}
        {allowed.length === 0 && canModerate && (status === "resolved" || status === "dismissed") ? (
          <p className="text-[13px] text-sam-muted">처리가 끝난 신고입니다. 다시 열기는 최고 관리자만 할 수 있습니다.</p>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2" data-admin-report-cta-state={status}>
          {allowed.includes("reopen") ? (
            <AdminActionButton variant="secondary" onClick={() => setSheet("reopen")}>
              다시 열기
            </AdminActionButton>
          ) : null}
          {allowed.includes("review") ? (
            <AdminActionButton variant="secondary" disabled={reviewBusy} onClick={() => void startReview()}>
              {reviewBusy ? "처리 중" : "검토 시작"}
            </AdminActionButton>
          ) : null}
          {allowed.includes("dismiss") ? (
            <AdminActionButton variant="secondary" disabled={reviewBusy} onClick={openDismiss}>
              신고 기각
            </AdminActionButton>
          ) : null}
          {allowed.includes("resolve") ? (
            <AdminActionButton variant="primary" disabled={reviewBusy} onClick={openResolve}>
              신고 인정
            </AdminActionButton>
          ) : null}
          {authorId ? (
            canUsers ? (
              <AdminActionLink variant="danger" href={`/admin/users/${encodeURIComponent(authorId)}`}>
                계정 정지로 이동
              </AdminActionLink>
            ) : (
              <AdminActionButton variant="danger" disabled title="권한 필요: 회원 관리">
                계정 정지로 이동
              </AdminActionButton>
            )
          ) : null}
        </div>

        <label className="block">
          <span className="text-[12px] font-medium text-sam-muted">관리자 메모 (회원에게 보이지 않음)</span>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            maxLength={2000}
            disabled={!canModerate}
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-2 text-[13px] text-sam-fg"
          />
        </label>
        <div className="flex justify-end">
          <AdminActionButton
            variant="secondary"
            disabled={!canModerate || memoBusy || (memo.trim() || null) === (row.admin_memo?.trim() || null)}
            onClick={() => void saveMemo()}
          >
            {memoBusy ? "처리 중" : "메모 저장"}
          </AdminActionButton>
        </div>
      </CommunitySection>

      {/* ④ 기술 정보 */}
      <AdminTechDetails ko={ko}>
        <div>신고 ID: {row.id}</div>
        <div>대상: {row.target_type} / {row.target_id}</div>
        <div>상태 값: {row.status}</div>
        {row.processed_by ? <div>처리자 ID: {row.processed_by}</div> : null}
      </AdminTechDetails>

      {sheet === "dismiss" ? (
        <CommunityActionSheet
          title="신고 기각"
          rows={sheetRows}
          notice="기각하면 콘텐츠와 회원에게는 아무 변화가 없고, 신고자에게 처리 완료 알림이 갑니다."
          reason={{ minLength: COMMUNITY_ADMIN_REASON_MIN_LENGTH, placeholder: "기각 사유 (예: 신고 내용과 다름)" }}
          confirmLabel="신고 기각"
          onClose={() => setSheet(null)}
          onSubmit={async (reason) => {
            const { result, json } = await communityActionFetch(
              `/api/admin/community-reports/${encodeURIComponent(row.id)}/decision`,
              "POST",
              {
                expectedStatus: status,
                decision: "dismissed",
                reason,
                targetAction: "none",
                closeSameTarget: pendingSiblings.length > 0 && closeSameTarget,
              }
            );
            lastJson.current = json;
            return result;
          }}
          onSettled={(kind) => void settle(kind, () => decisionSummary(lastJson.current, "신고를 기각했습니다."))}
        >
          {sameTargetCheckbox}
        </CommunityActionSheet>
      ) : null}

      {sheet === "resolve" ? (
        <CommunityActionSheet
          title="신고 인정"
          rows={sheetRows}
          notice={
            memberAction === "community_restriction"
              ? "활동 제한은 커뮤니티 글·댓글·신고·모임만 막습니다. 거래·배달·메신저는 그대로입니다. 회원에게 알림이 갑니다."
              : "신고자에게 처리 완료 알림이 가고, 조치를 선택하면 작성자에게도 알림이 갑니다."
          }
          reason={{ minLength: COMMUNITY_ADMIN_REASON_MIN_LENGTH, placeholder: "인정 사유 (회원 알림·운영 기록에 남습니다)" }}
          destructive={targetAction === "delete" || memberAction === "community_restriction"}
          confirmLabel="신고 인정"
          onClose={() => setSheet(null)}
          onSubmit={async (reason) => {
            const sanction =
              memberAction === "none"
                ? null
                : memberAction === "warning"
                  ? { kind: "warning" }
                  : { kind: "community_restriction", restriction: scope, days: days === "perm" ? null : Number(days) };
            const { result, json } = await communityActionFetch(
              `/api/admin/community-reports/${encodeURIComponent(row.id)}/decision`,
              "POST",
              {
                expectedStatus: status,
                decision: "resolved",
                reason,
                targetAction: contentActionAvailable ? targetAction : "none",
                sanction,
                closeSameTarget: pendingSiblings.length > 0 && closeSameTarget,
              }
            );
            lastJson.current = json;
            return result;
          }}
          onSettled={(kind) => void settle(kind, () => decisionSummary(lastJson.current, "신고를 인정했습니다."))}
        >
          <fieldset className="space-y-1">
            <legend className="text-[12px] font-semibold text-sam-fg">콘텐츠 조치</legend>
            {(
              [
                ["none", "조치 없음"],
                ["hide", "숨기기 (작성자만 보임)"],
                ["delete", "삭제 (복구 가능)"],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="mr-4 inline-flex items-center gap-1.5 text-[13px] text-sam-fg">
                <input
                  type="radio"
                  name="targetAction"
                  checked={targetAction === v}
                  disabled={v !== "none" && !contentActionAvailable}
                  onChange={() => setTargetAction(v)}
                />
                {label}
              </label>
            ))}
            {!contentActionAvailable ? (
              <p className="text-[12px] text-sam-muted">
                {isUserTarget ? "회원 신고에는 콘텐츠 조치가 없습니다." : "대상이 이미 영구 삭제되어 콘텐츠 조치를 할 수 없습니다."}
              </p>
            ) : null}
          </fieldset>
          <fieldset className="space-y-1">
            <legend className="text-[12px] font-semibold text-sam-fg">회원 조치</legend>
            {(
              [
                ["none", "조치 없음"],
                ["warning", "경고"],
                ["community_restriction", "활동 제한"],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="mr-4 inline-flex items-center gap-1.5 text-[13px] text-sam-fg">
                <input
                  type="radio"
                  name="memberAction"
                  checked={memberAction === v}
                  disabled={v !== "none" && !authorId}
                  onChange={() => setMemberAction(v)}
                />
                {label}
              </label>
            ))}
            {memberAction === "community_restriction" ? (
              <div className="flex flex-wrap gap-3 pt-1">
                <label className="flex flex-col gap-1 text-[12px] text-sam-muted">
                  범위
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value as Scope)}
                    className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 text-[13px] text-sam-fg"
                  >
                    <option value="post">글쓰기</option>
                    <option value="comment">댓글</option>
                    <option value="all">커뮤니티 전체</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[12px] text-sam-muted">
                  기간
                  <select
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 text-[13px] text-sam-fg"
                  >
                    {COMMUNITY_RESTRICTION_DAY_OPTIONS.map((d) => (
                      <option key={d} value={String(d)}>
                        {d}일
                      </option>
                    ))}
                    <option value="perm">영구</option>
                  </select>
                </label>
              </div>
            ) : null}
            {authorId ? (
              <p className="text-[12px] text-sam-muted">
                계정 전체 정지가 필요하면{" "}
                {canUsers ? (
                  <Link href={`/admin/users/${encodeURIComponent(authorId)}`} className="text-sam-info underline">
                    계정 정지로 이동
                  </Link>
                ) : (
                  <span title="권한 필요: 회원 관리">계정 정지로 이동 (권한 필요: 회원 관리)</span>
                )}
              </p>
            ) : (
              <p className="text-[12px] text-sam-muted">작성자를 확인할 수 없어 회원 조치를 할 수 없습니다.</p>
            )}
          </fieldset>
          {sameTargetCheckbox}
        </CommunityActionSheet>
      ) : null}

      {sheet === "reopen" ? (
        <CommunityActionSheet
          title="다시 열기"
          rows={sheetRows}
          notice="신고를 다시 접수 상태로 돌립니다. 이미 실행한 숨김·제한은 자동으로 되돌리지 않습니다."
          reason={{ minLength: COMMUNITY_ADMIN_REASON_MIN_LENGTH, placeholder: "다시 여는 사유" }}
          confirmLabel="다시 열기"
          onClose={() => setSheet(null)}
          onSubmit={async (reason) => {
            const { result, json } = await communityActionFetch(
              `/api/admin/community-reports/${encodeURIComponent(row.id)}`,
              "PATCH",
              { status: "open", expectedStatus: status, reason }
            );
            lastJson.current = json;
            return result;
          }}
          onSettled={(kind) =>
            void settle(kind, () => {
              const warn = communityWarningsOf(lastJson.current);
              return { tone: warn.length ? "warning" : "success", text: "신고를 다시 열었습니다.", extra: warn };
            })
          }
        />
      ) : null}
    </div>
  );
}
