"use client";

/**
 * 커뮤니티 모임 (설계 §C-8 · §C-0-1 목록 화면 틀).
 * 탭(승인 대기/진행 중/종료/반려/전체) · 검색(모임 이름·개설자 닉네임·ID) · 페이지 — URL 유지, 서버에서 거르고 총 건수 표시. 개설자 열.
 * 버튼: 승인 L1 · 반려 L2 · 숨김 L2 · 다시 공개 L1 · 모임 종료 L2 · 재개 L1 — 현재 상태(expected*)를 함께 보내 CAS (409 → 다시 불러오기).
 * 연결 채팅방 점검(펼치기)은 기존 기능 유지.
 */
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  CommunityFilterField,
  CommunityListShell,
  CommunityPagination,
  CommunityResetFilters,
  CommunitySearchInput,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import {
  COMMUNITY_GONE_MESSAGE,
  COMMUNITY_PAGE_SIZE,
  COMMUNITY_STALE_MESSAGE,
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
  { value: "pending", label: "승인 대기" },
  { value: "open", label: "진행 중" },
  { value: "ended", label: "종료" },
  { value: "rejected", label: "반려" },
  { value: "all", label: "전체" },
] as const;

const MEETING_STATUS: Record<string, { label: string; tone: AdminTone }> = {
  open: { label: "진행 중", tone: "success" },
  closed: { label: "모집 마감", tone: "neutral" },
  ended: { label: "종료", tone: "neutral" },
  cancelled: { label: "취소", tone: "neutral" },
};
const APPROVAL: Record<string, { label: string; tone: AdminTone }> = {
  pending_approval: { label: "승인 대기", tone: "waiting" },
  approved: { label: "승인", tone: "success" },
  rejected: { label: "반려", tone: "danger" },
};

/** 모임 조치 → 동작 종류(단계 SSOT). L2 이상은 시트에서 사유를 받아 API 본문 `reason` → 감사 기록. */
const ACTION_META: Record<MeetingAction, { label: string; kind: AdminActionKind; destructive?: boolean; notice: string }> = {
  approve: { label: "승인", kind: "approve", notice: "모임을 승인하고 모임 글을 공개합니다." },
  reject: { label: "반려", kind: "reject", destructive: true, notice: "모임을 반려하고 모임 글을 숨깁니다. 개설자에게 사유와 함께 알림이 갑니다." },
  hide: { label: "숨김", kind: "sanction", notice: "모임 글을 숨깁니다. 모임 자체 상태는 바뀌지 않습니다." },
  show: { label: "다시 공개", kind: "resume", notice: "숨긴 모임 글을 다시 보이게 합니다." },
  close: { label: "모임 종료", kind: "sanction", destructive: true, notice: "모임을 종료합니다. 개설자에게 사유와 함께 알림이 갑니다." },
  reopen: { label: "재개", kind: "resume", notice: "종료된 모임을 다시 진행 중으로 바꿉니다." },
};

const CLOSED = new Set(["closed", "ended", "cancelled"]);

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function bodyFor(action: MeetingAction, r: Row, reason: string): Record<string, unknown> {
  const expected = {
    expectedStatus: r.status ?? null,
    expectedPlatformApprovalStatus: r.platform_approval_status ?? null,
    expectedPostStatus: r.post_id ? (r.post_status ?? null) : undefined,
  };
  const withReason = reason ? { reason } : {};
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
  const { get, set, reset, page } = useCommunityQueryState();
  const { isSuperAdmin, permissions, loading: meLoading } = useAdminMe();
  const canContent = meLoading || communityAreaAllowed(permissions, "content", isSuperAdmin);
  const noPermTitle = canContent ? undefined : "권한 필요: 게시판 관리";

  const tabRaw = get("tab");
  const tab = TABS.some((x) => x.value === tabRaw) ? tabRaw : "all";
  const q = get("q").trim();
  /** 모임 신고·운영 로그 화면에서 넘어온 특정 모임 */
  const focusId = get("meetingId").trim();

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<{ code: string; status: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [banner, setBanner] = useState<CommunityBanner>(null);
  const [pending, setPending] = useState<{ action: MeetingAction; row: Row } | null>(null);

  const [insightId, setInsightId] = useState<string | null>(null);
  const [insight, setInsight] = useState<ChatSummaryPayload | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightErr, setInsightErr] = useState("");
  const [roomBusyKey, setRoomBusyKey] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  // 탭·검색·페이지 모두 서버에서 거른다 (총 건수 = count exact).
  const apiQuery = useMemo(() => {
    const sp = new URLSearchParams({
      limit: String(COMMUNITY_PAGE_SIZE),
      offset: String((page - 1) * COMMUNITY_PAGE_SIZE),
    });
    if (focusId) sp.set("meetingId", focusId);
    else {
      if (tab !== "all") sp.set("tab", tab);
      if (q) sp.set("q", q);
    }
    return sp.toString();
  }, [focusId, tab, q, page]);

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
        setRows([]);
        setTotal(null);
        setLoadErr({ code: r.code, status: r.status });
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [apiQuery, reloadKey]);

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
      reasonPlaceholder: ko ? "삭제 사유 (2자 이상)" : "Reason (2+ characters)",
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

  let body: ReactNode;
  if (loading) body = <AdminLoadingState ko={ko} />;
  else if (loadErr) body = <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.status} onRetry={reload} />;
  else if (visible.length === 0)
    body = (
      <AdminEmptyState
        ko={ko}
        message={
          focusId
            ? t("admin_community_meetings_focus_missing")
            : q
              ? t("admin_community_meetings_empty_search")
              : "해당하는 모임이 없습니다."
        }
      />
    );
  else
    body = (
      <CommunityTable head={["모임", "개설자", "상태", "모임 글", "정원", "신고", "개설", ""]}>
        {visible.map((r) => {
          const id = str(r.id);
          const status = MEETING_STATUS[str(r.status)] ?? { label: "확인 필요", tone: "neutral" as AdminTone };
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
                  <span className="line-clamp-2 font-medium text-sam-fg">{str(r.title) || "이름 없음"}</span>
                  <span className="text-[12px] text-sam-muted">
                    {[str(r.category_text), str(r.region_text)].filter(Boolean).join(" · ")}
                    {r.meeting_date ? ` · 모임일 ${formatAdminManilaDateTime(str(r.meeting_date))} PHT` : ""}
                  </span>
                  {r.is_sample_data === true ? <AdminToneBadge tone="warning">샘플</AdminToneBadge> : null}
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
                    <AdminToneBadge tone={status.tone}>{status.label}</AdminToneBadge>
                    <AdminToneBadge tone={approval.tone}>{approval.label}</AdminToneBadge>
                  </span>
                </td>
                <td className={COMMUNITY_TD}>
                  {r.post_id ? (
                    <Link
                      href={`/admin/community/posts/${encodeURIComponent(str(r.post_id))}`}
                      className="text-sam-info hover:underline"
                    >
                      {hidden ? "숨김" : "공개"}
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
                    {actionsFor(r).map((a) => {
                      const meta = ACTION_META[a];
                      return (
                        <AdminActionButton
                          key={a}
                          variant={meta.destructive ? "danger" : a === "approve" ? "primary" : "secondary"}
                          disabled={!canContent || !!pending}
                          title={noPermTitle}
                          onClick={() => setPending({ action: a, row: r })}
                        >
                          {meta.label}
                        </AdminActionButton>
                      );
                    })}
                    <AdminActionButton variant="neutral" disabled={insightLoading && !isOpen} onClick={() => toggleInsight(id)}>
                      {isOpen ? t("admin_meeting_engine_insight_close") : t("admin_meeting_engine_insight_open")}
                    </AdminActionButton>
                    <AdminActionLink href={`/admin/philife/meeting-events?meetingId=${encodeURIComponent(id)}`} variant="quiet">
                      운영 로그
                    </AdminActionLink>
                  </span>
                </td>
              </tr>
              {isOpen ? (
                <tr className="border-b border-sam-border bg-sam-app">
                  <td colSpan={8} className="px-3 py-3 text-[13px] text-sam-fg">
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
    );

  const meta = pending ? ACTION_META[pending.action] : null;

  return (
    <div className="space-y-3">
      <CommunityListShell
        title="모임"
        description="모임 승인·반려와 모임 글 노출, 종료·재개를 처리합니다."
        actions={
          <>
            <AdminActionLink href="/admin/philife/meeting-events" variant="neutral">
              모임 운영 로그
            </AdminActionLink>
            <AdminActionLink href="/admin/philife/meeting-reports" variant="neutral">
              모임 신고
            </AdminActionLink>
            <AdminActionButton variant="neutral" onClick={reload} disabled={loading}>
              새로고침
            </AdminActionButton>
          </>
        }
        banner={<AdminResultBanner ko={ko} result={banner} onClose={() => setBanner(null)} />}
        tabs={
          <CommunityTabs
            tabs={TABS.map((x) => ({ ...x, count: x.value === tab && !focusId && !loading && !loadErr ? total : null }))}
            value={tab}
            onChange={(v) => set({ tab: v === "all" ? null : v })}
          />
        }
        filters={
          <>
            <CommunityFilterField label={t("admin_community_meetings_search_label")}>
              <CommunitySearchInput
                value={get("q")}
                placeholder={t("admin_community_meetings_search_placeholder")}
                onCommit={(v) => set({ q: v })}
              />
            </CommunityFilterField>
            {focusId ? (
              <span className="flex items-center gap-1 rounded-full border border-sam-border bg-sam-app px-2.5 py-1 text-[12px] text-sam-fg">
                특정 모임 1건만 보기
                <AdminActionButton variant="quiet" size="sm" className="ml-1 h-auto! px-1!" onClick={() => set({ meetingId: null })}>
                  해제
                </AdminActionButton>
              </span>
            ) : null}
            {get("q") || focusId ? <CommunityResetFilters onReset={() => reset(["tab"])} /> : null}
            {!loading && !loadErr && typeof total === "number" ? (
              <span className="pb-1.5 text-[12px] font-semibold text-sam-fg" data-community-list-total={total}>
                {t("admin_community_list_total", { count: formatAdminNumber(total) })}
              </span>
            ) : null}
          </>
        }
        footer={
          !loading && !loadErr && (rows.length > 0 || page > 1) ? (
            <CommunityPagination
              page={page}
              pageSize={COMMUNITY_PAGE_SIZE}
              total={total}
              onPage={(p) => set({ page: p > 1 ? p : null }, { keepPage: true })}
            />
          ) : null
        }
      >
        {body}
      </CommunityListShell>

      {pending && meta ? (
        <CommunityActionSheet
          title={`모임 ${meta.label}`}
          rows={[
            { label: "모임", value: `「${str(pending.row.title).slice(0, 40) || "이름 없음"}」` },
            {
              label: "현재 상태",
              value: `${(MEETING_STATUS[str(pending.row.status)] ?? { label: "확인 필요" }).label} · ${
                (APPROVAL[str(pending.row.platform_approval_status) || "pending_approval"] ?? APPROVAL.pending_approval).label
              }`,
            },
          ]}
          notice={meta.notice}
          reason={
            adminActionLevel(meta.kind) !== "L1"
              ? { minLength: 2, placeholder: pending.action === "reject" || pending.action === "close" ? "개설자에게 전달될 사유" : "처리 사유" }
              : null
          }
          destructive={meta.destructive}
          confirmLabel={meta.label}
          onSubmit={async (reason) =>
            toCommunitySheetResult(
              await communityJsonFetch(`/api/admin/community/engine/meetings/${encodeURIComponent(str(pending.row.id))}`, {
                method: "PATCH",
                body: bodyFor(pending.action, pending.row, reason),
              })
            )
          }
          onClose={() => setPending(null)}
          onSettled={(k) => {
            const label = meta.label;
            setPending(null);
            if (k === "done") setBanner({ ok: true, message: `모임을 ${label} 처리했습니다.` });
            else if (k === "stale") setBanner({ ok: false, code: COMMUNITY_STALE_MESSAGE });
            else setBanner({ ok: false, code: COMMUNITY_GONE_MESSAGE });
            reload();
          }}
        />
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
                  {room.last_message_at ? ` · 마지막 메시지 ${formatAdminManilaDateTime(room.last_message_at)} PHT` : ""}
                </div>
                <AdminTechDetails ko={ko}>채팅방 ID: {room.room_id}</AdminTechDetails>
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
