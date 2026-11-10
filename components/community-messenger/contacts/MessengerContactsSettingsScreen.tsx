"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog } from "@/components/ui/dibay-overlay/DibayDialog";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import { NavRow, SectionLabel, SwitchRow } from "@/components/community-messenger/settings/MessengerSettingsRows";
import { useMessengerContactsHeader } from "@/components/community-messenger/contacts/use-messenger-contacts-header";
import { MessengerContactsLoading, MessengerContactsRetry } from "@/components/community-messenger/contacts/MessengerContactsStatus";
import { MESSENGER_ROW_BTN_CLASS } from "@/components/community-messenger/friend-cta/MessengerFriendRelationCta";
import { Sam } from "@/lib/ui/sam-component-classes";
import { ensureClientInstanceId, getBoundAuthUserId } from "@/lib/auth/client-instance-id";
import { contactsApi, type ContactsUserSettingsDto } from "@/lib/community-messenger/contacts/contacts-api-client";
import {
  CONTACTS_CALL_DEFAULTS,
  CONTACTS_DISCOVERY_POLICIES,
  MESSENGER_CONTACTS_BACK_HREF,
  MESSENGER_CONTACTS_SCREEN_HREF,
  type ContactsCallDefault,
  type ContactsDiscoveryPolicy,
} from "@/lib/community-messenger/contacts/contacts-contract";
import {
  clearContactsDeviceData,
  clearContactsStop,
  markContactsStopped,
  patchContactsLocalState,
} from "@/lib/community-messenger/contacts/contacts-local-store";
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
type Confirm = { kind: "device" | "this" | "all" | "withdraw" | "showAgain"; sourceId?: string; userId?: string } | null;
type Choice = "policy" | "call" | null;

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

const CONFIRM_TEXT: Record<NonNullable<Confirm>["kind"], { title: MessageKey; desc: MessageKey }> = {
  device: { title: "cm_contacts_device_delete", desc: "cm_contacts_device_delete_desc" },
  this: { title: "cm_contacts_delete_this_device", desc: "cm_contacts_delete_this_device_desc" },
  all: { title: "cm_contacts_delete_all", desc: "cm_contacts_delete_all_desc" },
  withdraw: { title: "cm_contacts_withdraw", desc: "cm_contacts_withdraw_desc" },
  showAgain: { title: "cm_contacts_show_again_confirm_title", desc: "cm_contacts_show_again_confirm_desc" },
};

/** 고르기 시트 (번호로 나를 찾기 · 기본 통화 방식) — 한 줄 52 · 고른 줄 ✓ */
function ChoiceSheet<T extends string>({
  title,
  options,
  value,
  labelOf,
  onPick,
  onClose,
}: {
  title: string;
  options: readonly T[];
  value: T;
  labelOf: (v: T) => string;
  onPick: (v: T) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <MessengerHomeBottomSheetShell onClose={onClose} closeAriaLabel={t("cm_contacts_cancel")} anchor="fit-content" dialogAriaLabel={title}>
      <div className="pb-[max(1rem,var(--safe-bottom))] pt-4" role="radiogroup" aria-label={title}>
        <p className="px-4 pb-2 text-[16px] font-semibold" style={{ color: "var(--overlay-text-primary)" }}>
          {title}
        </p>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={o === value}
            onClick={() => onPick(o)}
            className="flex min-h-[52px] w-full items-center justify-between gap-3 border-t border-[color:var(--overlay-border)] px-4 text-left text-[15px]"
            style={{ color: "var(--overlay-text-primary)" }}
          >
            {labelOf(o)}
            {o === value ? <Check className="h-5 w-5 text-sam-primary" aria-hidden /> : null}
          </button>
        ))}
      </div>
    </MessengerHomeBottomSheetShell>
  );
}

/**
 * 연락처 동기화 설정 (통합 시안 「연락처 동기화」 · SSOT v5 §8) — 계정 전체 / 기기별 / 삭제·철회 / 숨긴 추천.
 * 줄 모양은 채팅 설정과 같은 SSOT(`MessengerSettingsRows`). 기능이 꺼져도(어드민) 동의한 회원은 삭제·철회만 할 수 있다.
 */
export function MessengerContactsSettingsScreen() {
  const { t, language } = useI18n();
  const router = useRouter();
  const userId = getBoundAuthUserId() ?? "";
  const [settings, setSettings] = useState<ContactsUserSettingsDto | null>(null);
  const [featureOn, setFeatureOn] = useState(true);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [hidden, setHidden] = useState<Hidden[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [choice, setChoice] = useState<Choice>(null);

  useMessengerContactsHeader({
    titleKey: "cm_contacts_settings_title",
    backHref: MESSENGER_CONTACTS_SCREEN_HREF,
    subtitle: null,
    actions: null,
  });

  const load = useCallback(async () => {
    const s = await contactsApi.settings();
    if (!s.ok) {
      setStatus("error");
      return;
    }
    const on = s.data.featureEnabled !== false;
    setFeatureOn(on);
    setSettings(s.data.settings);
    const [src, h] = await Promise.all([
      contactsApi.sources(ensureClientInstanceId()),
      on ? contactsApi.suppressions() : Promise.resolve(null),
    ]);
    if (src.ok) setSources(src.data.sources);
    if (h?.ok) setHidden(h.data.suppressions);
    setStatus("ready");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 처리 → 결과 안내. 설정 값 하나 바꿀 때는 화면 값만 고치고(`onOk`), 기기·목록이 바뀌는 처리만 다시 불러온다
   * (켜고 끌 때마다 3개 API 다시 부르기 금지 — 최종 점검 #12).
   */
  const act = async (
    key: string,
    fn: () => Promise<{ ok: boolean }>,
    done: MessageKey,
    opts: { onOk?: () => void; reload?: boolean } = {}
  ) => {
    setBusy(key);
    const r = await fn().catch(() => ({ ok: false }));
    setBusy(null);
    invalidateMessengerContactsCache();
    showMessengerSnackbar(r.ok ? t(done) : t("cm_contacts_action_failed"), r.ok ? undefined : { variant: "error" });
    if (r.ok) opts.onOk?.();
    if (opts.reload !== false || !r.ok) await load();
    return r.ok;
  };
  const patchSettingsLocal = (patch: Partial<ContactsUserSettingsDto>) => setSettings((cur) => (cur ? { ...cur, ...patch } : cur));

  // 관리 「숨긴 추천」 줄로 들어오면 숨긴 추천 묶음으로 (시안 hidden — 최종 점검 #17)
  useEffect(() => {
    if (status !== "ready" || typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("focus") !== "hidden") return;
    document.getElementById("cm-contacts-hidden")?.scrollIntoView({ block: "start" });
  }, [status]);

  const date = (iso: string) => formatRelativeTimeAgo(iso, language);
  const thisSource = sources.find((s) => s.isThisDevice) ?? null;
  const otherSources = sources.filter((s) => !s.isThisDevice);
  const deviceTitle = (s: SourceRow) =>
    `${t(s.platform === "ios" ? "cm_contacts_device_ios" : "cm_contacts_device_android")}${s.isThisDevice ? ` · ${t("cm_contacts_device_this")}` : ""}`;

  const runConfirm = async () => {
    if (!confirm) return;
    const c = confirm;
    if (c.kind === "showAgain" && c.userId) {
      const id = c.userId;
      await act("confirm", () => contactsApi.unsuppress(id), "cm_contacts_shown_again", {
        reload: false,
        onOk: () => setHidden((cur) => cur.filter((x) => x.userId !== id)),
      });
    }
    if (c.kind === "device" && c.sourceId) await act("confirm", () => contactsApi.deleteSource(c.sourceId!), "cm_contacts_deleted");
    if (c.kind === "this" && thisSource) {
      const ok = await act("confirm", () => contactsApi.deleteSource(thisSource.id), "cm_contacts_deleted");
      if (ok && userId) clearContactsDeviceData(userId);
    }
    if (c.kind === "all") {
      const ok = await act("confirm", () => contactsApi.deleteAll(), "cm_contacts_deleted");
      if (ok && userId) clearContactsDeviceData(userId);
    }
    if (c.kind === "withdraw") {
      const ok = await act("confirm", () => contactsApi.withdraw(), "cm_contacts_withdrawn_done", { reload: false });
      if (ok && userId) {
        clearContactsDeviceData(userId);
        patchContactsLocalState(userId, { consented: false });
        setConfirm(null);
        router.replace(MESSENGER_CONTACTS_BACK_HREF);
        return;
      }
    }
    setConfirm(null);
  };

  /**
   * 켜고 끄기는 서버 저장이 끝나면 이 기기 상태도 같은 값으로 맞춘다:
   * 끄면 바로 멈춤(연락처를 읽지도 올리지도 않음 — 최종 점검 N3) · 켜면 멈춤 해제(다음 실행에서 서버가 다시 판정).
   */
  const toggleAccount = (v: boolean) =>
    void act("acc", async () => {
      const r = await contactsApi.patchSettings({ accountSyncEnabled: v });
      if (r.ok) {
        if (v) clearContactsStop(userId);
        else markContactsStopped(userId, "account_sync_off");
      }
      return r;
    }, "cm_contacts_saved", { reload: false, onOk: () => patchSettingsLocal({ accountSyncEnabled: v }) });
  const toggleThisDevice = (s: SourceRow, v: boolean) =>
    void act("dev", async () => {
      const r = await contactsApi.patchSource(s.id, { installId: ensureClientInstanceId(), syncEnabled: v });
      if (r.ok) {
        if (v) clearContactsStop(userId);
        else markContactsStopped(userId, "device_sync_off");
      }
      return r;
    }, "cm_contacts_saved", {
      reload: false,
      onOk: () => setSources((cur) => cur.map((x) => (x.id === s.id ? { ...x, syncEnabled: v } : x))),
    });

  const deleteRows = (
    <>
      {thisSource ? (
        <NavRow
          title={t("cm_contacts_delete_this_device")}
          description={t("cm_contacts_delete_this_device_desc")}
          danger
          onClick={() => setConfirm({ kind: "this" })}
          dataPage="contacts-delete-this"
        />
      ) : null}
      <NavRow
        title={t("cm_contacts_delete_all")}
        description={t("cm_contacts_delete_all_desc")}
        danger
        onClick={() => setConfirm({ kind: "all" })}
        dataPage="contacts-delete-all"
      />
      <NavRow
        title={t("cm_contacts_withdraw")}
        description={t("cm_contacts_withdraw_desc")}
        danger
        onClick={() => setConfirm({ kind: "withdraw" })}
        dataPage="contacts-withdraw"
      />
    </>
  );

  return (
    <div className="flex min-h-full flex-col bg-[color:var(--cm-chat-bg,#fff)] pb-[var(--safe-bottom)]" data-cm-contacts-settings="">
      {status === "loading" ? <MessengerContactsLoading /> : null}
      {status === "error" ? (
        <MessengerContactsRetry
          onRetry={() => {
            setStatus("loading");
            void load();
          }}
        />
      ) : null}

      {status === "ready" && settings && !featureOn ? (
        <>
          <p className="px-4 py-6 text-center text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
            {t("cm_contacts_feature_off")}
          </p>
          {settings.consented ? deleteRows : null}
        </>
      ) : null}

      {/* 동의 전: 설정 대신 시작 안내 → 연락처 화면(전체 화면 동의) — 최종 점검 N2 */}
      {status === "ready" && settings && featureOn && !settings.consented ? (
        <div className="px-5 py-10 text-center" data-cm-contacts-settings-consent="">
          <p className="text-[16px] font-semibold" style={{ color: "var(--cm-chat-fg)" }}>
            {t("cm_contacts_start_title")}
          </p>
          <p className="mb-5 mt-1 text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
            {t("cm_contacts_start_desc")}
          </p>
          <Link href={MESSENGER_CONTACTS_SCREEN_HREF} className={`${Sam.btn.primaryCombo} inline-flex`}>
            {t("cm_contacts_start_cta")}
          </Link>
        </div>
      ) : null}

      {status === "ready" && settings && featureOn && settings.consented ? (
        <>
          <SectionLabel>{t("cm_contacts_settings_account")}</SectionLabel>
          <SwitchRow
            title={t("cm_contacts_settings_account_sync")}
            description={t("cm_contacts_settings_account_sync_desc")}
            checked={settings.accountSyncEnabled}
            disabled={busy === "acc"}
            onChange={toggleAccount}
          />
          <NavRow
            title={t("cm_contacts_settings_discovery")}
            description={settings.hasVerifiedPhone ? t("cm_contacts_settings_discovery_desc") : t("cm_contacts_settings_no_phone")}
            value={t(POLICY_KEY[settings.discoveryPolicy])}
            disabled={!settings.hasVerifiedPhone || busy === "policy"}
            onClick={() => setChoice("policy")}
            dataPage="contacts-discovery"
          />
          <SwitchRow
            title={t("cm_contacts_settings_join_notice")}
            checked={settings.joinNotifyEnabled}
            disabled={busy === "join"}
            onChange={(v) =>
              void act("join", () => contactsApi.patchSettings({ joinNotifyEnabled: v }), "cm_contacts_saved", {
                reload: false,
                onOk: () => patchSettingsLocal({ joinNotifyEnabled: v }),
              })
            }
          />
          {/* 기본 통화 방식 (4단계 C2) */}
          <NavRow
            title={t("cm_contacts_settings_call_default")}
            description={t("cm_contacts_settings_call_default_desc")}
            value={t(CALL_DEFAULT_KEY[settings.callDefault])}
            disabled={busy === "call"}
            onClick={() => setChoice("call")}
            dataPage="contacts-call-default"
          />

          <SectionLabel>{t("cm_contacts_settings_devices")}</SectionLabel>
          {thisSource ? (
            <SwitchRow
              title={deviceTitle(thisSource)}
              description={t("cm_contacts_device_meta", { time: date(thisSource.lastUsedAt), count: thisSource.entryCount })}
              checked={thisSource.syncEnabled}
              disabled={busy === "dev"}
              onChange={(v) => toggleThisDevice(thisSource, v)}
            />
          ) : null}
          {otherSources.map((s) => (
            <div key={s.id} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2" data-cm-contacts-device="">
              <span className="min-w-0">
                <span className="block text-[16px] leading-[1.35]" style={{ color: "var(--cm-chat-fg)" }}>
                  {deviceTitle(s)}
                </span>
                <span className="mt-px block text-[12.5px] leading-snug" style={{ color: "var(--cm-chat-sub)" }}>
                  {t("cm_contacts_device_meta", { time: date(s.lastUsedAt), count: s.entryCount })}
                </span>
              </span>
              <button
                type="button"
                disabled={busy === "confirm"}
                className={`${Sam.btn.secondaryCombo} ${MESSENGER_ROW_BTN_CLASS} ${busy === "confirm" ? "" : "!text-[color:var(--sam-danger)]"}`}
                onClick={() => setConfirm({ kind: "device", sourceId: s.id })}
              >
                {t("cm_contacts_device_delete")}
              </button>
            </div>
          ))}
          <p className="px-4 pb-2 pt-1 text-[12.5px] leading-snug" style={{ color: "var(--cm-chat-sub)" }}>
            {thisSource ? `${t("cm_contacts_device_sync_desc")} · ` : ""}
            {t("cm_contacts_idle_note_days", { days: settings.idleSourceDays })}
          </p>
          {deleteRows}

          <div id="cm-contacts-hidden" className="scroll-mt-[calc(var(--sector-header-h,52px)+var(--safe-top))]">
            <SectionLabel>
              {t("cm_contacts_hidden_title")} {hidden.length}
            </SectionLabel>
          </div>
          {hidden.length === 0 ? (
            <p className="px-4 py-4 text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
              {t("cm_contacts_hidden_empty")}
            </p>
          ) : (
            hidden.map((h) => (
              <div key={h.userId} className="flex w-full items-center" data-cm-messenger-list-row="" data-cm-list-surface="friend">
                <div data-cm-list-avatar-slot="" className="shrink-0">
                  <SamarketUserAvatarThumb avatarUrl={h.avatarUrl} size={44} roundedClassName="rounded-[16px]" className="h-full w-full" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <p data-cm-list-title="" className="truncate" style={{ color: "var(--cm-chat-fg)" }}>
                    {h.nickname ?? ""}
                  </p>
                  <p data-cm-list-preview="" className="truncate" style={{ color: "var(--cm-chat-sub)" }}>
                    {t(h.reason === "hidden" ? "cm_contacts_hidden_reason_hidden" : "cm_contacts_hidden_reason_former", { date: date(h.createdAt) })}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy === "confirm"}
                  className={`${Sam.btn.secondaryCombo} ${MESSENGER_ROW_BTN_CLASS}`}
                  // 시안: 숨김·차단·숨긴 추천 모두 확인 → 처리 중 → 결과 안내
                  onClick={() => setConfirm({ kind: "showAgain", userId: h.userId })}
                >
                  {t("cm_contacts_show_again")}
                </button>
              </div>
            ))
          )}
        </>
      ) : null}

      {choice === "policy" && settings ? (
        <ChoiceSheet
          title={t("cm_contacts_settings_discovery")}
          options={CONTACTS_DISCOVERY_POLICIES}
          value={settings.discoveryPolicy}
          labelOf={(v) => t(POLICY_KEY[v])}
          onClose={() => setChoice(null)}
          onPick={(v) => {
            setChoice(null);
            if (v !== settings.discoveryPolicy)
              void act("policy", () => contactsApi.patchSettings({ discoveryPolicy: v }), "cm_contacts_saved", {
                reload: false,
                onOk: () => patchSettingsLocal({ discoveryPolicy: v, discoveryPolicyIsDefault: false }),
              });
          }}
        />
      ) : null}
      {choice === "call" && settings ? (
        <ChoiceSheet
          title={t("cm_contacts_settings_call_default")}
          options={CONTACTS_CALL_DEFAULTS}
          value={settings.callDefault}
          labelOf={(v) => t(CALL_DEFAULT_KEY[v])}
          onClose={() => setChoice(null)}
          onPick={(v) => {
            setChoice(null);
            if (v !== settings.callDefault)
              void act("call", () => contactsApi.patchSettings({ callDefault: v }), "cm_contacts_saved", {
                reload: false,
                onOk: () => patchSettingsLocal({ callDefault: v }),
              });
          }}
        />
      ) : null}
      <DibayDialog
        open={confirm !== null}
        onClose={() => (busy === "confirm" ? undefined : setConfirm(null))}
        title={confirm ? t(CONFIRM_TEXT[confirm.kind].title) : ""}
        description={confirm ? t(CONFIRM_TEXT[confirm.kind].desc) : undefined}
        actions={[
          { key: "cancel", label: t("cm_contacts_cancel"), roleTone: "secondary", onClick: () => setConfirm(null), disabled: busy === "confirm" },
          {
            key: "ok",
            // 「사용 중지」는 삭제가 아니라 기능 끄기 — 버튼 이름을 동작과 맞춘다 (최종 점검 #19)
            label:
              confirm?.kind === "withdraw"
                ? t("cm_contacts_withdraw_confirm")
                : confirm?.kind === "showAgain"
                  ? t("cm_contacts_show_again")
                  : t("cm_contacts_delete"),
            roleTone: confirm?.kind === "showAgain" ? "primary" : "destructive",
            onClick: () => void runConfirm(),
            loading: busy === "confirm",
          },
        ]}
      />
    </div>
  );
}
