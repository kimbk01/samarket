"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { RefreshCw, Settings } from "lucide-react";
import { Share } from "@capacitor/share";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerFriendTabSectionLabel } from "@/components/community-messenger/friend-list/CommunityMessengerFriendSection";
import { MessengerContactsMemberRow } from "@/components/community-messenger/contacts/MessengerContactsMemberRow";
import { MessengerContactsMemberSheet } from "@/components/community-messenger/contacts/MessengerContactsMemberSheet";
import { MessengerContactsConsentView } from "@/components/community-messenger/contacts/MessengerContactsConsentView";
import { MessengerContactsRevokeDialog } from "@/components/community-messenger/contacts/MessengerContactsRevokeDialog";
import { MessengerContactsBanners } from "@/components/community-messenger/contacts/MessengerContactsBanners";
import { useMessengerContactsHeader } from "@/components/community-messenger/contacts/use-messenger-contacts-header";
import { MESSENGER_ROW_BTN_CLASS } from "@/components/community-messenger/friend-cta/MessengerFriendRelationCta";
import { Sam } from "@/lib/ui/sam-component-classes";
import { postCommunityMessengerFriendRequestApi } from "@/lib/community-messenger/community-messenger-friend-request-client";
import { useMessengerContacts } from "@/lib/community-messenger/contacts/use-messenger-contacts";
import { findLocalNumberByRef, readContactsLocalState } from "@/lib/community-messenger/contacts/contacts-local-store";
import { contactsNativePlatform } from "@/lib/community-messenger/contacts/contacts-native";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { formatRelativeTimeAgo } from "@/lib/i18n/format-relative-time";
import {
  MESSENGER_CONTACTS_SETTINGS_HREF,
  type ContactsMemberRow,
} from "@/lib/community-messenger/contacts/contacts-contract";

const INVITE_MAX = 100;
const BACK_HREF = "/community-messenger?section=friends";

/** 「0917 ··· 2231」 — 국가번호를 뺀 앞 4자리 · 끝 4자리만 (이 기기 안에서만 표시) */
function maskContactNumber(e164: string): string {
  const local = e164.replace(/^\+63/, "0").replace(/^\+82/, "0");
  if (local.length < 8) return local;
  return `${local.slice(0, 4)} ··· ${local.slice(-4)}`;
}

/** 불러오는 중 (메신저 목록 로딩과 같은 모양) */
function LoadingRow() {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-10" role="status">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--messenger-divider)] border-t-[color:var(--messenger-primary)]"
        aria-hidden
      />
      <span className="text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
        {t("common_loading")}
      </span>
    </div>
  );
}

/** 「내 연락처의 DIBAY 회원」 화면 (통합 시안 7A·7B) — 동의 전이면 같은 주소에서 동의 화면(전체 화면) */
export function MessengerContactsScreen() {
  const { t, language } = useI18n();
  const router = useRouter();
  const c = useMessengerContacts();
  const { view } = c;
  const [sheetMember, setSheetMember] = useState<ContactsMemberRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // 기기 저장값(번호·이름)은 목록·이름표가 바뀔 때만 다시 읽는다 (렌더마다 전체 파싱 금지)
  const local = useMemo(
    () => (c.userId ? readContactsLocalState(c.userId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 이름표·동기화 시각·목록이 바뀌면 다시 읽음
    [c.userId, view.names, view.lastSyncAt, view.members]
  );

  const platform = contactsNativePlatform();
  const subtitle =
    view.phase !== "ready"
      ? null
      : view.syncing
        ? t("cm_contacts_syncing")
        : view.lastSyncAt
          ? platform
            ? t("cm_contacts_header_sub", {
                device: t(platform === "ios" ? "cm_contacts_device_ios" : "cm_contacts_device_android"),
                time: formatRelativeTimeAgo(new Date(view.lastSyncAt).toISOString(), language),
              })
            : t("cm_contacts_last_sync", { time: formatRelativeTimeAgo(new Date(view.lastSyncAt).toISOString(), language) })
          : null;

  const showRefresh = view.nativeAvailable && view.phase === "ready";
  const showSettings = view.phase === "ready" || (view.featureOff && view.settings?.consented === true);
  const { syncing } = view;
  const { refresh } = c;
  const actions = useMemo(
    () =>
      showRefresh || showSettings ? (
        <div className="flex items-center">
          {showRefresh ? (
            <button
              type="button"
              aria-label={t("cm_contacts_refresh")}
              aria-busy={syncing || undefined}
              disabled={syncing}
              onClick={() => void refresh()}
              className="flex h-11 w-11 items-center justify-center rounded-full active:bg-[color:var(--cm-chat-band)]"
            >
              <RefreshCw className={`h-5 w-5 ${syncing ? "animate-spin" : ""}`} style={{ color: "var(--cm-chat-fg)" }} aria-hidden />
            </button>
          ) : null}
          {showSettings ? (
            <Link
              href={MESSENGER_CONTACTS_SETTINGS_HREF}
              aria-label={t("cm_contacts_settings")}
              className="flex h-11 w-11 items-center justify-center rounded-full active:bg-[color:var(--cm-chat-band)]"
            >
              <Settings className="h-5 w-5" style={{ color: "var(--cm-chat-fg)" }} aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null,
    [refresh, showRefresh, showSettings, syncing, t]
  );
  useMessengerContactsHeader({ titleKey: "cm_contacts_screen_title", backHref: BACK_HREF, subtitle, actions });

  /** 초대 = 이 기기 연락처 중 DIBAY 회원이 아닌 것 — 보이는 회원 + 친구·숨김·내가 차단(서버 known_refs) 제외 */
  const invitees = useMemo(() => {
    if (!local?.numbers) return [] as { ref: string; name: string; number: string }[];
    const exclude = new Set<string>(view.knownRefs);
    for (const m of view.members) if (m.on_this_device && m.client_ref) exclude.add(m.client_ref);
    const seen = new Set<string>();
    const out: { ref: string; name: string; number: string }[] = [];
    for (const [e164, ref] of Object.entries(local.numbers)) {
      if (exclude.has(ref) || seen.has(ref)) continue;
      seen.add(ref);
      const name = local.names[ref];
      if (name) out.push({ ref, name, number: maskContactNumber(e164) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name)).slice(0, INVITE_MAX);
  }, [local, view.knownRefs, view.members]);

  const addFriend = async (m: ContactsMemberRow) => {
    setBusyId(m.user_id);
    const r = await postCommunityMessengerFriendRequestApi(m.user_id);
    setBusyId(null);
    if (r.ok) {
      c.markRequested(m.user_id);
      showMessengerSnackbar(t("cm_contacts_request_sent"));
    } else showMessengerSnackbar(t("cm_contacts_action_failed"), { variant: "error" });
  };

  const accept = async (m: ContactsMemberRow, label: string): Promise<boolean> => {
    setBusyId(m.user_id);
    const r = await c.acceptRequest(m.user_id);
    setBusyId(null);
    if (r.ok) showMessengerSnackbar(t("cm_friend_request_you_accepted", { name: label }), { variant: "success" });
    else showMessengerSnackbar(t("cm_contacts_action_failed"), { variant: "error" });
    return r.ok;
  };

  const invite = async () => {
    try {
      await Share.share({ text: t("cm_contacts_invite_text"), url: typeof window !== "undefined" ? window.location.origin : undefined });
    } catch {
      /* 사용자가 공유 창을 닫음 */
    }
  };

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.replace(BACK_HREF);
  };

  const nameOf = (m: ContactsMemberRow) =>
    (m.on_this_device && m.client_ref ? view.names[m.client_ref] : null) || m.nickname || m.dibay_id || m.username || "";

  return (
    <div className="flex min-h-full flex-col bg-[color:var(--cm-chat-bg,#fff)]" data-cm-contacts-screen="">
      {view.phase === "loading" ? <LoadingRow /> : null}
      {view.phase === "disabled" ? (
        <p className="px-4 py-10 text-center text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
          {t("cm_contacts_feature_off")}
        </p>
      ) : null}
      {view.phase === "consent" ? <MessengerContactsConsentView onAgree={c.consentAndStart} onLater={goBack} /> : null}
      {view.phase === "ready" ? (
        <>
          <MessengerContactsBanners
            view={view}
            onAddThisDevice={() => void c.answerNewDevice(true)}
            onLater={() => void c.answerNewDevice(false)}
            onRequestPermission={() => void c.requestPermissionAgain()}
          />
          <MessengerFriendTabSectionLabel title={t("cm_contacts_members_count", { count: view.members.length })} />
          {view.listError && view.members.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-8">
              <p className="text-center text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
                {t("cm_contacts_load_failed")}
              </p>
              <button type="button" className={`${Sam.btn.secondaryCombo} ${MESSENGER_ROW_BTN_CLASS}`} onClick={() => void c.reloadList()}>
                {t("cm_contacts_retry")}
              </button>
            </div>
          ) : view.members.length === 0 ? (
            <p className="px-4 py-6 text-center text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
              {t("cm_contacts_empty")}
            </p>
          ) : (
            view.members.map((m) => (
              <MessengerContactsMemberRow
                key={m.user_id}
                member={m}
                deviceName={m.client_ref ? view.names[m.client_ref] ?? null : null}
                busy={busyId === m.user_id}
                onPress={() => setSheetMember(m)}
                onAddFriend={() => void addFriend(m)}
                onAccept={() => void accept(m, nameOf(m))}
              />
            ))
          )}
          {invitees.length > 0 ? (
            <>
              <MessengerFriendTabSectionLabel title={t("cm_contacts_invite_title")} count={invitees.length} />
              {invitees.map((p) => (
                <div key={p.ref} className="flex w-full items-center" data-cm-messenger-list-row="" data-cm-list-surface="friend" data-cm-contacts-invite="">
                  <div
                    data-cm-list-avatar-slot=""
                    className="flex shrink-0 items-center justify-center rounded-[16px] bg-[color:var(--cm-chat-band)] text-[16px] font-semibold"
                    style={{ color: "var(--cm-chat-sub)" }}
                    aria-hidden
                  >
                    {p.name.slice(0, 1)}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <p data-cm-list-title="" className="truncate" style={{ color: "var(--cm-chat-fg)" }}>
                      {p.name}
                    </p>
                    <p data-cm-list-preview="" className="truncate tabular-nums" style={{ color: "var(--cm-chat-sub)" }}>
                      {p.number}
                    </p>
                  </div>
                  <button type="button" className={`${Sam.btn.secondaryCombo} ${MESSENGER_ROW_BTN_CLASS}`} onClick={() => void invite()}>
                    {t("cm_contacts_invite")}
                  </button>
                </div>
              ))}
            </>
          ) : null}
          <p className="px-4 py-4 text-[12.5px]" style={{ color: "var(--cm-chat-sub)" }}>
            {t("cm_contacts_id_change_note")}
          </p>
        </>
      ) : null}
      {sheetMember ? (
        <MessengerContactsMemberSheet
          member={sheetMember}
          deviceName={sheetMember.client_ref ? view.names[sheetMember.client_ref] ?? null : null}
          deviceNumber={local ? findLocalNumberByRef(local, sheetMember.on_this_device ? sheetMember.client_ref : null) : null}
          callDefault={view.settings?.callDefault ?? "ask"}
          onClose={() => setSheetMember(null)}
          onRequested={c.markRequested}
          onAccept={async (id) => (await c.acceptRequest(id)).ok}
          onRemoved={c.removeMemberLocally}
        />
      ) : null}
      <MessengerContactsRevokeDialog open={view.revokePending} count={view.revokeCount} onAnswer={c.answerRevoke} />
    </div>
  );
}
