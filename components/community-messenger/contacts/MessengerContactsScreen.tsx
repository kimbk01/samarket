"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { RefreshCw, Settings } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerFriendTabSectionLabel } from "@/components/community-messenger/friend-list/CommunityMessengerFriendSection";
import { MessengerContactsMemberRow } from "@/components/community-messenger/contacts/MessengerContactsMemberRow";
import { MessengerContactsMemberSheet } from "@/components/community-messenger/contacts/MessengerContactsMemberSheet";
import { MessengerContactsConsentView } from "@/components/community-messenger/contacts/MessengerContactsConsentView";
import { MessengerContactsBanners } from "@/components/community-messenger/contacts/MessengerContactsBanners";
import { useMessengerContactsHeader } from "@/components/community-messenger/contacts/use-messenger-contacts-header";
import { MESSENGER_ROW_BTN_CLASS } from "@/components/community-messenger/friend-cta/MessengerFriendRelationCta";
import { Sam } from "@/lib/ui/sam-component-classes";
import { useContactsFriendCta } from "@/components/community-messenger/contacts/use-contacts-friend-cta";
import { useMessengerContacts } from "@/lib/community-messenger/contacts/use-messenger-contacts";
import {
  findLocalNumberByRef,
  readContactsNames,
  readContactsNumbers,
} from "@/lib/community-messenger/contacts/contacts-local-store";
import { contactsNativePlatform } from "@/lib/community-messenger/contacts/contacts-native";
import { formatRelativeTimeAgo } from "@/lib/i18n/format-relative-time";
import { useDibayShareSheet } from "@/components/share/use-dibay-share-sheet";
import { APP_PRODUCT_DISPLAY_NAME } from "@/lib/brand/app-display-name";
import { DIBAY_APP_ICON_512_PATH, dibayBrandAssetUrl } from "@/lib/brand/brand-asset-paths";
import { buildShareUrl } from "@/lib/share/share-url";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { MessengerContactsLoading, MessengerContactsRetry } from "@/components/community-messenger/contacts/MessengerContactsStatus";
import {
  MESSENGER_CONTACTS_BACK_HREF,
  MESSENGER_CONTACTS_SETTINGS_HREF,
  contactsMemberDisplayName,
  type ContactsMemberRow,
} from "@/lib/community-messenger/contacts/contacts-contract";
import type { ContactsSyncOutcome } from "@/lib/community-messenger/contacts/contacts-sync-engine";
import type { MessageKey } from "@/lib/i18n/messages";

const INVITE_MAX = 100;
const BACK_HREF = MESSENGER_CONTACTS_BACK_HREF;

/** 수동 새로고침 결과 안내 (최종 점검 #6) — 결과마다 한 문구 */
const REFRESH_RESULT_KEY: Partial<Record<ContactsSyncOutcome, MessageKey>> = {
  uploaded: "cm_contacts_refresh_done",
  unchanged: "cm_contacts_refresh_done",
  stopped: "cm_contacts_refresh_stopped",
  throttled: "cm_contacts_refresh_limited",
  permission_needed: "cm_contacts_refresh_permission",
  permission_revoked: "cm_contacts_refresh_permission",
  failed: "cm_contacts_action_failed",
};

/** 「0917 ··· 2231」 — 국가번호를 뺀 앞 4자리 · 끝 4자리만 (이 기기 안에서만 표시) */
function maskContactNumber(e164: string): string {
  const local = e164.replace(/^\+63/, "0").replace(/^\+82/, "0");
  if (local.length < 8) return local;
  return `${local.slice(0, 4)} ··· ${local.slice(-4)}`;
}

/** 「내 연락처의 DIBAY 회원」 화면 (통합 시안 7A·7B) — 동의 전이면 같은 주소에서 동의 화면(전체 화면) */
export function MessengerContactsScreen() {
  const { t, language } = useI18n();
  const router = useRouter();
  const c = useMessengerContacts();
  const { view } = c;
  const [sheetMember, setSheetMember] = useState<ContactsMemberRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const cta = useContactsFriendCta(c.acceptRequest);
  // 이 기기 번호표·이름표(큰 값)는 이 화면(초대 목록)에서만, 목록·동기화가 바뀔 때만 다시 읽는다 (렌더마다 읽기 금지)
  const local = useMemo(
    () => (c.userId ? { numbers: readContactsNumbers(c.userId), names: readContactsNames(c.userId) } : null),
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
  const onRefresh = useCallback(async () => {
    const outcome = await refresh();
    const key = outcome ? REFRESH_RESULT_KEY[outcome] : undefined;
    if (key) showMessengerSnackbar(t(key), outcome === "failed" ? { variant: "error" } : undefined);
  }, [refresh, t]);
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
              onClick={() => void onRefresh()}
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
    [onRefresh, showRefresh, showSettings, syncing, t]
  );
  useMessengerContactsHeader({
    titleKey: view.phase === "consent" ? "cm_contacts_consent_title" : "cm_contacts_screen_title",
    backHref: BACK_HREF,
    subtitle,
    actions,
  });

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

  const addFriend = async (m: ContactsMemberRow): Promise<boolean> => {
    setBusyId(m.user_id);
    const ok = await cta.addFriend(m);
    setBusyId(null);
    if (ok) c.markRequested(m.user_id);
    return ok;
  };

  const accept = async (m: ContactsMemberRow, label: string): Promise<boolean> => {
    setBusyId(m.user_id);
    const ok = await cta.accept(m, label);
    setBusyId(null);
    if (ok) c.removeMemberLocally(m.user_id);
    return ok;
  };

  /**
   * 초대 — 앱 소개·설치 페이지(`/download`) 링크를 통합 공유 시트로 (Owner G-1 2026-11-14).
   * 실패·취소 때 링크를 몰래 복사하지 않는다(복사는 시트의 「링크 복사」로).
   */
  const { openShare, shareSheet } = useDibayShareSheet();
  const invite = () => {
    openShare({
      url: buildShareUrl({ kind: "app" }),
      previewTitle: APP_PRODUCT_DISPLAY_NAME,
      previewSubtitle: t("share_app_desc"),
      previewImageUrl: dibayBrandAssetUrl(DIBAY_APP_ICON_512_PATH),
      shareText: t("cm_contacts_invite_text"),
    });
  };

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.replace(BACK_HREF);
  };

  const nameOf = (m: ContactsMemberRow) => contactsMemberDisplayName(m, view.names);
  // 홈에서 방금 친구·차단·거절이 된 회원은 바로 뺀다 (분할 화면에서 홈과 함께 보일 때 — 홈 밖이면 그대로)
  const members = view.members.filter((m) => !cta.isGoneNow(m));

  return (
    <div className="flex min-h-full flex-col bg-[color:var(--cm-chat-bg,#fff)]" data-cm-contacts-screen="">
      {view.phase === "loading" ? <MessengerContactsLoading /> : null}
      {view.phase === "error" ? <MessengerContactsRetry onRetry={c.retry} /> : null}
      {view.phase === "disabled" ? (
        <p className="px-4 py-10 text-center text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
          {t("cm_contacts_feature_off")}
        </p>
      ) : null}
      {view.phase === "consent" ? <MessengerContactsConsentView onAgree={c.consentAndStart} onLater={goBack} /> : null}
      {/* 계정 전체 동기화 꺼짐 — 빈 목록 대신 꺼짐 안내 + 설정 (최종 점검 #7) */}
      {view.phase === "ready" && view.accountSyncOff ? (
        <div className="px-5 py-10 text-center" data-cm-contacts-account-off="">
          <p className="text-[16px] font-semibold" style={{ color: "var(--cm-chat-fg)" }}>
            {t("cm_contacts_account_off_title")}
          </p>
          <p className="mb-5 mt-1 text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
            {t("cm_contacts_account_off_desc")}
          </p>
          <Link href={MESSENGER_CONTACTS_SETTINGS_HREF} className={`${Sam.btn.primaryCombo} inline-flex`}>
            {t("cm_contacts_settings")}
          </Link>
        </div>
      ) : null}
      {view.phase === "ready" && !view.accountSyncOff ? (
        <>
          <MessengerContactsBanners
            view={view}
            onAddThisDevice={() => void c.answerNewDevice(true)}
            onLater={() => void c.answerNewDevice(false)}
            onRequestPermission={() => void c.requestPermissionAgain()}
            onTurnOn={() => void c.turnOnThisDevice()}
          />
          <MessengerFriendTabSectionLabel title={t("cm_contacts_members_count", { count: members.length })} />
          {view.listError && members.length === 0 ? (
            <MessengerContactsRetry compact onRetry={() => void c.reloadList()} />
          ) : members.length === 0 ? (
            <p className="px-4 py-6 text-center text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
              {t("cm_contacts_empty")}
            </p>
          ) : (
            members.map((m) => (
              <MessengerContactsMemberRow
                key={m.user_id}
                member={m}
                requestState={cta.requestStateOf(m)}
                name={nameOf(m)}
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
                  <button type="button" className={`${Sam.btn.secondaryCombo} ${MESSENGER_ROW_BTN_CLASS}`} onClick={invite}>
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
          name={nameOf(sheetMember)}
          deviceNumber={local ? findLocalNumberByRef(local.numbers, sheetMember.on_this_device ? sheetMember.client_ref : null) : null}
          callDefault={view.settings?.callDefault ?? "ask"}
          requestState={cta.requestStateOf(sheetMember)}
          onClose={() => setSheetMember(null)}
          onAddFriend={() => addFriend(sheetMember)}
          onAccept={() => accept(sheetMember, nameOf(sheetMember))}
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
      {shareSheet}
    </div>
  );
}
