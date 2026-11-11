"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  DibayActionSheet,
  DibayBottomSheet,
  DibayConfirmDialog,
  DibayOverlayActions,
  type DibayActionSheetItem,
} from "@/components/ui/dibay-overlay";
import { moimApi } from "@/lib/moim/moim-client-api";
import type { MoimBannedDto, MoimDetailDto, MoimMemberDto } from "@/lib/moim/moim-api-types";
import { moimRoleRank, type MoimRole } from "@/lib/moim/moim-permission-contract";
import { Sam } from "@/lib/ui/sam-component-classes";
import { canOpenMoimMembers } from "./MoimManageHub";
import {
  MoimAvatar,
  MoimManageEmpty,
  MoimManageError,
  MoimManageFrame,
  MoimManageLoading,
  MoimRoleBadge,
  moimManageTextareaClass,
  moimRoleKey,
  useMoimDateFormat,
  useMoimManageToast,
  useMoimResource,
} from "./moim-manage-shared";

type Tab = "members" | "banned";
type Dialog = "actions" | "role" | "note" | "remove" | "ban" | null;
const ASSIGNABLE_ROLES: Exclude<MoimRole, "host">[] = ["co_host", "staff", "member"];

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
  const canBan = c.ban_member;
  const loadBanned = useCallback(
    () => (canBan ? moimApi.banned(moimId) : Promise.resolve({ ok: true as const, banned: [] as MoimBannedDto[] })),
    [canBan, moimId]
  );
  const banned = useMoimResource(loadBanned);

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

  /** 자기 자신·같거나 높은 역할에는 아무 동작도 보이지 않는다 (설계 §5.2) */
  const actionsFor = useCallback(
    (m: MoimMemberDto): DibayActionSheetItem[] => {
      if (moimRoleRank(m.role) >= viewerRank) return [];
      const items: DibayActionSheetItem[] = [];
      if (c.set_role)
        items.push({
          key: "role",
          label: t("moim_manage_action_role"),
          onClick: () => {
            setRoleChoice(m.role === "host" ? "member" : m.role);
            setDialog("role");
          },
        });
      if (c.write_note)
        items.push({
          key: "note",
          label: t("moim_manage_action_note"),
          onClick: () => {
            setNoteText(m.note ?? "");
            setDialog("note");
          },
        });
      if (c.remove_member)
        items.push({
          key: "remove",
          danger: true,
          label: (
            <span className="flex w-full items-center justify-between gap-2">
              <span>{t("moim_manage_action_remove")}</span>
              <span className="text-[12px] font-normal text-sam-meta">{t("moim_manage_action_remove_hint")}</span>
            </span>
          ),
          onClick: () => setDialog("remove"),
        });
      if (c.ban_member)
        items.push({
          key: "ban",
          danger: true,
          label: (
            <span className="flex w-full items-center justify-between gap-2">
              <span>{t("moim_manage_action_ban")}</span>
              <span className="text-[12px] font-normal text-sam-meta">{t("moim_manage_action_ban_hint")}</span>
            </span>
          ),
          onClick: () => {
            setBanReason("");
            setDialog("ban");
          },
        });
      return items;
    },
    [c.ban_member, c.remove_member, c.set_role, c.write_note, t, viewerRank]
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
  const memberCount = members.state.status === "ready" ? members.state.data.members.length : null;

  return (
    <>
      <div className={`${Sam.tabs.barScroll} border-b border-sam-border bg-sam-surface`} role="tablist">
        <button type="button" role="tab" aria-selected={tab === "members"} className={tabClass(tab === "members")} onClick={() => setTab("members")}>
          {memberCount != null ? t("moim_manage_members_count_tab", { count: memberCount }) : t("moim_manage_members_tab")}
        </button>
        {c.ban_member ? (
          <button type="button" role="tab" aria-selected={tab === "banned"} className={tabClass(tab === "banned")} onClick={() => setTab("banned")}>
            {t("moim_manage_banned_tab")}
          </button>
        ) : null}
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
                  <MoimAvatar url={m.avatarUrl} name={m.nickname} />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="break-all text-[15px] font-medium text-sam-fg">{m.nickname}</span>
                      <MoimRoleBadge role={m.role} />
                      {m.rejoinCount ? (
                        <span className={`${Sam.badge.neutral} whitespace-nowrap`}>{t("moim_manage_rejoin_badge", { count: m.rejoinCount })}</span>
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
                      <span aria-hidden className="shrink-0 text-sam-meta">
                        ⋯
                      </span>
                    </button>
                  ) : (
                    <div className="flex w-full items-center gap-3 px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
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
              <MoimAvatar url={b.avatarUrl} name={b.nickname} />
              <span className="min-w-0 flex-1">
                <span className="block break-all text-[15px] font-medium text-sam-fg">{b.nickname}</span>
                <span className="mt-0.5 block text-[12px] text-sam-meta">{t("moim_manage_banned_at", { date: fmt(b.createdAt) })}</span>
                {b.reason ? <span className="mt-0.5 block break-words text-[13px] text-sam-muted">{t("moim_manage_ban_reason_line", { reason: b.reason })}</span> : null}
              </span>
              <button type="button" className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} shrink-0 rounded-ui-rect`} onClick={() => setUnbanTarget(b)}>
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
            <label key={role} className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-ui-rect border px-3 ${roleChoice === role ? "border-sam-primary bg-sam-primary-soft" : "border-sam-border bg-sam-surface"}`}>
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
          className={`${moimManageTextareaClass} mt-2 min-h-[120px]`}
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
          className={`${moimManageTextareaClass} mt-1.5 min-h-[88px]`}
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
