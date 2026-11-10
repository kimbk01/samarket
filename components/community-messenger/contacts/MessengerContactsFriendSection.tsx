"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerFriendTabSectionLabel } from "@/components/community-messenger/friend-list/CommunityMessengerFriendSection";
import { MessengerContactsMemberRow } from "@/components/community-messenger/contacts/MessengerContactsMemberRow";
import { MessengerContactsMemberSheet } from "@/components/community-messenger/contacts/MessengerContactsMemberSheet";
import { MessengerContactsBanners } from "@/components/community-messenger/contacts/MessengerContactsBanners";
import { Sam } from "@/lib/ui/sam-component-classes";
import { MESSENGER_ROW_BTN_CLASS } from "@/components/community-messenger/friend-cta/MessengerFriendRelationCta";
import { useContactsFriendCta } from "@/components/community-messenger/contacts/use-contacts-friend-cta";
import { useMessengerContacts } from "@/lib/community-messenger/contacts/use-messenger-contacts";
import { findLocalNumberByRef, readContactsNumbers } from "@/lib/community-messenger/contacts/contacts-local-store";
import {
  MESSENGER_CONTACTS_SCREEN_HREF,
  contactsMemberDisplayName,
  type ContactsMemberRow,
} from "@/lib/community-messenger/contacts/contacts-contract";
import { MessengerContactsRetry } from "@/components/community-messenger/contacts/MessengerContactsStatus";

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
  const cta = useContactsFriendCta(c.acceptRequest);
  // 이 기기 번호표(큰 값)는 이 기기 연락처 회원의 시트를 열 때만 읽는다 (렌더마다·섹션 진입마다 읽기 금지)
  const sheetDeviceNumber = useMemo(
    () =>
      sheetMember && c.userId && sheetMember.on_this_device && sheetMember.client_ref
        ? findLocalNumberByRef(readContactsNumbers(c.userId), sheetMember.client_ref)
        : null,
    [sheetMember, c.userId]
  );

  if (view.phase === "loading" || view.phase === "disabled") return null;
  // 설정을 못 불러옴 → 섹션을 조용히 지우지 않고 다시 시도 (최종 점검 #3·#21)
  if (view.phase === "error") {
    return (
      <section data-cm-friend-section="contacts">
        <MessengerFriendTabSectionLabel title={t("cm_contacts_section_title")} />
        <MessengerContactsRetry compact onRetry={c.retry} />
      </section>
    );
  }

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
  // 홈에서 방금 친구가 됐거나 대화 불가(차단·거절)가 된 회원은 빼고 센다 (§5-5)
  const members = view.members.filter((m) => !cta.isGoneNow(m));
  const preview = members.slice(0, PREVIEW_COUNT);
  // 보여 줄 회원·안내가 없으면 섹션을 그리지 않는다 (권한 철회 안내는 앱 전체 안내가 1곳에서 띄움)
  const hasBanner =
    view.otherDeviceOnly ||
    (view.nativeAvailable &&
      (view.deviceApprovalNeeded ||
        view.stoppedReason === "source_removed" ||
        view.stoppedReason === "device_sync_off" ||
        (view.permission !== "granted" && view.permission !== "limited")));
  if (preview.length === 0 && !view.listError && !hasBanner) return null;

  const nameOf = (m: ContactsMemberRow) => contactsMemberDisplayName(m, view.names);

  const addFriend = async (m: ContactsMemberRow): Promise<boolean> => {
    setBusyId(m.user_id);
    const ok = await cta.addFriend(m);
    setBusyId(null);
    if (ok) c.markRequested(m.user_id);
    return ok;
  };

  const accept = async (m: ContactsMemberRow): Promise<boolean> => {
    setBusyId(m.user_id);
    const ok = await cta.accept(m, nameOf(m));
    setBusyId(null);
    if (ok) c.removeMemberLocally(m.user_id);
    return ok;
  };

  return (
    <section data-cm-friend-section="contacts">
      <MessengerFriendTabSectionLabel
        title={t("cm_contacts_section_title")}
        count={members.length}
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
        onTurnOn={() => void c.turnOnThisDevice()}
      />
      {view.listError && preview.length === 0 ? <MessengerContactsRetry compact onRetry={() => void c.reloadList()} /> : null}
      <div>
        {preview.map((m) => (
          <MessengerContactsMemberRow
            key={m.user_id}
            member={m}
            requestState={cta.requestStateOf(m)}
            name={nameOf(m)}
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
          name={nameOf(sheetMember)}
          deviceNumber={sheetDeviceNumber}
          callDefault={view.settings?.callDefault ?? "ask"}
          requestState={cta.requestStateOf(sheetMember)}
          onClose={() => setSheetMember(null)}
          onAddFriend={() => addFriend(sheetMember)}
          onAccept={() => accept(sheetMember)}
          onHide={async () => {
            const ok = await cta.hide(sheetMember);
            if (ok) c.removeMemberLocally(sheetMember.user_id);
            return ok;
          }}
          onBlock={async () => {
            const ok = await cta.block(sheetMember);
            if (ok) c.removeMemberLocally(sheetMember.user_id);
            return ok;
          }}
        />
      ) : null}
    </section>
  );
}
