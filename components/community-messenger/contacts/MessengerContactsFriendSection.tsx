"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerFriendTabSectionLabel } from "@/components/community-messenger/friend-list/CommunityMessengerFriendSection";
import { MessengerContactsMemberRow } from "@/components/community-messenger/contacts/MessengerContactsMemberRow";
import { MessengerContactsMemberSheet } from "@/components/community-messenger/contacts/MessengerContactsMemberSheet";
import { MessengerContactsRevokeDialog } from "@/components/community-messenger/contacts/MessengerContactsRevokeDialog";
import { MessengerContactsBanners } from "@/components/community-messenger/contacts/MessengerContactsBanners";
import { Sam } from "@/lib/ui/sam-component-classes";
import { MESSENGER_ROW_BTN_CLASS } from "@/components/community-messenger/friend-cta/MessengerFriendRelationCta";
import { postCommunityMessengerFriendRequestApi } from "@/lib/community-messenger/community-messenger-friend-request-client";
import { useMessengerContacts } from "@/lib/community-messenger/contacts/use-messenger-contacts";
import { findLocalNumberByRef, readContactsLocalState } from "@/lib/community-messenger/contacts/contacts-local-store";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { MESSENGER_CONTACTS_SCREEN_HREF, type ContactsMemberRow } from "@/lib/community-messenger/contacts/contacts-contract";

const PREVIEW_COUNT = 3;

/**
 * 친구 탭 「내 연락처의 DIBAY 회원」 섹션 (SSOT v5 §13 · 통합 시안 5) — 내 프로필·받은 요청 아래 1개.
 * 대화/친구/통화 탭 구조·기존 친구 섹션은 그대로. 기능 꺼짐(어드민)·로그인 전이면 아무것도 그리지 않는다.
 * 동의 전: 안내 띠 「시작하기」 → 연락처 화면(같은 주소의 전체 화면 동의). 목록은 이 섹션이 보일 때만 따로 불러온다.
 */
export function MessengerContactsFriendSection() {
  const { t } = useI18n();
  const c = useMessengerContacts();
  const { view } = c;
  const [sheetMember, setSheetMember] = useState<ContactsMemberRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // 기기 저장값은 시트를 열 때만 읽는다 (렌더마다 전체 파싱 금지)
  const local = useMemo(() => (sheetMember && c.userId ? readContactsLocalState(c.userId) : null), [sheetMember, c.userId]);

  if (view.phase === "loading" || view.phase === "disabled") return null;

  if (view.phase === "consent") {
    return (
      <section data-cm-friend-section="contacts">
        <div className="mx-4 my-2 flex items-center gap-3 rounded-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--cm-chat-band)] px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold" style={{ color: "var(--cm-chat-fg)" }}>
              {t("cm_contacts_start_title")}
            </p>
            <p className="text-[12.5px]" style={{ color: "var(--cm-chat-sub)" }}>
              {t("cm_contacts_start_desc")}
            </p>
          </div>
          <Link href={MESSENGER_CONTACTS_SCREEN_HREF} className={`${Sam.btn.primaryCombo} ${MESSENGER_ROW_BTN_CLASS}`}>
            {t("cm_contacts_start_cta")}
          </Link>
        </div>
      </section>
    );
  }

  if (view.accountSyncOff) return null;
  const preview = view.members.slice(0, PREVIEW_COUNT);
  const revoke = <MessengerContactsRevokeDialog open={view.revokePending} count={view.revokeCount} onAnswer={c.answerRevoke} />;
  if (preview.length === 0 && !view.otherDeviceOnly && !(view.nativeAvailable && view.permission !== "granted" && view.permission !== "limited")) {
    return revoke;
  }

  const nameOf = (m: ContactsMemberRow) =>
    (m.on_this_device && m.client_ref ? view.names[m.client_ref] : null) || m.nickname || m.dibay_id || m.username || "";

  const addFriend = async (m: ContactsMemberRow) => {
    setBusyId(m.user_id);
    const r = await postCommunityMessengerFriendRequestApi(m.user_id);
    setBusyId(null);
    if (r.ok) {
      c.markRequested(m.user_id);
      showMessengerSnackbar(t("cm_contacts_request_sent"));
    } else {
      showMessengerSnackbar(t("cm_contacts_action_failed"), { variant: "error" });
    }
  };

  const accept = async (m: ContactsMemberRow) => {
    setBusyId(m.user_id);
    const r = await c.acceptRequest(m.user_id);
    setBusyId(null);
    if (r.ok) showMessengerSnackbar(t("cm_friend_request_you_accepted", { name: nameOf(m) }), { variant: "success" });
    else showMessengerSnackbar(t("cm_contacts_action_failed"), { variant: "error" });
  };

  return (
    <section data-cm-friend-section="contacts">
      <MessengerFriendTabSectionLabel
        title={t("cm_contacts_section_title")}
        count={view.members.length}
        right={
          <Link
            href={MESSENGER_CONTACTS_SCREEN_HREF}
            className="-my-3 inline-flex min-h-[44px] items-center px-1 font-semibold text-sam-primary"
            data-cm-contacts-see-all=""
          >
            {t("cm_contacts_see_all")}
          </Link>
        }
      />
      <MessengerContactsBanners
        view={view}
        onAddThisDevice={() => void c.answerNewDevice(true)}
        onLater={() => void c.answerNewDevice(false)}
        onRequestPermission={() => void c.requestPermissionAgain()}
      />
      <div>
        {preview.map((m) => (
          <MessengerContactsMemberRow
            key={m.user_id}
            member={m}
            deviceName={m.client_ref ? view.names[m.client_ref] ?? null : null}
            busy={busyId === m.user_id}
            onPress={() => setSheetMember(m)}
            onAddFriend={() => void addFriend(m)}
            onAccept={() => void accept(m)}
          />
        ))}
      </div>
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
      {revoke}
    </section>
  );
}
