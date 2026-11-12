"use client";

/**
 * 모임 상세 (설계 moim §8) — 탭: 기본정보 · 멤버 · 가입신청 · 게시글 · 일정 · 앨범 · 채팅 · 신고 · 제재 · 운영기록.
 * 모든 쓰기는 사유 필수(조치 시트 2단계 확인) · 기본정보 수정은 낙관적 잠금(다른 관리자가 먼저 바꾸면 409 → 새로 불러오기).
 * 모임 삭제·복구는 최고관리자만 (버튼도 최고관리자에게만).
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunitySummaryCard,
  CommunityTable,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTabs, resolveAdminTabValue } from "@/components/admin/ui/AdminTabs";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { readAdminReturnToFromSearch } from "@/lib/admin/admin-operation-return-context";
import {
  MOIM_ADMIN_DETAIL_TABS,
  MOIM_ADMIN_SANCTION_LEVELS,
  type MoimAdminCategoryRow,
  type MoimAdminPerson,
  type MoimAdminSanctionLevel,
} from "@/lib/admin/moim/moim-admin-contract";
import { MOIM_REPORT_REASON_CODES } from "@/lib/moim/moim-report-reasons";
import {
  MOIM_ADMIN_FIELD,
  MOIM_ADMIN_REASON,
  MoimAdminPersonCell,
  MoimAdminSection,
  MoimAdminTime,
  MoimPlatformBadge,
  MoimStatusBadge,
  moimAdminSend,
  moimMemberStatusKey,
  moimReasonCodeLabel,
  moimRoleKey,
  useMoimAdminAccess,
  useMoimSettleBanner,
} from "@/components/admin/moim/admin-moim-shared";
import {
  MoimAlbumPanel,
  MoimChatsPanel,
  MoimEventsPanel,
  MoimPostsPanel,
  MoimProfileHistoryPanel,
  MoimReportsPanel,
  MoimRequestsPanel,
  MoimSchedulesPanel,
  MoimSectionBody,
  useMoimSection,
} from "@/components/admin/moim/admin-moim-detail-panels";

type InfoResponse = {
  ok?: boolean;
  error?: string;
  moim: {
    id: string;
    name: string;
    intro: string;
    coverImageUrl: string | null;
    categoryId: string;
    topicLabel: string | null;
    lguId: string;
    lguLabel: string | null;
    joinMode: string;
    capacity: number | null;
    memberCount: number;
    status: string;
    platformState: string;
    mainRoomId: string | null;
    lastActivityAt: string;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null;
    deletedAt: string | null;
    host: MoimAdminPerson | null;
    createdBy: MoimAdminPerson | null;
    deletedBy: MoimAdminPerson | null;
    questions: string[];
  };
  categories: MoimAdminCategoryRow[];
  activeSanctions: { id: string; level: string; reason_code: string; reason: string; starts_at: string; ends_at: string | null }[];
  warnCount: number | null;
  reportCount: number | null;
  openTransfer: { id: string; kind: string; to_user_id: string; created_at: string } | null;
};

export function AdminMoimDetailPage({ moimId }: { moimId: string }) {
  const { t } = useI18n();
  const sp = useSearchParams();
  const backHref = readAdminReturnToFromSearch(sp) ?? "/admin/community/moims";
  const tabs = useMemo(() => MOIM_ADMIN_DETAIL_TABS.map((id) => ({ id, label: t(`admin_moim_detail_tab_${id}` as MessageKey) })), [t]);
  const tab = resolveAdminTabValue(sp.get("tab"), tabs, "info");
  const { state, reload } = useCommunityAdminJson<InfoResponse>(`/api/admin/moim/moims/${encodeURIComponent(moimId)}?section=info`);
  const { settle, node: bannerNode } = useMoimSettleBanner(reload);
  const info = state.data && state.data.ok !== false ? state.data : null;

  if (state.status === "loading" && !info) return <AdminLoadingState ko />;
  if (!info) {
    return state.status === "error" ? <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} /> : null;
  }
  const m = info.moim;

  return (
    <div className="space-y-4" data-admin-moim-detail={m.id}>
      <AdminPageHeader title={m.name} description={t("admin_moim_detail_desc")} backHref={backHref} />
      <div className="flex flex-wrap items-center gap-2">
        <MoimStatusBadge value={m.status} />
        <MoimPlatformBadge value={m.platformState} />
        {info.warnCount ? <AdminToneBadge tone="warning">{t("admin_moim_warn_count", { n: info.warnCount })}</AdminToneBadge> : null}
        <span className="text-[12px] text-sam-muted">{m.id}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <LifecycleButtons moimId={m.id} status={m.status} name={m.name} onSettled={settle} />
        </div>
      </div>
      {bannerNode}
      <AdminTabs ariaLabel={t("admin_moim_detail_tabs_aria")} tabs={tabs} value={tab} defaultValue="info" />
      {tab === "info" ? <InfoPanel info={info} onSettled={settle} /> : null}
      {tab === "members" ? <MembersPanel moimId={m.id} hostUserId={m.host?.userId ?? null} onResult={settle} /> : null}
      {tab === "requests" ? <MoimRequestsPanel moimId={m.id} /> : null}
      {tab === "posts" ? <MoimPostsPanel moimId={m.id} onResult={settle} /> : null}
      {tab === "schedules" ? <MoimSchedulesPanel moimId={m.id} onResult={settle} /> : null}
      {tab === "album" ? <MoimAlbumPanel moimId={m.id} onResult={settle} /> : null}
      {tab === "chats" ? <MoimChatsPanel moimId={m.id} /> : null}
      {tab === "reports" ? <MoimReportsPanel moimId={m.id} /> : null}
      {tab === "sanctions" ? <SanctionsPanel moimId={m.id} name={m.name} status={m.status} onResult={settle} /> : null}
      {tab === "events" ? <MoimEventsPanel moimId={m.id} /> : null}
    </div>
  );
}

/* ───────── 삭제 · 복구 (최고관리자) ───────── */

function LifecycleButtons({ moimId, status, name, onSettled }: { moimId: string; status: string; name: string; onSettled: (k: CommunitySheetSettle) => void }) {
  const { t } = useI18n();
  const { isSuperAdmin } = useMoimAdminAccess();
  const [action, setAction] = useState<"delete" | "restore" | null>(null);
  if (!isSuperAdmin) return null;
  return (
    <>
      {status === "deleted" ? (
        <AdminActionButton size="sm" variant="secondary" onClick={() => setAction("restore")}>
          {t("admin_moim_restore")}
        </AdminActionButton>
      ) : (
        <AdminActionButton size="sm" variant="danger" onClick={() => setAction("delete")}>
          {t("admin_moim_delete")}
        </AdminActionButton>
      )}
      {action ? (
        <CommunityActionSheet
          title={t(action === "delete" ? "admin_moim_delete" : "admin_moim_restore")}
          rows={[{ label: t("admin_moim_col_name"), value: name }]}
          notice={t(action === "delete" ? "admin_moim_delete_notice" : "admin_moim_restore_notice")}
          reason={MOIM_ADMIN_REASON}
          retypeValue={action === "delete" ? name : undefined}
          destructive={action === "delete"}
          confirmLabel={t(action === "delete" ? "admin_moim_delete" : "admin_moim_restore")}
          onSubmit={(reason) => moimAdminSend(`/api/admin/moim/moims/${encodeURIComponent(moimId)}/lifecycle`, { action, reason }, t)}
          onClose={() => setAction(null)}
          onSettled={(k) => {
            setAction(null);
            onSettled(k);
          }}
        />
      ) : null}
    </>
  );
}

/* ───────── 기본정보 (수정: 사유 · 낙관적 잠금 · 모임장 알림) ───────── */

type InfoDraft = { name: string; intro: string; coverImageUrl: string; categoryId: string; topicLabel: string; capacity: string; joinMode: string; lguId: string; questions: string[] };

function draftOf(m: InfoResponse["moim"]): InfoDraft {
  return {
    name: m.name,
    intro: m.intro,
    coverImageUrl: m.coverImageUrl ?? "",
    categoryId: m.categoryId,
    topicLabel: m.topicLabel ?? "",
    capacity: m.capacity == null ? "" : String(m.capacity),
    joinMode: m.joinMode,
    lguId: m.lguId,
    questions: [0, 1, 2].map((i) => m.questions[i] ?? ""),
  };
}

function InfoPanel({ info, onSettled }: { info: InfoResponse; onSettled: (k: CommunitySheetSettle) => void }) {
  const { t, language } = useI18n();
  const m = info.moim;
  const base = useMemo(() => draftOf(m), [m]);
  const [draft, setDraft] = useState<InfoDraft>(base);
  const [confirming, setConfirming] = useState(false);
  const [baseKey, setBaseKey] = useState(m.updatedAt);
  if (baseKey !== m.updatedAt) {
    // 새로 불러온 값으로 입력을 맞춘다 (저장 후·409 후)
    setBaseKey(m.updatedAt);
    setDraft(base);
  }

  const patch: Record<string, unknown> = {};
  if (draft.name !== base.name) patch.name = draft.name;
  if (draft.intro !== base.intro) patch.intro = draft.intro;
  if (draft.coverImageUrl !== base.coverImageUrl) patch.coverImageUrl = draft.coverImageUrl;
  if (draft.categoryId !== base.categoryId) patch.categoryId = draft.categoryId;
  // 직접 주제 카테고리일 때만 주제를 보낸다 (다른 카테고리로 바꾸면 서버가 비운다)
  const draftCustomTopic = info.categories.find((c) => c.id === draft.categoryId)?.allowCustomTopic === true;
  if (draftCustomTopic && draft.topicLabel.trim() !== base.topicLabel) patch.topicLabel = draft.topicLabel.trim();
  if (draft.capacity !== base.capacity) patch.capacity = draft.capacity === "" ? null : Number(draft.capacity);
  if (draft.joinMode !== base.joinMode) patch.joinMode = draft.joinMode;
  if (draft.lguId !== base.lguId) patch.lguId = draft.lguId;
  if (draft.questions.join("\n") !== base.questions.join("\n")) patch.questions = draft.questions.map((q) => q.trim()).filter(Boolean);
  const changed = Object.keys(patch);
  const editable = m.status !== "deleted";
  const cat = (id: string) => {
    const c = info.categories.find((x) => x.id === id);
    return c ? (language === "en" ? c.labelEn : c.labelKo) : "—";
  };

  return (
    <div className="space-y-5">
      <CommunitySummaryCard
        rows={[
          { label: t("admin_moim_col_host"), value: <MoimAdminPersonCell person={m.host} /> },
          { label: t("admin_moim_field_created_by"), value: <MoimAdminPersonCell person={m.createdBy} /> },
          { label: t("admin_moim_col_members"), value: m.capacity ? t("admin_moim_members_of", { n: m.memberCount, cap: m.capacity }) : String(m.memberCount) },
          { label: t("admin_moim_col_category"), value: m.topicLabel ? `${cat(m.categoryId)} · ${m.topicLabel}` : cat(m.categoryId) },
          { label: t("admin_moim_col_lgu"), value: m.lguLabel ?? m.lguId },
          { label: t("admin_moim_field_join_mode"), value: t(m.joinMode === "approval" ? "moim_join_mode_approval" : "moim_join_mode_instant") },
          { label: t("admin_moim_col_reports"), value: info.reportCount == null ? "—" : String(info.reportCount) },
          { label: t("admin_moim_col_last_activity"), value: <MoimAdminTime iso={m.lastActivityAt} /> },
          { label: t("admin_moim_col_created"), value: <MoimAdminTime iso={m.createdAt} /> },
          { label: t("admin_moim_field_closed_at"), value: <MoimAdminTime iso={m.closedAt} /> },
          { label: t("admin_moim_field_deleted_at"), value: m.deletedAt ? <span><MoimAdminTime iso={m.deletedAt} /> · {m.deletedBy?.nickname ?? "—"}</span> : "—" },
          {
            label: t("admin_moim_field_main_room"),
            value: m.mainRoomId ? (
              <Link href={`/admin/chats/messenger/${encodeURIComponent(m.mainRoomId)}`} className="text-sam-primary hover:underline">
                {t("admin_moim_open_chat")}
              </Link>
            ) : (
              "—"
            ),
          },
          {
            label: t("admin_moim_field_active_sanctions"),
            value: info.activeSanctions.length
              ? info.activeSanctions.map((s) => t(`admin_moim_level_${s.level}` as MessageKey)).join(", ")
              : t("admin_moim_none"),
          },
          { label: t("admin_moim_field_open_transfer"), value: info.openTransfer ? t(`admin_moim_transfer_kind_${info.openTransfer.kind}` as MessageKey) : t("admin_moim_none") },
        ]}
      />

      <MoimAdminSection title={t("admin_moim_info_edit_title")}>
        {!editable ? <p className="text-[13px] text-sam-muted">{t("admin_moim_info_deleted_note")}</p> : null}
        <div className="grid gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-[13px] sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sam-muted">{t("admin_moim_col_name")}</span>
            <input className={MOIM_ADMIN_FIELD} value={draft.name} maxLength={60} disabled={!editable} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sam-muted">{t("admin_moim_col_category")}</span>
            <select className={MOIM_ADMIN_FIELD} value={draft.categoryId} disabled={!editable} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
              {info.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {(language === "en" ? c.labelEn : c.labelKo) + (c.isActive ? "" : ` (${t("admin_moim_category_inactive")})`)}
                </option>
              ))}
            </select>
          </label>
          {draftCustomTopic ? (
            <label className="flex flex-col gap-1">
              <span className="text-sam-muted">{t("moim_topic_label")}</span>
              <input className={MOIM_ADMIN_FIELD} value={draft.topicLabel} maxLength={20} disabled={!editable} onChange={(e) => setDraft({ ...draft, topicLabel: e.target.value })} />
            </label>
          ) : null}
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sam-muted">{t("admin_moim_field_intro")}</span>
            <textarea className={`${MOIM_ADMIN_FIELD} min-h-[100px]`} value={draft.intro} maxLength={2000} disabled={!editable} onChange={(e) => setDraft({ ...draft, intro: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sam-muted">{t("admin_moim_field_cover")}</span>
            <input className={MOIM_ADMIN_FIELD} value={draft.coverImageUrl} disabled={!editable} onChange={(e) => setDraft({ ...draft, coverImageUrl: e.target.value })} />
            {draft.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 운영자 확인용 미리보기 (외부 저장소 URL)
              <img src={draft.coverImageUrl} alt="" className="mt-1 h-24 w-40 rounded-ui-rect object-cover" />
            ) : null}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sam-muted">{t("admin_moim_field_capacity")}</span>
            <input className={MOIM_ADMIN_FIELD} inputMode="numeric" value={draft.capacity} disabled={!editable} placeholder={t("admin_moim_field_capacity_empty")} onChange={(e) => setDraft({ ...draft, capacity: e.target.value.replace(/\D/g, "") })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sam-muted">{t("admin_moim_field_join_mode")}</span>
            <select className={MOIM_ADMIN_FIELD} value={draft.joinMode} disabled={!editable} onChange={(e) => setDraft({ ...draft, joinMode: e.target.value })}>
              <option value="instant">{t("moim_join_mode_instant")}</option>
              <option value="approval">{t("moim_join_mode_approval")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sam-muted">{t("admin_moim_field_lgu_id")}</span>
            <input className={MOIM_ADMIN_FIELD} value={draft.lguId} disabled={!editable} onChange={(e) => setDraft({ ...draft, lguId: e.target.value.trim() })} />
          </label>
          {draft.questions.map((q, i) => (
            <label key={i} className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sam-muted">{t("admin_moim_field_question", { n: i + 1 })}</span>
              <input
                className={MOIM_ADMIN_FIELD}
                value={q}
                maxLength={200}
                disabled={!editable}
                onChange={(e) => setDraft({ ...draft, questions: draft.questions.map((x, j) => (j === i ? e.target.value : x)) })}
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <AdminActionButton variant="secondary" disabled={!changed.length} onClick={() => setDraft(base)}>
            {t("admin_moim_cancel_edit")}
          </AdminActionButton>
          <AdminActionButton variant="primary" disabled={!changed.length || !editable} onClick={() => setConfirming(true)}>
            {t("admin_moim_save")}
          </AdminActionButton>
        </div>
      </MoimAdminSection>
      {confirming ? (
        <CommunityActionSheet
          title={t("admin_moim_info_edit_title")}
          rows={[
            { label: t("admin_moim_col_name"), value: m.name },
            { label: t("admin_moim_field_changed"), value: changed.map((k) => t(`admin_moim_info_field_${k}` as MessageKey)).join(", ") },
          ]}
          notice={t("admin_moim_info_notify_notice")}
          reason={MOIM_ADMIN_REASON}
          confirmLabel={t("admin_moim_save")}
          onSubmit={(reason) =>
            moimAdminSend(`/api/admin/moim/moims/${encodeURIComponent(m.id)}`, { patch, expectedUpdatedAt: m.updatedAt, reason }, t, "PATCH")
          }
          onClose={() => setConfirming(false)}
          onSettled={(k) => {
            setConfirming(false);
            onSettled(k);
          }}
        />
      ) : null}
    </div>
  );
}

/* ───────── 멤버 (역할 변경 · 내보내기 · 차단 · 차단 해제 · 모임장 지정) ───────── */

type MemberRow = {
  user_id: string;
  role: string | null;
  status: string;
  nickname: string | null;
  joined_at?: string | null;
  left_at?: string | null;
  rejoin_count?: number;
  account: MoimAdminPerson | null;
  ban: { reason: string | null; created_at: string } | null;
};

type MemberSheet = { action: "role" | "remove" | "ban" | "unban" | "assign_host"; row: MemberRow };

function MembersPanel({ moimId, hostUserId, onResult }: { moimId: string; hostUserId: string | null; onResult: (k: CommunitySheetSettle) => void }) {
  const { t } = useI18n();
  const sec = useMoimSection<MemberRow>(moimId, "members");
  const [sheet, setSheet] = useState<MemberSheet | null>(null);
  const [role, setRole] = useState<"co_host" | "staff" | "member">("member");
  const [historyUser, setHistoryUser] = useState<string | null>(null);

  const openSheet = (s: MemberSheet) => {
    if (s.action === "role") setRole(s.row.role === "co_host" || s.row.role === "staff" ? s.row.role : "member");
    setSheet(s);
  };

  return (
    <div className="space-y-5">
      <MoimSectionBody sec={sec} emptyKey="admin_moim_members_empty">
        <CommunityTable
          head={[
            t("admin_moim_col_member"),
            t("admin_moim_col_role"),
            t("admin_moim_col_status"),
            t("admin_moim_col_joined"),
            t("admin_moim_col_rejoin"),
            t("admin_moim_col_actions"),
          ]}
        >
          {sec.rows.map((r) => {
            const active = r.status === "active";
            const isHost = active && (r.role === "host" || r.user_id === hostUserId);
            return (
              <tr key={r.user_id} className="border-b border-sam-border-soft align-top">
                <td className={COMMUNITY_TD}>
                  <MoimAdminPersonCell person={r.account} moimNickname={r.nickname} />
                  <AdminActionButton variant="quiet" size="sm" className="h-auto! px-0!" onClick={() => setHistoryUser(r.user_id)}>
                    {t("admin_moim_profile_history_btn")}
                  </AdminActionButton>
                </td>
                <td className={COMMUNITY_TD}>{r.role ? t(moimRoleKey(r.role)) : "—"}</td>
                <td className={COMMUNITY_TD}>
                  {t(moimMemberStatusKey(r.status))}
                  {r.ban ? <div className="text-[12px] text-sam-danger">{t("admin_moim_banned_since", { date: r.ban.created_at.slice(0, 10) })}</div> : null}
                </td>
                <td className={COMMUNITY_TD}>
                  <MoimAdminTime iso={r.joined_at ?? null} />
                  {r.left_at ? <div className="text-[12px] text-sam-muted">{t("admin_moim_left_at", { date: r.left_at.slice(0, 10) })}</div> : null}
                </td>
                <td className={COMMUNITY_TD}>{r.rejoin_count ?? 0}</td>
                <td className={COMMUNITY_TD}>
                  <div className="flex flex-wrap gap-1">
                    {active && !isHost ? (
                      <>
                        <AdminActionButton size="sm" variant="secondary" onClick={() => openSheet({ action: "role", row: r })}>
                          {t("admin_moim_member_role")}
                        </AdminActionButton>
                        <AdminActionButton size="sm" variant="secondary" onClick={() => openSheet({ action: "assign_host", row: r })}>
                          {t("admin_moim_member_assign_host")}
                        </AdminActionButton>
                      </>
                    ) : null}
                    {(active || r.status === "pending") && !isHost ? (
                      <AdminActionButton size="sm" variant="secondary" onClick={() => openSheet({ action: "remove", row: r })}>
                        {t("admin_moim_member_remove")}
                      </AdminActionButton>
                    ) : null}
                    {!isHost && !r.ban ? (
                      <AdminActionButton size="sm" variant="danger" onClick={() => openSheet({ action: "ban", row: r })}>
                        {t("admin_moim_member_ban")}
                      </AdminActionButton>
                    ) : null}
                    {r.ban ? (
                      <AdminActionButton size="sm" variant="secondary" onClick={() => openSheet({ action: "unban", row: r })}>
                        {t("admin_moim_member_unban")}
                      </AdminActionButton>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </CommunityTable>
      </MoimSectionBody>

      <MoimAdminSection
        title={t("admin_moim_profile_history_title")}
        actions={
          historyUser ? (
            <AdminActionButton size="sm" variant="quiet" onClick={() => setHistoryUser(null)}>
              {t("admin_moim_profile_history_all")}
            </AdminActionButton>
          ) : null
        }
      >
        <MoimProfileHistoryPanel moimId={moimId} userId={historyUser} />
      </MoimAdminSection>

      {sheet ? (
        <CommunityActionSheet
          title={t(`admin_moim_member_${sheet.action}` as MessageKey)}
          rows={[
            { label: t("admin_moim_col_member"), value: sheet.row.nickname ?? sheet.row.account?.nickname ?? sheet.row.user_id },
            { label: t("admin_moim_col_role"), value: sheet.row.role ? t(moimRoleKey(sheet.row.role)) : "—" },
          ]}
          notice={t(`admin_moim_member_${sheet.action}_notice` as MessageKey)}
          reason={MOIM_ADMIN_REASON}
          destructive={sheet.action === "ban" || sheet.action === "remove"}
          confirmLabel={t(`admin_moim_member_${sheet.action}` as MessageKey)}
          onSubmit={(reason) =>
            moimAdminSend(
              `/api/admin/moim/moims/${encodeURIComponent(moimId)}/members/${encodeURIComponent(sheet.row.user_id)}`,
              { action: sheet.action, role: sheet.action === "role" ? role : undefined, reason },
              t
            )
          }
          onClose={() => setSheet(null)}
          onSettled={(k) => {
            setSheet(null);
            sec.reload();
            onResult(k);
          }}
        >
          {sheet.action === "role" ? (
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="text-sam-muted">{t("admin_moim_member_new_role")}</span>
              <select className={MOIM_ADMIN_FIELD} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                {(["co_host", "staff", "member"] as const).map((r) => (
                  <option key={r} value={r}>
                    {t(moimRoleKey(r))}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </CommunityActionSheet>
      ) : null}
    </div>
  );
}

/* ───────── 제재 (적용 · 해제) ───────── */

type SanctionRow = {
  id: string;
  level: string;
  reason_code: string;
  reason: string;
  starts_at: string;
  ends_at: string | null;
  revoked_at: string | null;
  created_at: string;
  actor: MoimAdminPerson | null;
  revoker: MoimAdminPerson | null;
};

export function sanctionStateKey(r: { revoked_at: string | null; ends_at: string | null }): MessageKey {
  if (r.revoked_at) return "admin_moim_sanction_state_revoked";
  if (r.ends_at && Date.parse(r.ends_at) <= Date.now()) return "admin_moim_sanction_state_expired";
  return "admin_moim_sanction_state_active";
}

function SanctionsPanel({ moimId, name, status, onResult }: { moimId: string; name: string; status: string; onResult: (k: CommunitySheetSettle) => void }) {
  const { t } = useI18n();
  const sec = useMoimSection<SanctionRow>(moimId, "sanctions");
  const [applying, setApplying] = useState(false);
  const [revoke, setRevoke] = useState<SanctionRow | null>(null);
  return (
    <MoimAdminSection
      title={t("admin_moim_detail_tab_sanctions")}
      actions={
        status !== "deleted" ? (
          <AdminActionButton size="sm" variant="danger" onClick={() => setApplying(true)}>
            {t("admin_moim_sanction_apply")}
          </AdminActionButton>
        ) : null
      }
    >
      <p className="text-[12px] text-sam-muted">{t("admin_moim_sanction_m6_note")}</p>
      <MoimSectionBody sec={sec} emptyKey="admin_moim_sanctions_empty">
        <CommunityTable head={[t("admin_moim_col_level"), t("admin_moim_col_reason"), t("admin_moim_col_period"), t("admin_moim_col_status"), t("admin_moim_col_actor"), t("admin_moim_col_actions")]}>
          {sec.rows.map((r) => {
            const stateKey = sanctionStateKey(r);
            return (
              <tr key={r.id} className="border-b border-sam-border-soft align-top">
                <td className={COMMUNITY_TD}>{t(`admin_moim_level_${r.level}` as MessageKey)}</td>
                <td className={`${COMMUNITY_TD} max-w-[320px]`}>
                  <div>{moimReasonCodeLabel(t, r.reason_code)}</div>
                  <div className="whitespace-pre-wrap text-[12px] text-sam-muted [overflow-wrap:anywhere]">{r.reason}</div>
                </td>
                <td className={COMMUNITY_TD}>
                  <MoimAdminTime iso={r.starts_at} /> ~ {r.ends_at ? <MoimAdminTime iso={r.ends_at} /> : t("admin_moim_no_end")}
                </td>
                <td className={COMMUNITY_TD}>{t(stateKey)}</td>
                <td className={COMMUNITY_TD}>
                  <MoimAdminPersonCell person={r.actor} />
                </td>
                <td className={COMMUNITY_TD}>
                  {stateKey === "admin_moim_sanction_state_active" ? (
                    <AdminActionButton size="sm" variant="secondary" onClick={() => setRevoke(r)}>
                      {t("admin_moim_sanction_revoke")}
                    </AdminActionButton>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </CommunityTable>
      </MoimSectionBody>
      {applying ? (
        <MoimSanctionApplySheet
          moimId={moimId}
          name={name}
          onClose={() => setApplying(false)}
          onSettled={(k) => {
            setApplying(false);
            sec.reload();
            onResult(k);
          }}
        />
      ) : null}
      {revoke ? (
        <MoimSanctionRevokeSheet
          sanction={revoke}
          moimName={name}
          onClose={() => setRevoke(null)}
          onSettled={(k) => {
            setRevoke(null);
            sec.reload();
            onResult(k);
          }}
        />
      ) : null}
    </MoimAdminSection>
  );
}

export function MoimSanctionApplySheet({
  moimId,
  name,
  onClose,
  onSettled,
}: {
  moimId: string;
  name: string;
  onClose: () => void;
  onSettled: (k: CommunitySheetSettle) => void;
}) {
  const { t } = useI18n();
  const [level, setLevel] = useState<MoimAdminSanctionLevel>("unlist");
  const [reasonCode, setReasonCode] = useState<string>("");
  const [endDate, setEndDate] = useState("");
  /** 끝나는 날(PHT) 23:59:59 까지 */
  const endsAt = endDate ? `${endDate}T23:59:59+08:00` : null;
  return (
    <CommunityActionSheet
      title={t("admin_moim_sanction_apply")}
      rows={[
        { label: t("admin_moim_col_name"), value: name },
        { label: t("admin_moim_col_level"), value: t(`admin_moim_level_${level}` as MessageKey) },
      ]}
      notice={t(`admin_moim_level_${level}_effect` as MessageKey)}
      reason={MOIM_ADMIN_REASON}
      ready={Boolean(reasonCode)}
      destructive
      confirmLabel={t("admin_moim_sanction_apply")}
      onSubmit={(reason) =>
        moimAdminSend(`/api/admin/moim/moims/${encodeURIComponent(moimId)}/sanctions`, { level, reasonCode, reason, endsAt }, t)
      }
      onClose={onClose}
      onSettled={onSettled}
    >
      <div className="grid gap-2 text-[13px]">
        <label className="flex flex-col gap-1">
          <span className="text-sam-muted">{t("admin_moim_col_level")}</span>
          <select className={MOIM_ADMIN_FIELD} value={level} onChange={(e) => setLevel(e.target.value as MoimAdminSanctionLevel)}>
            {MOIM_ADMIN_SANCTION_LEVELS.map((l) => (
              <option key={l} value={l}>
                {t(`admin_moim_level_${l}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sam-muted">{t("admin_moim_field_reason_code")}</span>
          <select className={MOIM_ADMIN_FIELD} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
            <option value="">{t("admin_moim_pick")}</option>
            {MOIM_REPORT_REASON_CODES.map((c) => (
              <option key={c} value={c}>
                {moimReasonCodeLabel(t, c)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sam-muted">{t("admin_moim_field_ends_at")}</span>
          <input type="date" className={MOIM_ADMIN_FIELD} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <span className="text-[12px] text-sam-muted">{t("admin_moim_field_ends_at_hint")}</span>
        </label>
      </div>
    </CommunityActionSheet>
  );
}

export function MoimSanctionRevokeSheet({
  sanction,
  moimName,
  onClose,
  onSettled,
}: {
  sanction: { id: string; level: string; reason_code: string };
  moimName: string;
  onClose: () => void;
  onSettled: (k: CommunitySheetSettle) => void;
}) {
  const { t } = useI18n();
  return (
    <CommunityActionSheet
      title={t("admin_moim_sanction_revoke")}
      rows={[
        { label: t("admin_moim_col_name"), value: moimName },
        { label: t("admin_moim_col_level"), value: t(`admin_moim_level_${sanction.level}` as MessageKey) },
        { label: t("admin_moim_col_reason"), value: moimReasonCodeLabel(t, sanction.reason_code) },
      ]}
      reason={MOIM_ADMIN_REASON}
      confirmLabel={t("admin_moim_sanction_revoke")}
      onSubmit={(reason) => moimAdminSend(`/api/admin/moim/sanctions/${encodeURIComponent(sanction.id)}`, { reason }, t)}
      onClose={onClose}
      onSettled={onSettled}
    />
  );
}
