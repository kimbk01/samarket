"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog } from "@/components/ui/dibay-overlay/DibayDialog";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
import { MessengerFriendTabSectionLabel } from "@/components/community-messenger/friend-list/CommunityMessengerFriendSection";
import { MessengerContactsSubHeader } from "@/components/community-messenger/contacts/MessengerContactsSubHeader";
import { MESSENGER_ROW_BTN_CLASS } from "@/components/community-messenger/friend-cta/MessengerFriendRelationCta";
import { Sam } from "@/lib/ui/sam-component-classes";
import { ensureClientInstanceId, getBoundAuthUserId } from "@/lib/auth/client-instance-id";
import { contactsApi, type ContactsUserSettingsDto } from "@/lib/community-messenger/contacts/contacts-api-client";
import {
  CONTACTS_CALL_DEFAULTS,
  CONTACTS_DISCOVERY_POLICIES,
  type ContactsCallDefault,
  type ContactsDiscoveryPolicy,
} from "@/lib/community-messenger/contacts/contacts-contract";
import { clearContactsDeviceData, patchContactsLocalState } from "@/lib/community-messenger/contacts/contacts-local-store";
import { invalidateMessengerContactsCache } from "@/lib/community-messenger/contacts/use-messenger-contacts";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { formatRelativeTimeAgo } from "@/lib/i18n/format-relative-time";
import type { MessageKey } from "@/lib/i18n/messages";

type SourceRow = {
  id: string;
  platform: "android" | "ios";
  syncEnabled: boolean;
  lastUsedAt: string;
  entryCount: number;
  isThisDevice: boolean;
};
type Hidden = { userId: string; reason: "hidden" | "former_friend"; createdAt: string; nickname: string | null; avatarUrl: string | null };
type Confirm = { kind: "device" | "this" | "all" | "withdraw"; sourceId?: string } | null;

const CALL_DEFAULT_KEY: Record<ContactsCallDefault, MessageKey> = {
  ask: "cm_contacts_call_default_ask",
  dibay: "cm_contacts_call_default_dibay",
  phone: "cm_contacts_call_default_phone",
};

const POLICY_KEY: Record<ContactsDiscoveryPolicy, MessageKey> = {
  everyone: "cm_contacts_policy_everyone",
  mutual: "cm_contacts_policy_mutual",
  nobody: "cm_contacts_policy_nobody",
};

function Toggle({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-sam-primary" : "bg-[color:var(--cm-chat-band)]"}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function Row({ title, desc, right, danger, onClick }: { title: string; desc?: string; right?: ReactNode; danger?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] leading-[1.35]" style={{ color: danger ? "var(--sam-danger)" : "var(--cm-chat-fg)" }}>
          {title}
        </span>
        {desc ? (
          <span className="mt-px block text-[12.5px] leading-snug" style={{ color: "var(--cm-chat-sub)" }}>
            {desc}
          </span>
        ) : null}
      </span>
      {right}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left active:bg-[color:var(--cm-chat-band)]">
      {body}
    </button>
  ) : (
    <div className="flex min-h-[56px] items-center gap-3 px-4 py-2">{body}</div>
  );
}

/** 연락처 동기화 설정 (통합 시안 8·8b · SSOT v5 §8) — 계정 전체 / 기기별 / 숨긴 추천 / 삭제·철회 */
export function MessengerContactsSettingsScreen() {
  const { t, language } = useI18n();
  const router = useRouter();
  const userId = getBoundAuthUserId() ?? "";
  const [settings, setSettings] = useState<ContactsUserSettingsDto | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [hidden, setHidden] = useState<Hidden[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [disabled, setDisabled] = useState(false);

  const load = useCallback(async () => {
    const [s, src, h] = await Promise.all([contactsApi.settings(), contactsApi.sources(ensureClientInstanceId()), contactsApi.suppressions()]);
    if (!s.ok) {
      setDisabled(true);
      return;
    }
    setSettings(s.data.settings);
    if (src.ok) setSources(src.data.sources);
    if (h.ok) setHidden(h.data.suppressions);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<{ ok: boolean }>) => {
    setBusy(key);
    const r = await fn().catch(() => ({ ok: false }));
    setBusy(null);
    invalidateMessengerContactsCache();
    if (!r.ok) showMessengerSnackbar(t("cm_contacts_action_failed"), { variant: "error" });
    await load();
    return r.ok;
  };

  const date = (iso: string) => formatRelativeTimeAgo(iso, language);
  const thisSource = sources.find((s) => s.isThisDevice) ?? null;

  const runConfirm = async () => {
    if (!confirm) return;
    const c = confirm;
    if (c.kind === "device" && c.sourceId) await act("confirm", () => contactsApi.deleteSource(c.sourceId!));
    if (c.kind === "this" && thisSource) {
      const ok = await act("confirm", () => contactsApi.deleteSource(thisSource.id));
      if (ok && userId) clearContactsDeviceData(userId);
    }
    if (c.kind === "all") {
      const ok = await act("confirm", () => contactsApi.deleteAll());
      if (ok && userId) clearContactsDeviceData(userId);
    }
    if (c.kind === "withdraw") {
      const ok = await act("confirm", () => contactsApi.withdraw());
      if (ok && userId) {
        clearContactsDeviceData(userId);
        patchContactsLocalState(userId, { consented: false, members: [], friendIds: [], listToken: null });
        router.back();
      }
    }
    setConfirm(null);
  };

  const confirmText: Record<NonNullable<Confirm>["kind"], { title: MessageKey; desc: MessageKey }> = {
    device: { title: "cm_contacts_device_delete", desc: "cm_contacts_delete_this_device_desc" },
    this: { title: "cm_contacts_delete_this_device", desc: "cm_contacts_delete_this_device_desc" },
    all: { title: "cm_contacts_delete_all", desc: "cm_contacts_delete_all_desc" },
    withdraw: { title: "cm_contacts_withdraw", desc: "cm_contacts_withdraw_desc" },
  };

  return (
    <div className="flex min-h-full flex-col bg-[color:var(--cm-chat-bg,#fff)]" data-cm-contacts-settings="">
      <MessengerContactsSubHeader title={t("cm_contacts_settings_title")} />
      {disabled ? (
        <p className="px-4 py-10 text-center text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
          {t("cm_contacts_feature_off")}
        </p>
      ) : null}
      {settings ? (
        <>
          <MessengerFriendTabSectionLabel title={t("cm_contacts_settings_account")} />
          <Row
            title={t("cm_contacts_settings_account_sync")}
            desc={t("cm_contacts_settings_account_sync_desc")}
            right={
              <Toggle
                label={t("cm_contacts_settings_account_sync")}
                checked={settings.accountSyncEnabled}
                disabled={busy !== null}
                onChange={(v) => void act("acc", () => contactsApi.patchSettings({ accountSyncEnabled: v }))}
              />
            }
          />
          <div className="flex min-h-[56px] items-center gap-3 px-4 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[16px]" style={{ color: "var(--cm-chat-fg)" }}>
                {t("cm_contacts_settings_discovery")}
              </span>
              <span className="block text-[12.5px]" style={{ color: "var(--cm-chat-sub)" }}>
                {settings.hasVerifiedPhone ? t("cm_contacts_settings_discovery_desc") : t("cm_contacts_settings_no_phone")}
              </span>
            </span>
            <select
              aria-label={t("cm_contacts_settings_discovery")}
              className="h-10 rounded-ui-rect border border-[color:var(--messenger-divider)] bg-white px-2 text-[14px]"
              value={settings.discoveryPolicy}
              disabled={busy !== null || !settings.hasVerifiedPhone}
              onChange={(e) => void act("policy", () => contactsApi.patchSettings({ discoveryPolicy: e.target.value as ContactsDiscoveryPolicy }))}
            >
              {CONTACTS_DISCOVERY_POLICIES.map((p) => (
                <option key={p} value={p}>
                  {t(POLICY_KEY[p])}
                </option>
              ))}
            </select>
          </div>
          <Row
            title={t("cm_contacts_settings_join_notice")}
            right={
              <Toggle
                label={t("cm_contacts_settings_join_notice")}
                checked={settings.joinNotifyEnabled}
                disabled={busy !== null}
                onChange={(v) => void act("join", () => contactsApi.patchSettings({ joinNotifyEnabled: v }))}
              />
            }
          />

          {/* 기본 통화 방식 (4단계 C2) */}
          <div className="flex min-h-[56px] items-center gap-3 px-4 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[16px]" style={{ color: "var(--cm-chat-fg)" }}>
                {t("cm_contacts_settings_call_default")}
              </span>
              <span className="block text-[12.5px]" style={{ color: "var(--cm-chat-sub)" }}>
                {t("cm_contacts_settings_call_default_desc")}
              </span>
            </span>
            <select
              aria-label={t("cm_contacts_settings_call_default")}
              className="h-10 rounded-ui-rect border border-[color:var(--messenger-divider)] bg-white px-2 text-[14px]"
              value={settings.callDefault}
              disabled={busy !== null}
              onChange={(e) => void act("call", () => contactsApi.patchSettings({ callDefault: e.target.value as ContactsCallDefault }))}
            >
              {CONTACTS_CALL_DEFAULTS.map((c) => (
                <option key={c} value={c}>
                  {t(CALL_DEFAULT_KEY[c])}
                </option>
              ))}
            </select>
          </div>

          <MessengerFriendTabSectionLabel title={t("cm_contacts_settings_devices")} />
          {sources.map((s) => (
            <Row
              key={s.id}
              title={`${t(s.platform === "ios" ? "cm_contacts_device_ios" : "cm_contacts_device_android")}${s.isThisDevice ? ` · ${t("cm_contacts_device_this")}` : ""}`}
              desc={t("cm_contacts_device_meta", { time: date(s.lastUsedAt), count: s.entryCount })}
              right={
                s.isThisDevice ? (
                  <Toggle
                    label={t("cm_contacts_device_sync")}
                    checked={s.syncEnabled}
                    disabled={busy !== null}
                    onChange={(v) => void act("dev", () => contactsApi.patchSource(s.id, { installId: ensureClientInstanceId(), syncEnabled: v }))}
                  />
                ) : (
                  <button
                    type="button"
                    className={`${Sam.btn.secondaryCombo} ${MESSENGER_ROW_BTN_CLASS} !text-[color:var(--sam-danger)]`}
                    onClick={() => setConfirm({ kind: "device", sourceId: s.id })}
                  >
                    {t("cm_contacts_device_delete")}
                  </button>
                )
              }
            />
          ))}
          <p className="px-4 pb-2 text-[12px]" style={{ color: "var(--cm-chat-sub)" }}>
            {thisSource ? t("cm_contacts_device_sync_desc") + " · " : ""}
            {t("cm_contacts_idle_note")}
          </p>
          {thisSource ? (
            <Row title={t("cm_contacts_delete_this_device")} desc={t("cm_contacts_delete_this_device_desc")} danger onClick={() => setConfirm({ kind: "this" })} />
          ) : null}
          <Row title={t("cm_contacts_delete_all")} desc={t("cm_contacts_delete_all_desc")} danger onClick={() => setConfirm({ kind: "all" })} />
          <Row title={t("cm_contacts_withdraw")} desc={t("cm_contacts_withdraw_desc")} danger onClick={() => setConfirm({ kind: "withdraw" })} />

          <MessengerFriendTabSectionLabel title={t("cm_contacts_hidden_title")} count={hidden.length} />
          {hidden.length === 0 ? (
            <p className="px-4 py-4 text-[13px]" style={{ color: "var(--cm-chat-sub)" }}>
              {t("cm_contacts_hidden_empty")}
            </p>
          ) : (
            hidden.map((h) => (
              <div key={h.userId} className="flex min-h-[64px] items-center gap-3 px-4">
                <SamarketUserAvatarThumb avatarUrl={h.avatarUrl} size={44} roundedClassName="rounded-[16px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold" style={{ color: "var(--cm-chat-fg)" }}>
                    {h.nickname ?? ""}
                  </span>
                  <span className="block text-[12.5px]" style={{ color: "var(--cm-chat-sub)" }}>
                    {t(h.reason === "hidden" ? "cm_contacts_hidden_reason_hidden" : "cm_contacts_hidden_reason_former", { date: date(h.createdAt) })}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy !== null}
                  className={`${Sam.btn.secondaryCombo} ${MESSENGER_ROW_BTN_CLASS}`}
                  onClick={() => void act(`un:${h.userId}`, () => contactsApi.unsuppress(h.userId))}
                >
                  {t("cm_contacts_show_again")}
                </button>
              </div>
            ))
          )}
        </>
      ) : null}
      <DibayDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? t(confirmText[confirm.kind].title) : ""}
        description={confirm ? t(confirmText[confirm.kind].desc) : undefined}
        actions={[
          { key: "cancel", label: t("cm_contacts_cancel"), roleTone: "secondary", onClick: () => setConfirm(null), disabled: busy === "confirm" },
          { key: "ok", label: t("cm_contacts_delete"), roleTone: "destructive", onClick: () => void runConfirm(), loading: busy === "confirm" },
        ]}
      />
    </div>
  );
}
