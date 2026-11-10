"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RefreshCw, Settings } from "lucide-react";
import { Share } from "@capacitor/share";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerFriendTabSectionLabel } from "@/components/community-messenger/friend-list/CommunityMessengerFriendSection";
import { MessengerContactsMemberRow } from "@/components/community-messenger/contacts/MessengerContactsMemberRow";
import { MessengerContactsMemberSheet } from "@/components/community-messenger/contacts/MessengerContactsMemberSheet";
import { MessengerContactsConsentSheet } from "@/components/community-messenger/contacts/MessengerContactsConsentSheet";
import { MessengerContactsRevokeDialog } from "@/components/community-messenger/contacts/MessengerContactsRevokeDialog";
import { MessengerContactsBanners } from "@/components/community-messenger/contacts/MessengerContactsBanners";
import { MessengerContactsSubHeader } from "@/components/community-messenger/contacts/MessengerContactsSubHeader";
import { MESSENGER_ROW_BTN_CLASS } from "@/components/community-messenger/friend-cta/MessengerFriendRelationCta";
import { Sam } from "@/lib/ui/sam-component-classes";
import { postCommunityMessengerFriendRequestApi } from "@/lib/community-messenger/community-messenger-friend-request-client";
import { useMessengerContacts } from "@/lib/community-messenger/contacts/use-messenger-contacts";
import { findLocalNumberByRef, readContactsLocalState } from "@/lib/community-messenger/contacts/contacts-local-store";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { formatRelativeTimeAgo } from "@/lib/i18n/format-relative-time";
import type { ContactsMemberRow } from "@/lib/community-messenger/contacts/contacts-contract";

import { MESSENGER_CONTACTS_SETTINGS_HREF } from "@/lib/community-messenger/contacts/contacts-contract";
const INVITE_MAX = 100;

/** 「내 연락처의 DIBAY 회원」 화면 (통합 시안 7A·7B) — 회원 전체 + 이 기기 비회원 초대 + 새로고침 */
export function MessengerContactsScreen() {
  const { t, language } = useI18n();
  const c = useMessengerContacts();
  const { view } = c;
  const [consentOpen, setConsentOpen] = useState(view.phase === "consent");
  const [sheetMember, setSheetMember] = useState<ContactsMemberRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // 기기 저장값은 화면이 바뀔 때마다 다시 읽는다 (번호·이름은 기기 안에만)
  const local = c.userId ? readContactsLocalState(c.userId) : null;

  const invitees = useMemo(() => {
    if (!local?.numbers) return [] as { ref: string; name: string }[];
    const memberRefs = new Set(view.members.filter((m) => m.on_this_device && m.client_ref).map((m) => m.client_ref));
    const friendSeen = new Set<string>();
    const out: { ref: string; name: string }[] = [];
    for (const ref of Object.values(local.numbers)) {
      if (memberRefs.has(ref) || friendSeen.has(ref)) continue;
      friendSeen.add(ref);
      const name = local.names[ref];
      if (name) out.push({ ref, name });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name)).slice(0, INVITE_MAX);
  }, [local, view.members]);

  const addFriend = async (m: ContactsMemberRow) => {
    setBusyId(m.user_id);
    const r = await postCommunityMessengerFriendRequestApi(m.user_id);
    setBusyId(null);
    if (r.ok) {
      c.markRequested(m.user_id);
      showMessengerSnackbar(t("cm_contacts_request_sent"));
    } else showMessengerSnackbar(t("cm_contacts_action_failed"), { variant: "error" });
  };

  const invite = async () => {
    try {
      await Share.share({ text: t("cm_contacts_invite_text"), url: typeof window !== "undefined" ? window.location.origin : undefined });
    } catch {
      /* 사용자가 공유 창을 닫음 */
    }
  };

  const sub = view.syncing
    ? t("cm_contacts_syncing")
    : view.lastSyncAt
      ? t("cm_contacts_last_sync", { time: formatRelativeTimeAgo(new Date(view.lastSyncAt).toISOString(), language) })
      : null;

  return (
    <div className="flex min-h-full flex-col bg-[color:var(--cm-chat-bg,#fff)]" data-cm-contacts-screen="">
      <MessengerContactsSubHeader
        title={t("cm_contacts_screen_title")}
        sub={sub}
        trailing={
          <>
            {view.nativeAvailable && view.phase === "ready" ? (
              <button
                type="button"
                aria-label={t("cm_contacts_refresh")}
                disabled={view.syncing}
                onClick={() => void c.refresh()}
                className="flex h-11 w-11 items-center justify-center rounded-full active:bg-[color:var(--cm-chat-band)] disabled:opacity-50"
              >
                <RefreshCw className={`h-5 w-5 ${view.syncing ? "animate-spin" : ""}`} style={{ color: "var(--cm-chat-fg)" }} aria-hidden />
              </button>
            ) : null}
            {view.phase === "ready" ? (
              <Link
                href={MESSENGER_CONTACTS_SETTINGS_HREF}
                aria-label={t("cm_contacts_settings")}
                className="flex h-11 w-11 items-center justify-center rounded-full active:bg-[color:var(--cm-chat-band)]"
              >
                <Settings className="h-5 w-5" style={{ color: "var(--cm-chat-fg)" }} aria-hidden />
              </Link>
            ) : null}
          </>
        }
      />
      {view.phase === "disabled" ? (
        <p className="px-4 py-10 text-center text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
          {t("cm_contacts_feature_off")}
        </p>
      ) : null}
      {view.phase === "consent" ? (
        <div className="px-4 py-8 text-center">
          <p className="text-[15px] font-semibold" style={{ color: "var(--cm-chat-fg)" }}>
            {t("cm_contacts_start_title")}
          </p>
          <p className="mb-4 mt-1 text-[13px]" style={{ color: "var(--cm-chat-sub)" }}>
            {t("cm_contacts_start_desc")}
          </p>
          <button type="button" className={Sam.btn.primaryCombo} onClick={() => setConsentOpen(true)}>
            {t("cm_contacts_start_cta")}
          </button>
        </div>
      ) : null}
      {view.phase === "ready" ? (
        <>
          <MessengerContactsBanners
            view={view}
            onAddThisDevice={() => void c.answerNewDevice(true)}
            onLater={() => void c.answerNewDevice(false)}
            onRequestPermission={() => void c.requestPermissionAgain()}
          />
          <MessengerFriendTabSectionLabel title={t("cm_contacts_members_count", { count: view.members.length })} />
          {view.members.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px]" style={{ color: "var(--cm-chat-sub)" }}>
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
              />
            ))
          )}
          {invitees.length > 0 ? (
            <>
              <MessengerFriendTabSectionLabel title={t("cm_contacts_invite_title")} count={invitees.length} />
              {invitees.map((p) => (
                <div key={p.ref} className="flex min-h-[56px] items-center gap-3 px-4">
                  <span className="min-w-0 flex-1 truncate text-[15px]" style={{ color: "var(--cm-chat-fg)" }}>
                    {p.name}
                  </span>
                  <button type="button" className={`${Sam.btn.secondaryCombo} ${MESSENGER_ROW_BTN_CLASS}`} onClick={() => void invite()}>
                    {t("cm_contacts_invite")}
                  </button>
                </div>
              ))}
            </>
          ) : null}
          <p className="px-4 py-4 text-[12px]" style={{ color: "var(--cm-chat-sub)" }}>
            {t("cm_contacts_id_change_note")}
          </p>
        </>
      ) : null}
      {consentOpen && view.phase === "consent" ? (
        <MessengerContactsConsentSheet onClose={() => setConsentOpen(false)} onAgree={c.consentAndStart} />
      ) : null}
      {sheetMember ? (
        <MessengerContactsMemberSheet
          member={sheetMember}
          deviceName={sheetMember.client_ref ? view.names[sheetMember.client_ref] ?? null : null}
          deviceNumber={local ? findLocalNumberByRef(local, sheetMember.on_this_device ? sheetMember.client_ref : null) : null}
          onClose={() => setSheetMember(null)}
          onRequested={c.markRequested}
          onRemoved={c.removeMemberLocally}
        />
      ) : null}
      <MessengerContactsRevokeDialog open={view.revokePending} onAnswer={c.answerRevoke} />
    </div>
  );
}
