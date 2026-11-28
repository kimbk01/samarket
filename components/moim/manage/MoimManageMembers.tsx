"use client";

import { useMoimNotificationRead } from "@/lib/moim/use-moim-notification-read";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { Ban, LogOut, MessageCircle, MoreVertical, PenLine, Star, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  DibayActionSheet,
  DibayBottomSheet,
  DibayConfirmDialog,
  DibayOverlayActions,
  type DibayActionSheetItem,
} from "@/components/ui/dibay-overlay";
import { moimApi, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MoimBannedDto, MoimDetailDto, MoimJoinRequestDto, MoimMemberDto } from "@/lib/moim/moim-api-types";
import { moimRoleRank, type MoimRole } from "@/lib/moim/moim-permission-contract";
import { Sam } from "@/lib/ui/sam-component-classes";
import { moimCls } from "@/components/moim/moim-ui";
import { useMoimDirectMessage } from "@/components/moim/use-moim-direct-message";
import { canOpenMoimMembers } from "./MoimManageHub";
import {
  MoimAvatar,
  MoimManageEmpty,
  MoimManageError,
  MoimManageFrame,
  MoimManageLoading,
  MoimRoleBadge,
  moimManageSheetRadius,
  moimManageSheetTextareaClass,
  moimRoleKey,
  useMoimDateFormat,
  useMoimManageToast,
  useMoimResource,
} from "./moim-manage-shared";

export type MoimManageMembersTab = "members" | "requests" | "banned" | "notes";
type Tab = MoimManageMembersTab;
type Dialog = "actions" | "role" | "note" | "remove" | "ban" | null;
const ASSIGNABLE_ROLES: Exclude<MoimRole, "host">[] = ["co_host", "staff", "member"];

export type MoimManageMemberTab = { key: Tab; labelKey: MessageKey; count: number | null };

/**
 * 멤버 관리 탭 (시안 U7 · R3 U7-tab-requests·banned·memo): 멤버 N · 가입 신청 N(승인 권한) · 차단 N(차단 권한) · 메모(메모 권한).
 * 수는 이미 받은 목록에서만 센다 — 아직 못 받았으면 수 없이 이름만.
 */
export function moimManageMemberTabs(x: {
  can: Pick<MoimDetailDto["can"], "decide_join" | "ban_member" | "write_note">;
  members: MoimMemberDto[] | null;
  requests: MoimJoinRequestDto[] | null;
  banned: MoimBannedDto[] | null;
}): MoimManageMemberTab[] {
  const tabs: MoimManageMemberTab[] = [
    x.members
      ? { key: "members", labelKey: "moim_manage_members_count_tab", count: x.members.length }
      : { key: "members", labelKey: "moim_manage_members_tab", count: null },
  ];
  if (x.can.decide_join)
    tabs.push(
      x.requests
        ? { key: "requests", labelKey: "moim_manage_requests_count_tab", count: x.requests.length }
        : { key: "requests", labelKey: "moim_manage_requests_title", count: null }
    );
  if (x.can.ban_member)
    tabs.push(
      x.banned
        ? { key: "banned", labelKey: "moim_manage_banned_count_tab", count: x.banned.length }
        : { key: "banned", labelKey: "moim_manage_banned_tab", count: null }
    );
  if (x.can.write_note) tabs.push({ key: "notes", labelKey: "moim_manage_notes_tab", count: null });
  return tabs;
}

/** 메모 탭 — 메모가 있는 멤버만 */
export function moimMembersWithNote(members: MoimMemberDto[]): MoimMemberDto[] {
  return members.filter((m) => (m.note ?? "").trim().length > 0);
}

/** 시트 줄 앞 아이콘 (시안 U7) — 일반 줄은 초록, 위험 줄은 글자색(빨강)을 따른다 */
function sheetLabel(Icon: LucideIcon, text: ReactNode, danger = false): ReactNode {
  return (
    <span className="flex w-full items-center gap-3">
      <Icon aria-hidden className={`h-5 w-5 shrink-0 ${danger ? "text-current" : "text-sam-primary"}`} />
      {text}
    </span>
  );
}

function MembersBody({ detail }: { detail: MoimDetailDto }) {
  const { t } = useI18n();
  const fmt = useMoimDateFormat();
  const toast = useMoimManageToast();
  const moimId = detail.id;
  const c = detail.can;
  const viewerRank = moimRoleRank(detail.viewer.role);
  const [tab, setTab] = useState<Tab>("members");

  const loadMembers = useCallback(() => moimApi.members(moimId), [moimId]);
  const members = useMoimResource(loadMembers);
  /** R2 N-06: 이 화면으로 가는 모임 알림 읽음 (정책 §2) */
  useMoimNotificationRead(`/moim/${moimId}/manage/members`, members.state.status !== "loading");
  const canBan = c.ban_member;
  const loadBanned = useCallback(
    () => (canBan ? moimApi.banned(moimId) : Promise.resolve({ ok: true as const, banned: [] as MoimBannedDto[] })),
    [canBan, moimId]
  );
  const banned = useMoimResource(loadBanned);
  /** 가입 신청 수 — 승인 권한자에게만 기존 목록 API 1회 (설계 §4 요청량) */
  const canDecide = c.decide_join;
  const loadRequests = useCallback(
    () => (canDecide ? moimApi.joinRequests(moimId) : Promise.resolve({ ok: true as const, requests: [] as MoimJoinRequestDto[] })),
    [canDecide, moimId]
  );
  const requests = useMoimResource(loadRequests);

  const [target, setTarget] = useState<MoimMemberDto | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [roleChoice, setRoleChoice] = useState<Exclude<MoimRole, "host">>("member");
  const [noteText, setNoteText] = useState("");
  const [banReason, setBanReason] = useState("");
  const [unbanTarget, setUnbanTarget] = useState<MoimBannedDto | null>(null);

  const closeAll = useCallback(() => {
    setDialog(null);
  }, []);

  const router = useRouter();
  const [myId, setMyId] = useState<string | null>(null);
  useEffect(() => setMyId(getHydrationSafeCurrentUser()?.id ?? null), []);
  /** 시안 U7 「✉ 대화하기」 (감사 F11) — 모임 공용 1:1 시작 훅 (R3 U-04 ①) */
  const { openMessage } = useMoimDirectMessage({
    onError: (message) => toast.show(message, "error"),
    onOpened: () => setDialog(null),
  });
  const openNote = useCallback((m: MoimMemberDto) => {
    setTarget(m);
    setNoteText(m.note ?? "");
    setDialog("note");
  }, []);

  /** 자기 자신에게는 아무 동작도 없다. 같거나 높은 역할에는 운영 동작 없이 「대화하기」만 (설계 §5.2 · 시안 U7) */
  const actionsFor = useCallback(
    (m: MoimMemberDto): DibayActionSheetItem[] => {
      if (myId && m.userId === myId) return [];
      const message: DibayActionSheetItem = {
        key: "message",
        label: sheetLabel(MessageCircle, t("moim_manage_action_message")),
        onClick: () => void openMessage(m.userId),
      };
      /** 「대화하기」도 권한 start_dm 을 따른다(계약 P11 · R3 Q2) — 운영 화면에 들어온 사람은 보통 운영진 이상이라 대개 보인다 */
      const messageItems = c.start_dm ? [message] : [];
      if (moimRoleRank(m.role) >= viewerRank) return myId ? messageItems : [];
      const items: DibayActionSheetItem[] = [];
      if (c.set_role)
        items.push({
          key: "role",
          label: sheetLabel(Star, t("moim_manage_action_role")),
          onClick: () => {
            setRoleChoice(m.role === "host" ? "member" : m.role);
            setDialog("role");
          },
        });
      if (c.write_note)
        items.push({
          key: "note",
          label: sheetLabel(PenLine, t("moim_manage_action_note")),
          onClick: () => openNote(m),
        });
      if (myId && c.start_dm) items.push(message);
      if (c.remove_member)
        items.push({
          key: "remove",
          danger: true,
          label: sheetLabel(
            LogOut,
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span>{t("moim_manage_action_remove")}</span>
              <span className="text-[12px] font-normal text-sam-meta">{t("moim_manage_action_remove_hint")}</span>
            </span>,
            true
          ),
          onClick: () => setDialog("remove"),
        });
      if (c.ban_member)
        items.push({
          key: "ban",
          danger: true,
          label: sheetLabel(
            Ban,
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span>{t("moim_manage_action_ban")}</span>
              <span className="text-[12px] font-normal text-sam-meta">{t("moim_manage_action_ban_hint")}</span>
            </span>,
            true
          ),
          onClick: () => {
            setBanReason("");
            setDialog("ban");
          },
        });
      return items;
    },
    [c.ban_member, c.remove_member, c.set_role, c.write_note, c.start_dm, t, viewerRank, myId, openMessage, openNote]
  );

  const run = useCallback(
    async (fn: () => ReturnType<typeof moimApi.setRole>, successKey: Parameters<typeof t>[0], after: () => void) => {
      setBusy(true);
      const r = await fn();
      setBusy(false);
      if (!r.ok) {
        toast.showError(r.error);
        return;
      }
      toast.show(t(successKey), "success");
      setDialog(null);
      after();
    },
    [t, toast]
  );

  const tabClass = (on: boolean) => `${on ? Sam.tabs.tabActive : Sam.tabs.tab} shrink-0 whitespace-nowrap px-4`;
  const tabs = moimManageMemberTabs({
    can: c,
    members: members.state.status === "ready" ? members.state.data.members : null,
    requests: requests.state.status === "ready" ? requests.state.data.requests : null,
    banned: banned.state.status === "ready" ? banned.state.data.banned : null,
  });

  return (
    <>
      {/* 탭 줄 = 진짜 탭만 tablist 안 · 「가입 신청 N」은 다른 화면으로 가는 링크라 tablist 밖 형제 (R3 재감사 P3 · ARIA) */}
      <div className={`${Sam.tabs.barScroll} border-b border-sam-border bg-sam-surface`}>
        <div className="flex" role="tablist">
          {tabs
            .filter((tb) => tb.key !== "requests")
            .map((tb) => (
              <button
                key={tb.key}
                type="button"
                role="tab"
                aria-selected={tab === tb.key}
                className={tabClass(tab === tb.key)}
                onClick={() => setTab(tb.key)}
              >
                {tb.count != null ? t(tb.labelKey, { count: tb.count }) : t(tb.labelKey)}
              </button>
            ))}
        </div>
        {tabs
          .filter((tb) => tb.key === "requests")
          .map((tb) => (
            <button key={tb.key} type="button" className={tabClass(false)} onClick={() => router.push(moimRoutes.manageRequests(moimId))}>
              {tb.count != null ? t(tb.labelKey, { count: tb.count }) : t(tb.labelKey)}
            </button>
          ))}
      </div>

      {tab === "members" ? (
        members.state.status === "loading" ? (
          <MoimManageLoading />
        ) : members.state.status === "error" ? (
          <MoimManageError errorKey={members.state.errorKey} onRetry={members.reload} />
        ) : members.state.data.members.length === 0 ? (
          <MoimManageEmpty textKey="moim_manage_members_empty" />
        ) : (
          <ul className="divide-y divide-sam-border-soft bg-sam-surface">
            {members.state.data.members.map((m) => {
              const actionable = actionsFor(m).length > 0;
              const body = (
                <>
                  <MoimAvatar url={m.avatarUrl} name={m.nickname} size={40} />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="break-all text-[15px] font-medium text-sam-fg">{m.nickname}</span>
                      <MoimRoleBadge role={m.role} />
                      {m.rejoinCount ? (
                        <span className={`${moimCls.badge} ${moimCls.badgeGray}`}>{t("moim_manage_rejoin_badge", { count: m.rejoinCount })}</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-sam-meta">
                      {m.joinedAt ? t("moim_manage_joined_at", { date: fmt(m.joinedAt) }) : null}
                      {m.note ? ` · ${t("moim_manage_has_note")}` : null}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={m.userId}>
                  {actionable ? (
                    <button
                      type="button"
                      className={`${Sam.listRow.interactive} flex w-full items-center gap-3 px-4 py-3`}
                      onClick={() => {
                        setTarget(m);
                        setDialog("actions");
                      }}
                    >
                      {body}
                      <MoreVertical aria-hidden className="h-4 w-4 shrink-0 text-sam-meta" />
                    </button>
                  ) : (
                    <div className="flex w-full items-center gap-3 px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )
      ) : tab === "notes" ? (
        members.state.status === "loading" ? (
          <MoimManageLoading />
        ) : members.state.status === "error" ? (
          <MoimManageError errorKey={members.state.errorKey} onRetry={members.reload} />
        ) : moimMembersWithNote(members.state.data.members).length === 0 ? (
          <MoimManageEmpty textKey="moim_manage_notes_empty" />
        ) : (
          <ul className="divide-y divide-sam-border-soft bg-sam-surface">
            {moimMembersWithNote(members.state.data.members).map((m) => (
              <li key={m.userId}>
                <button type="button" className={`${Sam.listRow.interactive} flex w-full items-start gap-3 px-4 py-3 text-left`} onClick={() => openNote(m)}>
                  <MoimAvatar url={m.avatarUrl} name={m.nickname} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="break-all text-[15px] font-medium text-sam-fg">{m.nickname}</span>
                      <MoimRoleBadge role={m.role} />
                    </span>
                    <span className="mt-0.5 block whitespace-pre-wrap break-words text-[13px] text-sam-muted">{m.note}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : banned.state.status === "loading" ? (
        <MoimManageLoading />
      ) : banned.state.status === "error" ? (
        <MoimManageError errorKey={banned.state.errorKey} onRetry={banned.reload} />
      ) : banned.state.data.banned.length === 0 ? (
        <MoimManageEmpty textKey="moim_manage_banned_empty" />
      ) : (
        <ul className="divide-y divide-sam-border-soft bg-sam-surface">
          {banned.state.data.banned.map((b) => (
            <li key={b.userId} className="flex items-center gap-3 px-4 py-3">
              <MoimAvatar url={b.avatarUrl} name={b.nickname} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block break-all text-[15px] font-medium text-sam-fg">{b.nickname}</span>
                <span className="mt-0.5 block text-[12px] text-sam-meta">{t("moim_manage_banned_at", { date: fmt(b.createdAt) })}</span>
                {b.reason ? <span className="mt-0.5 block break-words text-[13px] text-sam-muted">{t("moim_manage_ban_reason_line", { reason: b.reason })}</span> : null}
              </span>
              <button type="button" className={`${moimCls.btnSecondary} ${moimCls.btnSm} shrink-0`} onClick={() => setUnbanTarget(b)}>
                {t("moim_manage_unban_btn")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <DibayActionSheet
        open={dialog === "actions" && target != null}
        onClose={() => setDialog((d) => (d === "actions" ? null : d))}
        title={target?.nickname}
        items={target ? actionsFor(target) : []}
        cancelLabel={t("moim_manage_cancel_btn")}
      />

      <DibayBottomSheet
        open={dialog === "role" && target != null}
        onClose={closeAll}
        title={t("moim_manage_role_sheet_title", { name: target?.nickname ?? "" })}
        footer={
          <DibayOverlayActions
            actions={[
              { key: "cancel", label: t("moim_manage_cancel_btn"), roleTone: "secondary", onClick: closeAll },
              {
                key: "save",
                label: t("moim_manage_save_btn"),
                roleTone: "primary",
                loading: busy,
                disabled: target?.role === roleChoice,
                onClick: () => {
                  if (!target) return;
                  void run(() => moimApi.setRole(moimId, target.userId, roleChoice), "moim_manage_role_changed_toast", members.reload);
                },
              },
            ]}
          />
        }
      >
        <div role="radiogroup" className="flex flex-col gap-2">
          {ASSIGNABLE_ROLES.map((role) => (
            <label key={role} className={`flex min-h-[48px] cursor-pointer items-center gap-3 ${moimManageSheetRadius} border px-3 ${roleChoice === role ? "border-sam-primary bg-sam-primary-soft" : "border-sam-border bg-sam-surface"}`}>
              <input type="radio" name="moim-role" className="accent-[color:var(--sam-primary)]" checked={roleChoice === role} onChange={() => setRoleChoice(role)} />
              <span className="text-[15px] text-sam-fg">{t(moimRoleKey(role))}</span>
              {target?.role === role ? <span className="ml-auto text-[12px] text-sam-meta">{t("moim_manage_current_role")}</span> : null}
            </label>
          ))}
        </div>
      </DibayBottomSheet>

      <DibayBottomSheet
        open={dialog === "note" && target != null}
        onClose={closeAll}
        title={t("moim_manage_note_sheet_title", { name: target?.nickname ?? "" })}
        footer={
          <DibayOverlayActions
            actions={[
              { key: "cancel", label: t("moim_manage_cancel_btn"), roleTone: "secondary", onClick: closeAll },
              {
                key: "save",
                label: t("moim_manage_save_btn"),
                roleTone: "primary",
                loading: busy,
                onClick: () => {
                  if (!target) return;
                  void run(() => moimApi.setNote(moimId, target.userId, noteText), "moim_manage_note_saved_toast", members.reload);
                },
              },
            ]}
          />
        }
      >
        <p className="text-[13px] text-sam-muted">{t("moim_manage_note_hint")}</p>
        <textarea
          className={`${moimManageSheetTextareaClass} mt-2 min-h-[120px]`}
          maxLength={1000}
          value={noteText}
          placeholder={t("moim_manage_note_placeholder")}
          onChange={(e) => setNoteText(e.target.value)}
        />
      </DibayBottomSheet>

      <DibayConfirmDialog
        open={dialog === "remove" && target != null}
        title={t("moim_manage_remove_confirm_title", { name: target?.nickname ?? "" })}
        description={t("moim_manage_remove_confirm_body")}
        cancelLabel={t("moim_manage_cancel_btn")}
        confirmLabel={t("moim_manage_remove_btn")}
        confirmTone="destructive"
        busy={busy}
        onCancel={closeAll}
        onConfirm={() => {
          if (!target) return;
          void run(() => moimApi.removeMember(moimId, target.userId, false), "moim_manage_removed_toast", members.reload);
        }}
      />

      <DibayBottomSheet
        open={dialog === "ban" && target != null}
        onClose={closeAll}
        title={t("moim_manage_ban_confirm_title", { name: target?.nickname ?? "" })}
        footer={
          <DibayOverlayActions
            actions={[
              { key: "cancel", label: t("moim_manage_cancel_btn"), roleTone: "secondary", onClick: closeAll },
              {
                key: "ban",
                label: t("moim_manage_ban_btn"),
                roleTone: "destructive",
                loading: busy,
                onClick: () => {
                  if (!target) return;
                  const why = banReason.trim();
                  void run(() => moimApi.removeMember(moimId, target.userId, true, why || null), "moim_manage_banned_toast", () => {
                    members.reload();
                    banned.reload();
                  });
                },
              },
            ]}
          />
        }
      >
        <p className="text-[14px] text-sam-fg">{t("moim_manage_ban_confirm_body")}</p>
        <label className="mt-3 block text-[13px] font-medium text-sam-muted" htmlFor="moim-ban-reason">
          {t("moim_manage_reason_optional_label")}
        </label>
        <textarea
          id="moim-ban-reason"
          className={`${moimManageSheetTextareaClass} mt-1.5 min-h-[88px]`}
          maxLength={300}
          value={banReason}
          placeholder={t("moim_manage_ban_reason_placeholder")}
          onChange={(e) => setBanReason(e.target.value)}
        />
      </DibayBottomSheet>

      <DibayConfirmDialog
        open={unbanTarget != null}
        title={t("moim_manage_unban_confirm_title", { name: unbanTarget?.nickname ?? "" })}
        description={t("moim_manage_unban_confirm_body")}
        cancelLabel={t("moim_manage_cancel_btn")}
        confirmLabel={t("moim_manage_unban_btn")}
        busy={busy}
        onCancel={() => setUnbanTarget(null)}
        onConfirm={() => {
          const b = unbanTarget;
          if (!b) return;
          void (async () => {
            setBusy(true);
            const r = await moimApi.unban(moimId, b.userId);
            setBusy(false);
            if (!r.ok) {
              toast.showError(r.error);
              return;
            }
            setUnbanTarget(null);
            toast.show(t("moim_manage_unbanned_toast"), "success");
            banned.reload();
          })();
        }}
      />
      {toast.node}
    </>
  );
}

export function MoimManageMembers({ moimId }: { moimId: string }) {
  return (
    <MoimManageFrame moimId={moimId} titleKey="moim_manage_members_title" allow={canOpenMoimMembers}>
      {({ detail }) => <MembersBody detail={detail} />}
    </MoimManageFrame>
  );
}
