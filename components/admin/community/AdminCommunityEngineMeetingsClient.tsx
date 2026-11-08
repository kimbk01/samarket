"use client";

/**
 * 커뮤니티 모임 (설계 §C-8 · §C-0-1 목록 화면 틀).
 * 탭(승인 대기/진행 중/종료/반려/전체) · 검색(모임 이름·개설자 닉네임·ID) · 페이지(20/50/100) — URL 유지, 서버에서 거르고 총 건수 표시. 개설자 열.
 * 행 버튼 2개(다음 조치 1개 + 자세히) — 나머지 조치·운영 로그·채팅방 점검은 펼친 상세에서.
 * 버튼: 승인 L1 · 반려 L2 · 숨김 L2 · 다시 공개 L1 · 모임 종료 L2 · 재개 L1 — 현재 상태(expected*)를 함께 보내 CAS (409 → 다시 불러오기).
 * 연결 채팅방 점검(펼치기)은 기존 기능 유지.
 */
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useAdminMe } from "@/hooks/useAdminMe";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel, type AdminActionKind } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { CHAT_ROOM_HARD_DELETE_CONFIRM_TEXT } from "@/lib/admin/chat-admin/chat-content-access-policy";
import { communityAreaAllowed } from "@/lib/admin/community-admin/community-admin-permissions";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityAuthorCell,
  CommunityFilterBar,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  useCommunityListQuery,
  useCommunityQueryState,
  type CommunityListLoadState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminLoadingState, AdminResultBanner, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import {
  CommunityPromotionFaultPicker,
  type CommunityPromotionFault,
} from "@/components/admin/community/kit/CommunityPromotionFaultPicker";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import {
  communityJsonFetch,
  toCommunitySheetResult,
  type CommunityBanner,
} from "@/components/admin/community/posts/community-post-admin-shared";

type Row = Record<string, unknown>;

type ChatSummaryPayload = {
  ok?: boolean;
  meeting_title?: string;
  main_chat_room_id?: string | null;
  extra_room_count?: number;
  private_room_count?: number;
  total_linked_rooms?: number;
  schema_note?: string | null;
  rooms?: Array<{
    room_id: string;
    role: string;
    meeting_chat_room_id?: string | null;
    title: string | null;
    is_private: boolean;
    is_readonly?: boolean | null;
    is_locked?: boolean | null;
    is_blocked?: boolean | null;
    message_count: number;
    hidden_message_count: number;
    report_count: number;
    last_message_at: string | null;
  }>;
  error?: string;
};

type MeetingAction = "approve" | "reject" | "hide" | "show" | "close" | "reopen";

const TABS = [
  { value: "pending", labelKey: "admin_community_meetings_lbl_pending" },
  { value: "open", labelKey: "admin_community_meetings_lbl_open" },
  { value: "ended", labelKey: "admin_community_meetings_lbl_ended" },
  { value: "rejected", labelKey: "admin_community_meetings_lbl_rejected" },
  { value: "all", labelKey: "admin_community_meetings_lbl_all" },
] as const;

const MEETING_STATUS: Record<string, { labelKey: MessageKey; tone: AdminTone }> = {
  open: { labelKey: "admin_community_meetings_lbl_open", tone: "success" },
  closed: { labelKey: "admin_community_meetings_lbl_closed", tone: "neutral" },
  ended: { labelKey: "admin_community_meetings_lbl_ended", tone: "neutral" },
  cancelled: { labelKey: "admin_community_meetings_lbl_cancelled", tone: "neutral" },
};
const STATUS_UNKNOWN: { labelKey: MessageKey; tone: AdminTone } = { labelKey: "admin_community_meetings_lbl_unknown", tone: "neutral" };
const APPROVAL: Record<string, { labelKey: MessageKey; tone: AdminTone }> = {
  pending_approval: { labelKey: "admin_community_meetings_lbl_pending", tone: "waiting" },
  approved: { labelKey: "admin_community_meetings_lbl_approved", tone: "success" },
  rejected: { labelKey: "admin_community_meetings_lbl_rejected", tone: "danger" },
};

/** 모임 조치 → 동작 종류(단계 SSOT). L2 이상은 시트에서 사유를 받아 API 본문 `reason` → 감사 기록. */
const ACTION_META: Record<MeetingAction, { labelKey: MessageKey; kind: AdminActionKind; destructive?: boolean; noticeKey: MessageKey }> = {
  approve: { labelKey: "admin_community_meetings_lbl_approved", kind: "approve", noticeKey: "admin_community_meetings_notice_approve" },
  reject: { labelKey: "admin_community_meetings_lbl_rejected", kind: "reject", destructive: true, noticeKey: "admin_community_meetings_notice_reject" },
  hide: { labelKey: "admin_community_meetings_act_hide", kind: "sanction", noticeKey: "admin_community_meetings_notice_hide" },
  show: { labelKey: "admin_community_meetings_act_show", kind: "resume", noticeKey: "admin_community_meetings_notice_show" },
  close: { labelKey: "admin_community_meetings_act_close", kind: "sanction", destructive: true, noticeKey: "admin_community_meetings_notice_close" },
  reopen: { labelKey: "admin_community_meetings_act_reopen", kind: "resume", noticeKey: "admin_community_meetings_notice_reopen" },
};

const CLOSED = new Set(["closed", "ended", "cancelled"]);

/** 조회 조건 추가 키 — 탭(`tab`)은 [초기화] 후에도 유지 */
const MEETING_EXTRAS = ["meetingId"] as const;

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function bodyFor(action: MeetingAction, r: Row, reason: string, promotionFault = ""): Record<string, unknown> {
  const expected = {
    expectedStatus: r.status ?? null,
    expectedPlatformApprovalStatus: r.platform_approval_status ?? null,
    expectedPostStatus: r.post_id ? (r.post_status ?? null) : undefined,
  };
  // D-11 ② — 모임 글을 숨기는 조치(반려·숨김)는 진행 중 상위노출이 있으면 귀책을 함께 보낸다.
  const withReason = { ...(reason ? { reason } : {}), ...(promotionFault ? { promotionFault } : {}) };
  const hasPost = Boolean(r.post_id);
  switch (action) {
    case "approve":
      return {
        ...expected,
        ...withReason,
        platformApprovalStatus: "approved",
        ...(hasPost ? { postStatus: "active", postHidden: false } : {}),
      };
    case "reject":
      return {
        ...expected,
        ...withReason,
        platformApprovalStatus: "rejected",
        ...(hasPost ? { postStatus: "hidden", postHidden: true } : {}),
      };
    case "hide":
      return { ...expected, ...withReason, postStatus: "hidden", postHidden: true };
    case "show":
      return { ...expected, postStatus: "active", postHidden: false };
    case "close":
      return { ...expected, ...withReason, status: "ended", isClosed: true };
    case "reopen":
      return { ...expected, status: "open", isClosed: false };
  }
}

export function AdminCommunityEngineMeetingsClient() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const { get, set } = useCommunityQueryState();
  const lq = useCommunityListQuery({ extras: MEETING_EXTRAS });
  const page = lq.query.page;
  const pageSize = lq.query.size;
  const { isSuperAdmin, permissions, loading: meLoading } = useAdminMe();
  const canContent = meLoading || communityAreaAllowed(permissions, "content", isSuperAdmin);
  const noPermTitle = canContent ? undefined : t("admin_community_comments_no_perm");

  const tabRaw = get("tab");
  const tab = TABS.some((x) => x.value === tabRaw) ? tabRaw : "all";
  const q = lq.query.q;
  /** 모임 신고·운영 로그 화면에서 넘어온 특정 모임 */
  const focusId = lq.query.extras.meetingId.trim();

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<{ code: string; status: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [banner, setBanner] = useState<CommunityBanner>(null);
  const [pending, setPending] = useState<{ action: MeetingAction; row: Row } | null>(null);
  /** D-11 ② — 서버가 상위노출 중이라고 알려 오면 시트 안에서 귀책을 묻는다. */
  const [meetingFault, setMeetingFault] = useState<CommunityPromotionFault>("");
  const [meetingFaultNeeded, setMeetingFaultNeeded] = useState(false);

  const [insightId, setInsightId] = useState<string | null>(null);
  const [insight, setInsight] = useState<ChatSummaryPayload | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightErr, setInsightErr] = useState("");
  const [roomBusyKey, setRoomBusyKey] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  // 탭·검색·페이지 모두 서버에서 거른다 (총 건수 = count exact).
  const apiQuery = useMemo(() => {
    const sp = new URLSearchParams({
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
    });
    if (focusId) sp.set("meetingId", focusId);
    else {
      if (tab !== "all") sp.set("tab", tab);
      if (q) sp.set("q", q);
    }
    return sp.toString();
  }, [focusId, tab, q, page, pageSize]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    void (async () => {
      const r = await communityJsonFetch<{ meetings?: Row[]; total?: number | null }>(
        `/api/admin/community/engine/meetings?${apiQuery}`
      );
      if (cancel) return;
      if (r.ok) {
        const list = r.json.meetings ?? [];
        setRows(list);
        setTotal(typeof r.json.total === "number" ? r.json.total : null);
        setLoadErr(null);
      } else {
        // 실패해도 직전 목록은 지우지 않는다 (지시서 §8-5)
        setLoadErr({ code: r.code, status: r.status });
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [apiQuery, reloadKey, lq.refreshKey]);

  const visible = rows;

  const fetchInsight = async (meetingId: string) => {
    setInsightLoading(true);
    setInsightErr("");
    const r = await communityJsonFetch<ChatSummaryPayload>(
      `/api/admin/community/engine/meetings/${encodeURIComponent(meetingId)}/chat-summary`
    );
    if (r.ok) setInsight(r.json);
    else setInsightErr(adminOperatorErrorMessage(r.code, ko));
    setInsightLoading(false);
  };

  const toggleInsight = (id: string) => {
    if (insightId === id) {
      setInsightId(null);
      setInsight(null);
      setInsightErr("");
      return;
    }
    setInsightId(id);
    setInsight(null);
    void fetchInsight(id);
  };

  const roomRequest = async (meetingId: string, key: string, url: string, init: { method: string; body: unknown }) => {
    setRoomBusyKey(key);
    setInsightErr("");
    const r = await communityJsonFetch(url, init);
    setRoomBusyKey(null);
    if (!r.ok) {
      setInsightErr(adminOperatorErrorMessage(r.code, ko));
      return;
    }
    await fetchInsight(meetingId);
  };

  const postRoomAction = async (meetingId: string, roomId: string, action: string) => {
    // 채팅방 조치는 사유(2자 이상) 필수 — 서버 상태 조건 갱신·감사 기록.
    // 제한 걸기(읽기 전용·잠금·차단) = sanction · 해제 = liftSanction (둘 다 L2).
    const lifting = action === "readonly_off" || action === "unarchive_room" || action === "unblock_room";
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(lifting ? "liftSanction" : "sanction"),
      ko,
      title: t("admin_chat_r1_action_confirm_title"),
      confirmLabel: t("admin_chat_r1_action_confirm_cta"),
    });
    if (!confirmed.ok) return;
    await roomRequest(meetingId, `${meetingId}:${roomId}:${action}`, `/api/admin/chat/rooms/${encodeURIComponent(roomId)}/action`, {
      method: "POST",
      body: { action, reason: confirmed.reason },
    });
  };

  const bulkRoomMessages = async (meetingId: string, roomId: string, hide: boolean, roomLabel: string) => {
    // 방 전체 메시지 일괄 숨김·해제 = bulk (L3: 사유 + 대상 방 이름 재입력).
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("bulk"),
      ko,
      title: hide ? t("admin_meeting_engine_confirm_bulk_hide") : t("admin_meeting_engine_confirm_bulk_unhide"),
      confirmLabel: hide ? t("admin_meeting_engine_bulk_hide_msgs") : t("admin_meeting_engine_bulk_unhide_msgs"),
      destructive: hide,
      retypeValue: roomLabel,
    });
    if (!confirmed.ok) return;
    await roomRequest(
      meetingId,
      `${meetingId}:${hide ? "bulkhide" : "bulkunhide"}:${roomId}`,
      `/api/admin/chat/rooms/${encodeURIComponent(roomId)}/messages/${hide ? "bulk-hide" : "bulk-unhide"}`,
      { method: "POST", body: { reason: confirmed.reason } }
    );
  };

  const deleteExtraMeetingChat = async (meetingId: string, mcrId: string) => {
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("delete"),
      ko,
      title: t("admin_meeting_engine_confirm_delete_extra"),
      confirmLabel: t("admin_meeting_engine_delete_extra_room"),
      destructive: true,
      retypeValue: CHAT_ROOM_HARD_DELETE_CONFIRM_TEXT,
      reasonPlaceholder: t("admin_community_meetings_delete_reason_placeholder"),
    });
    if (!confirmed.ok) return;
    await roomRequest(
      meetingId,
      `${meetingId}:del:${mcrId}`,
      `/api/admin/community/engine/meetings/${encodeURIComponent(meetingId)}/meeting-chat-rooms/${encodeURIComponent(mcrId)}`,
      { method: "DELETE", body: { reason: confirmed.reason ?? "", confirmText: CHAT_ROOM_HARD_DELETE_CONFIRM_TEXT } }
    );
  };

  const actionsFor = (r: Row): MeetingAction[] => {
    const approval = str(r.platform_approval_status) || "pending_approval";
    const status = str(r.status);
    const hidden = str(r.post_status) === "hidden" || r.post_hidden === true;
    const out: MeetingAction[] = [];
    if (approval === "pending_approval") out.push("approve", "reject");
    else if (approval === "rejected") out.push("approve");
    if (r.post_id) out.push(hidden ? "show" : "hide");
    if (CLOSED.has(status)) out.push("reopen");
    else if (status === "open") out.push("close");
    return out;
  };

  const hasData = total !== null || rows.length > 0;
  const listState: CommunityListLoadState = loadErr
    ? { status: "error", data: hasData ? rows : null, code: loadErr.code, httpStatus: loadErr.status }
    : loading
      ? { status: "loading", data: hasData ? rows : null }
      : { status: "ok", data: rows };
  const actionButton = (r: Row, a: MeetingAction, variant: "ghost" | "secondary") => (
    <AdminActionButton
      key={a}
      variant={variant}
      size="sm"
      disabled={!canContent || !!pending}
      title={noPermTitle}
      onClick={() => {
        setMeetingFault("");
        setMeetingFaultNeeded(false);
        setPending({ action: a, row: r });
      }}
    >
      {t(ACTION_META[a].labelKey)}
    </AdminActionButton>
  );
  const body: ReactNode = (
    <CommunityListBody
      state={listState}
      empty={visible.length === 0}
      lq={lq}
      onRetry={reload}
      emptyMessage={t("admin_community_meetings_list_empty")}
      filteredEmptyMessage={
        focusId ? t("admin_community_meetings_focus_missing") : t("admin_community_meetings_empty_search")
      }
    >
      <CommunityTable head={[
          t("admin_community_meetings_th_meeting"),
          t("admin_community_meetings_th_host"),
          t("admin_community_meetings_th_status"),
          t("admin_community_meetings_th_post"),
          t("admin_community_meetings_th_capacity"),
          t("admin_community_meetings_th_reports"),
          t("admin_community_meetings_th_created"),
          "",
        ]}>
        {visible.map((r) => {
          const id = str(r.id);
          const status = MEETING_STATUS[str(r.status)] ?? STATUS_UNKNOWN;
          const approval = APPROVAL[str(r.platform_approval_status) || "pending_approval"] ?? APPROVAL.pending_approval;
          const hidden = str(r.post_status) === "hidden" || r.post_hidden === true;
          const reportCount = Number(r.meeting_report_count ?? 0) + Number(r.post_report_count ?? 0);
          const isOpen = insightId === id;
          return (
            <Fragment key={id}>
              <tr
                className={`border-b border-sam-border-soft ${focusId === id ? "bg-sam-warning-soft" : ""}`}
                data-meeting-id={id}
              >
                <td className={`${COMMUNITY_TD} max-w-[16rem]`}>
                  <span className="line-clamp-2 font-medium text-sam-fg">{str(r.title) || t("admin_community_meetings_no_name")}</span>
                  <span className="text-[12px] text-sam-muted">
                    {[str(r.category_text), str(r.region_text)].filter(Boolean).join(" · ")}
                    {r.meeting_date ? ` · ${t("admin_community_meetings_meeting_date", { at: formatAdminManilaDateTime(str(r.meeting_date)) })}` : ""}
                  </span>
                  {r.is_sample_data === true ? <AdminToneBadge tone="warning">{t("admin_feed_posts_sample_badge")}</AdminToneBadge> : null}
                </td>
                <td className={COMMUNITY_TD}>
                  <CommunityAuthorCell
                    userId={str(r.host_user_id) || null}
                    nickname={str(r.host_nickname) || str(r.host_label) || null}
                    handle={str(r.host_username) || null}
                  />
                </td>
                <td className={COMMUNITY_TD}>
                  <span className="flex flex-col items-start gap-1">
                    <AdminToneBadge tone={status.tone}>{t(status.labelKey)}</AdminToneBadge>
                    <AdminToneBadge tone={approval.tone}>{t(approval.labelKey)}</AdminToneBadge>
                  </span>
                </td>
                <td className={COMMUNITY_TD}>
                  {r.post_id ? (
                    <Link
                      href={`/admin/community/posts/${encodeURIComponent(str(r.post_id))}`}
                      className="text-sam-info hover:underline"
                    >
                      {hidden ? t("admin_community_meetings_post_hidden") : t("admin_community_meetings_post_public")}
                    </Link>
                  ) : (
                    <span className="text-sam-muted">—</span>
                  )}
                </td>
                <td className={`${COMMUNITY_TD} tabular-nums`}>{str(r.max_members) || "—"}</td>
                <td className={`${COMMUNITY_TD} tabular-nums`}>
                  {reportCount > 0 ? (
                    <Link href="/admin/philife/meeting-reports" className="font-semibold text-sam-warning hover:underline">
                      {reportCount}
                    </Link>
                  ) : (
                    <span className="text-sam-muted">0</span>
                  )}
                </td>
                <td className={COMMUNITY_TD}>
                  <CommunityTimeCell iso={str(r.created_at) || null} />
                </td>
                <td className={COMMUNITY_TD}>
                  <span className="flex flex-wrap gap-1">
                    {(() => {
                      const first = actionsFor(r)[0];
                      return first ? actionButton(r, first, "ghost") : null;
                    })()}
                    <AdminActionButton variant="ghost" size="sm" disabled={insightLoading && !isOpen} onClick={() => toggleInsight(id)} aria-expanded={isOpen}>
                      {isOpen ? t("admin_community_audit_collapse") : t("admin_community_meetings_details")}
                    </AdminActionButton>
                  </span>
                </td>
              </tr>
              {isOpen ? (
                <tr className="border-b border-sam-border bg-sam-app">
                  <td colSpan={8} className="px-3 py-3 text-[13px] text-sam-fg">
                    <div className="mb-3 flex flex-wrap items-center gap-2" data-meeting-detail-actions={id}>
                      {actionsFor(r).map((a) => actionButton(r, a, "secondary"))}
                      <AdminActionLink href={`/admin/philife/meeting-events?meetingId=${encodeURIComponent(id)}`} variant="quiet">
                        {t("admin_community_meetings_row_ops_log")}
                      </AdminActionLink>
                    </div>
                    <p className="mb-2 font-semibold">{t("admin_meeting_engine_insight_open")}</p>
                    {insightLoading && !insight ? (
                      <AdminLoadingState ko={ko} />
                    ) : insightErr && !insight ? (
                      <p role="alert" className="text-sam-danger">{insightErr}</p>
                    ) : insight ? (
                      <MeetingInsight
                        insight={insight}
                        meetingId={id}
                        busy={!!roomBusyKey || insightLoading}
                        error={insightErr}
                        onRoomAction={postRoomAction}
                        onBulk={bulkRoomMessages}
                        onDeleteExtra={deleteExtraMeetingChat}
                      />
                    ) : null}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </CommunityTable>
    </CommunityListBody>
  );

  const meta = pending ? ACTION_META[pending.action] : null;

  return (
    <div className="space-y-3">
      <CommunityListShell
        title={t("admin_community_meetings_title")}
        description={t("admin_community_meetings_desc")}
        actions={
          <>
            <AdminActionLink href="/admin/philife/meeting-events" variant="neutral">
              {t("admin_community_meetings_link_ops_log")}
            </AdminActionLink>
            <AdminActionLink href="/admin/philife/meeting-reports" variant="neutral">
              {t("admin_community_meetings_link_reports")}
            </AdminActionLink>
            <AdminActionButton variant="neutral" onClick={reload} disabled={loading}>
              {t("admin_community_meetings_reload")}
            </AdminActionButton>
          </>
        }
        banner={<AdminResultBanner ko={ko} result={banner} onClose={() => setBanner(null)} />}
        tabs={
          <CommunityTabs
            tabs={TABS.map((x) => ({ value: x.value, label: t(x.labelKey), count: x.value === tab && !focusId && !loading && !loadErr ? total : null }))}
            value={tab}
            onChange={(v) => set({ tab: v === "all" ? null : v })}
          />
        }
        filterBar={
          <CommunityFilterBar
            lq={lq}
            showPeriod={false}
            searchPlaceholder={t("admin_community_meetings_search_placeholder")}
            pending={loading}
          >
            {focusId ? (
              <span className="flex h-10 items-center gap-1 rounded-full border border-sam-border bg-sam-app px-2.5 text-[12px] text-sam-fg">
                {t("admin_community_meetings_single_filter")}
                <AdminActionButton variant="quiet" size="sm" className="ml-1 h-auto! px-1!" onClick={() => lq.setExtra("meetingId", "")}>
                  {t("admin_community_meetings_single_filter_clear")}
                </AdminActionButton>
              </span>
            ) : null}
          </CommunityFilterBar>
        }
        footer={<CommunityListPagination lq={lq} total={total} disabled={loading} />}
      >
        {body}
      </CommunityListShell>

      {pending && meta ? (
        <CommunityActionSheet
          title={t("admin_community_meetings_sheet_title", { action: t(meta.labelKey) })}
          rows={[
            {
              label: t("admin_community_meetings_th_meeting"),
              value: t("admin_community_comments_row_quote", { text: str(pending.row.title).slice(0, 40) || t("admin_community_meetings_no_name") }),
            },
            {
              label: t("admin_community_comments_row_status"),
              value: `${t((MEETING_STATUS[str(pending.row.status)] ?? STATUS_UNKNOWN).labelKey)} · ${t(
                (APPROVAL[str(pending.row.platform_approval_status) || "pending_approval"] ?? APPROVAL.pending_approval).labelKey
              )}`,
            },
          ]}
          notice={t(meta.noticeKey)}
          reason={
            adminActionLevel(meta.kind) !== "L1"
              ? { minLength: 2, placeholder:
                    pending.action === "reject" || pending.action === "close"
                      ? t("admin_community_meetings_reason_to_host")
                      : t("admin_community_meetings_reason_action"),
                }
              : null
          }
          destructive={meta.destructive}
          confirmLabel={t(meta.labelKey)}
          ready={!meetingFaultNeeded || meetingFault !== ""}
          onSubmit={async (reason) => {
            const r = await communityJsonFetch(
              `/api/admin/community/engine/meetings/${encodeURIComponent(str(pending.row.id))}`,
              {
                method: "PATCH",
                body: bodyFor(pending.action, pending.row, reason, meetingFault),
              }
            );
            if (!r.ok && r.code === "promotion_fault_required") {
              setMeetingFaultNeeded(true);
              return { ok: false, status: 400, code: t("admin_community_meetings_promotion_fault_needed") };
            }
            return toCommunitySheetResult(r, language);
          }}
          onClose={() => setPending(null)}
          onSettled={(k) => {
            const label = t(meta.labelKey);
            setPending(null);
            if (k === "done") setBanner({ ok: true, message: t("admin_community_meetings_action_done", { label }) });
            else if (k === "stale") setBanner({ ok: false, code: t("admin_community_post_stale") });
            else setBanner({ ok: false, code: t("admin_community_post_gone") });
            reload();
          }}
        >
          {meetingFaultNeeded ? <CommunityPromotionFaultPicker value={meetingFault} onChange={setMeetingFault} /> : null}
        </CommunityActionSheet>
      ) : null}
    </div>
  );
}

function MeetingInsight({
  insight,
  meetingId,
  busy,
  error,
  onRoomAction,
  onBulk,
  onDeleteExtra,
}: {
  insight: ChatSummaryPayload;
  meetingId: string;
  busy: boolean;
  error: string;
  onRoomAction: (meetingId: string, roomId: string, action: string) => Promise<void>;
  onBulk: (meetingId: string, roomId: string, hide: boolean, roomLabel: string) => Promise<void>;
  onDeleteExtra: (meetingId: string, mcrId: string) => Promise<void>;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const rooms = insight.rooms ?? [];
  return (
    <div className="space-y-2">
      <p className="font-semibold text-sam-fg">{t("admin_meeting_engine_insight_title")}</p>
      <p className="text-[12px] text-sam-muted">
        {t("admin_meeting_engine_insight_stats", {
          linked: insight.total_linked_rooms ?? 0,
          extra: insight.extra_room_count ?? 0,
          priv: insight.private_room_count ?? 0,
        })}
      </p>
      {error ? <p role="alert" className="text-sam-danger">{error}</p> : null}
      <ul className="space-y-1.5 border-t border-sam-border pt-2">
        {rooms.map((room) => {
          const ro = room.is_readonly === true;
          const lk = room.is_locked === true;
          const blk = room.is_blocked === true;
          const mcr = room.meeting_chat_room_id ?? null;
          const isExtra = room.role !== "main" && !!mcr;
          const roomLabel = room.title?.trim() || room.room_id;
          return (
            <li
              key={room.room_id}
              className="flex flex-col gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-2 py-1.5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <span className="font-medium">{room.title ?? (room.role === "main" ? t("admin_meeting_engine_room_main") : t("admin_meeting_engine_room_extra"))}</span>
                <span className="ml-2 text-[12px] text-sam-muted">
                  {room.role === "main" ? t("admin_meeting_engine_room_main") : t("admin_meeting_engine_room_extra")}
                  {room.is_private ? t("admin_meeting_engine_room_private") : ""}
                  {ro ? t("admin_meeting_engine_room_readonly") : ""}
                  {lk ? t("admin_meeting_engine_room_locked") : ""}
                  {blk ? t("admin_meeting_engine_room_blocked") : ""}
                </span>
                <div className="text-[12px] text-sam-muted">
                  {t("admin_meeting_engine_room_msg_stats", {
                    messages: room.message_count,
                    hidden: room.hidden_message_count,
                    reports: room.report_count,
                  })}
                  {room.last_message_at ? ` · ${t("admin_community_meetings_last_message", { at: formatAdminManilaDateTime(room.last_message_at) })}` : ""}
                </div>
                <AdminTechDetails ko={ko}>{t("admin_community_meetings_chat_room_id", { id: room.room_id })}</AdminTechDetails>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                <AdminActionLink href={`/admin/chats/${encodeURIComponent(room.room_id)}`} variant="neutral">
                  {t("admin_meeting_engine_open_admin_chat")}
                </AdminActionLink>
                <AdminActionButton variant="neutral" disabled={busy} onClick={() => void onBulk(meetingId, room.room_id, true, roomLabel)}>
                  {t("admin_meeting_engine_bulk_hide_msgs")}
                </AdminActionButton>
                <AdminActionButton variant="neutral" disabled={busy} onClick={() => void onBulk(meetingId, room.room_id, false, roomLabel)}>
                  {t("admin_meeting_engine_bulk_unhide_msgs")}
                </AdminActionButton>
                <AdminActionButton
                  variant="neutral"
                  disabled={busy}
                  onClick={() => void onRoomAction(meetingId, room.room_id, ro ? "readonly_off" : "readonly_on")}
                >
                  {ro ? t("admin_meeting_engine_readonly_off") : t("admin_meeting_engine_readonly_on")}
                </AdminActionButton>
                <AdminActionButton
                  variant="neutral"
                  disabled={busy}
                  onClick={() => void onRoomAction(meetingId, room.room_id, lk ? "unarchive_room" : "archive_room")}
                >
                  {lk ? t("admin_meeting_engine_lock_off") : t("admin_meeting_engine_lock_on")}
                </AdminActionButton>
                <AdminActionButton
                  variant="neutral"
                  disabled={busy}
                  onClick={() => void onRoomAction(meetingId, room.room_id, blk ? "unblock_room" : "block_room")}
                >
                  {blk ? t("admin_meeting_engine_block_off") : t("admin_meeting_engine_block_on")}
                </AdminActionButton>
                {isExtra ? (
                  <AdminActionButton variant="danger" disabled={busy} onClick={() => void onDeleteExtra(meetingId, mcr!)}>
                    {t("admin_meeting_engine_delete_extra_room")}
                  </AdminActionButton>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {rooms.length === 0 ? <p className="text-[12px] text-sam-muted">{t("admin_meeting_engine_no_linked_rooms")}</p> : null}
    </div>
  );
}
