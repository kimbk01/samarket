"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";
import type { MessageKey } from "@/lib/i18n/messages";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import { moimApi, moimErrorKey, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimDetailDto, MoimInviteLinkDto } from "@/lib/moim/moim-api-types";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  MoimAvatar,
  MoimManageEmpty,
  MoimManageError,
  MoimManageFrame,
  MoimManageLoading,
  moimManageCardClass,
  moimManageInputClass,
  moimManageSectionTitleClass,
  useMoimDateFormat,
  useMoimManageToast,
  useMoimResource,
} from "./moim-manage-shared";

const EXPIRY_OPTIONS: { days: number | null; key: MessageKey }[] = [
  { days: null, key: "moim_manage_invite_expiry_none_chip" },
  { days: 1, key: "moim_manage_invite_expiry_1d_chip" },
  { days: 7, key: "moim_manage_invite_expiry_7d_chip" },
  { days: 30, key: "moim_manage_invite_expiry_30d_chip" },
];

type Toast = ReturnType<typeof useMoimManageToast>;

function inviteUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${moimRoutes.inviteLanding(token)}`;
}

function InviteLinks({ detail, toast }: { detail: MoimDetailDto; toast: Toast }) {
  const { t } = useI18n();
  const fmt = useMoimDateFormat();
  const load = useCallback(() => moimApi.inviteLinks(detail.id), [detail.id]);
  const { state, reload } = useMoimResource(load);
  const [expiryDays, setExpiryDays] = useState<number | null>(7);
  const [busy, setBusy] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<MoimInviteLinkDto | null>(null);
  const [now, setNow] = useState(0);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setNow(Date.now());
      setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    }, 0);
    return () => clearTimeout(id);
  }, [state]);

  const create = async () => {
    setBusy(true);
    const expiresAt = expiryDays == null ? null : new Date(Date.now() + expiryDays * 86_400_000).toISOString();
    const r = await moimApi.createInviteLink(detail.id, expiresAt);
    setBusy(false);
    if (!r.ok) return toast.showError(r.error);
    toast.show(t("moim_manage_invite_created_toast"), "success");
    reload();
  };

  const copy = async (link: MoimInviteLinkDto) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(link.token));
      toast.show(t("moim_manage_invite_copied_toast"), "success");
    } catch {
      toast.show(t("moim_manage_copy_failed_toast"), "error");
    }
  };

  const share = async (link: MoimInviteLinkDto) => {
    try {
      await navigator.share({ title: detail.name, text: t("moim_manage_invite_share_text", { name: detail.name }), url: inviteUrl(link.token) });
    } catch {
      /* closed by the user */
    }
  };

  const revoke = async () => {
    const link = revokeTarget;
    if (!link) return;
    setBusy(true);
    const r = await moimApi.revokeInviteLink(link.id);
    setBusy(false);
    if (!r.ok) return toast.showError(r.error);
    setRevokeTarget(null);
    toast.show(t("moim_manage_invite_revoked_toast"), "success");
    reload();
  };

  return (
    <section>
      <h2 className={moimManageSectionTitleClass}>{t("moim_manage_invite_links_title")}</h2>
      <div className={`${moimManageCardClass} mx-4 p-4`}>
        <p className="text-[13px] font-medium text-sam-muted">{t("moim_manage_invite_expiry_label")}</p>
        <div className="-mx-1 mt-2 flex flex-nowrap gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup">
          {EXPIRY_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={expiryDays === o.days}
              className={`${expiryDays === o.days ? Sam.chip.activeCombo : Sam.chip.inactiveCombo} shrink-0 whitespace-nowrap rounded-ui-rect`}
              onClick={() => setExpiryDays(o.days)}
            >
              {t(o.key)}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={busy}
          className={`${Sam.btn.primaryCombo} ${Sam.btn.block} ${Sam.btn.disabledToken} mt-3 rounded-ui-rect`}
          onClick={() => void create()}
        >
          {t("moim_manage_invite_create_btn")}
        </button>
        <p className="mt-2 text-[12px] text-sam-meta">{t("moim_manage_invite_approval_note")}</p>
      </div>

      {state.status === "loading" ? <MoimManageLoading /> : null}
      {state.status === "error" ? <MoimManageError errorKey={state.errorKey} onRetry={reload} /> : null}
      {state.status === "ready" && state.data.links.length === 0 ? <MoimManageEmpty textKey="moim_manage_invite_links_empty" /> : null}
      {state.status === "ready" && state.data.links.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2 px-4">
          {state.data.links.map((link) => {
            const expired = link.expiresAt != null && now > 0 && new Date(link.expiresAt).getTime() <= now;
            return (
              <li key={link.id} className={`${moimManageCardClass} p-3`}>
                <p className="break-all text-[13px] text-sam-fg">{inviteUrl(link.token)}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-sam-meta">
                  <span>{t("moim_manage_invite_usage", { count: link.usageCount })}</span>
                  <span>·</span>
                  <span>
                    {link.expiresAt ? t("moim_manage_invite_expires_at", { date: fmt(link.expiresAt) }) : t("moim_manage_invite_expiry_none_chip")}
                  </span>
                  {expired ? <span className={`${Sam.badge.neutral} whitespace-nowrap`}>{t("moim_manage_invite_expired_badge")}</span> : null}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {!expired ? (
                    <>
                      <button type="button" className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} rounded-ui-rect`} onClick={() => void copy(link)}>
                        {t("moim_manage_invite_copy_btn")}
                      </button>
                      {canShare ? (
                        <button type="button" className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} rounded-ui-rect`} onClick={() => void share(link)}>
                          {t("moim_manage_invite_share_btn")}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  <button type="button" className={`${Sam.btn.ghostCombo} ${Sam.btn.sm} rounded-ui-rect text-sam-danger`} onClick={() => setRevokeTarget(link)}>
                    {t("moim_manage_invite_revoke_btn")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <DibayConfirmDialog
        open={revokeTarget != null}
        title={t("moim_manage_invite_revoke_confirm_title")}
        description={t("moim_manage_invite_revoke_confirm_body")}
        cancelLabel={t("moim_manage_cancel_btn")}
        confirmLabel={t("moim_manage_invite_revoke_btn")}
        confirmTone="destructive"
        busy={busy}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => void revoke()}
      />
    </section>
  );
}

type FriendsResult = { friends: CommunityMessengerProfileLite[] };

/** 메신저 친구 목록 — 메신저 친구 탭과 같은 주소(/api/community-messenger/friends) */
async function loadMessengerFriends(): Promise<{ ok: true; friends: CommunityMessengerProfileLite[] } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/community-messenger/friends", { cache: "no-store", credentials: "include" });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; friends?: CommunityMessengerProfileLite[] } | null;
    if (!res.ok || !j?.ok || !Array.isArray(j.friends)) return { ok: false, error: "moim_unknown" };
    return { ok: true, friends: j.friends };
  } catch {
    return { ok: false, error: "moim_unknown" };
  }
}

type SendResult = { ok: true } | { ok: false; key: MessageKey };

function FriendInvite({ detail, toast }: { detail: MoimDetailDto; toast: Toast }) {
  const { t } = useI18n();
  const load = useCallback(() => loadMessengerFriends(), []);
  const { state, reload } = useMoimResource<FriendsResult>(load);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [results, setResults] = useState<Record<string, SendResult>>({});
  const [sending, setSending] = useState(false);

  const friends = useMemo(() => {
    if (state.status !== "ready") return [];
    const q = query.trim().toLowerCase();
    return state.data.friends
      .filter((f) => f.isFriend && !f.blocked)
      .filter((f) => !q || f.label.toLowerCase().includes(q));
  }, [query, state]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setSending(true);
    let okCount = 0;
    for (const id of ids) {
      const r = await moimApi.sendInvite(detail.id, id);
      if (r.ok) okCount += 1;
      setResults((prev) => ({ ...prev, [id]: r.ok ? { ok: true } : { ok: false, key: moimErrorKey(r.error) } }));
      if (!r.ok && r.error === "moim_phone_verification_required") break;
    }
    setSending(false);
    setSelected(new Set());
    if (okCount > 0) toast.show(t("moim_manage_invite_sent_toast", { count: okCount }), "success");
  };

  return (
    <section>
      <h2 className={moimManageSectionTitleClass}>{t("moim_manage_invite_friends_title")}</h2>
      <p className="px-4 pb-2 text-[12px] text-sam-meta">{t("moim_manage_invite_friends_note")}</p>
      <div className="px-4">
        <input
          type="search"
          className={moimManageInputClass}
          value={query}
          placeholder={t("moim_manage_invite_friends_search_placeholder")}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {state.status === "loading" ? <MoimManageLoading /> : null}
      {state.status === "error" ? <MoimManageError errorKey="moim_manage_invite_friends_error" onRetry={reload} /> : null}
      {state.status === "ready" && friends.length === 0 ? <MoimManageEmpty textKey="moim_manage_invite_friends_empty" /> : null}
      {friends.length > 0 ? (
        <ul className={`${moimManageCardClass} mx-4 mt-3 divide-y divide-sam-border-soft`}>
          {friends.map((f) => {
            const res = results[f.id];
            const checked = selected.has(f.id);
            return (
              <li key={f.id}>
                <label className="flex min-h-[56px] cursor-pointer items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-[color:var(--sam-primary)]"
                    checked={checked}
                    disabled={sending || res?.ok === true}
                    onChange={() => toggle(f.id)}
                  />
                  <MoimAvatar url={f.avatarUrl} name={f.label} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-all text-[15px] text-sam-fg">{f.label}</span>
                    {res ? (
                      <span className={`block text-[12px] ${res.ok ? "text-sam-success" : "text-sam-danger"}`}>
                        {res.ok ? t("moim_manage_invite_result_sent") : t(res.key)}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="px-4 pt-3">
        <button
          type="button"
          disabled={sending || selected.size === 0}
          className={`${Sam.btn.primaryCombo} ${Sam.btn.block} ${Sam.btn.disabledToken} rounded-ui-rect`}
          onClick={() => void send()}
        >
          {t("moim_manage_invite_send_btn", { count: selected.size })}
        </button>
      </div>
    </section>
  );
}

function InviteBody({ detail }: { detail: MoimDetailDto }) {
  const toast = useMoimManageToast();
  return (
    <div className="flex flex-col gap-4 pb-6">
      {detail.can.manage_invite_link ? <InviteLinks detail={detail} toast={toast} /> : null}
      {detail.can.send_invite ? <FriendInvite detail={detail} toast={toast} /> : null}
      {toast.node}
    </div>
  );
}

export function MoimManageInvite({ moimId }: { moimId: string }) {
  return (
    <MoimManageFrame moimId={moimId} titleKey="moim_manage_invite_title" allow={(d) => d.can.manage_invite_link || d.can.send_invite}>
      {({ detail }) => <InviteBody detail={detail} />}
    </MoimManageFrame>
  );
}
