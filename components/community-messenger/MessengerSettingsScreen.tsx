"use client";

import { useEffect, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { MESSENGER_CONTACTS_SETTINGS_HREF } from "@/lib/community-messenger/contacts/contacts-contract";
import { syncMessengerImageAutoSaveEnabled } from "@/lib/community-messenger/attachment/messenger-image-auto-save";
import {
  getMessengerPhotoSaveDiagnostics,
  type MessengerPhotoSaveDiagnostics,
} from "@/lib/community-messenger/attachment/messenger-image-save";
import { CommunityMessengerDeviceSettingsSection } from "@/components/community-messenger/CommunityMessengerDeviceSettingsSection";
import { MESSENGER_ROW_BTN_OVERLAY_SECONDARY } from "@/components/community-messenger/friend-cta/MessengerFriendRelationCta";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { NavRow, SectionLabel, SwitchRow } from "@/components/community-messenger/settings/MessengerSettingsRows";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import type { CommunityMessengerLocalSettings } from "@/lib/community-messenger/preferences";
import type { MessengerNotificationSettings } from "@/lib/community-messenger/home/community-messenger-home-types";
import type { MessengerSettingsPage } from "@/lib/community-messenger/messenger-sub-screen-route";
import {
  MESSENGER_SETTINGS_ROOT_GROUPS,
  messengerSoundVibrationChecked,
  messengerSoundVibrationPatch,
} from "@/lib/community-messenger/messenger-settings-screen-model";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

export type MessengerSettingsScreenProps = {
  page: MessengerSettingsPage;
  /** 설정 상세 열기 (기록을 쌓는다 — 머리글 뒤로 = 설정 첫 화면) */
  onOpenPage: (page: Exclude<MessengerSettingsPage, "root">) => void;
  busyId: string | null;
  blockedCount: number;
  hiddenCount: number;
  favoriteManageFriends: CommunityMessengerProfileLite[];
  notificationSettings: MessengerNotificationSettings;
  /** 서버 알림 설정 저장 (`/api/me/notification-settings` PATCH — 여러 칸을 한 번에) */
  updateNotificationSettings: (patch: Partial<MessengerNotificationSettings>) => void | Promise<void>;
  incomingCallSoundEnabled: boolean;
  onIncomingCallSoundChange: (next: boolean) => void;
  incomingCallBannerEnabled: boolean;
  onIncomingCallBannerChange: (next: boolean) => void;
  localSettings: CommunityMessengerLocalSettings;
  updateLocalSetting: (key: keyof CommunityMessengerLocalSettings, value: boolean) => void;
  /** 「친구 관리」 → 보관함(「친구」 묶음 먼저) */
  onOpenFriendManage: () => void;
  onToggleFavoriteFriend: (userId: string) => void | Promise<void>;
  exportSettingsBackup: () => void;
  backupInputRef: RefObject<HTMLInputElement | null>;
  onBackupFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  /** 모임 찾기 (기존 「모임 찾기」 시트) */
  onOpenOpenChatDiscovery: () => void;
  /** 모임 만들기 (기존 모임 만들기 시트) */
  onOpenOpenGroupCreate: () => void;
};

/**
 * 채팅 설정 (채팅 시안 4판 「7. 채팅 설정」, Owner 「정확히 시안대로」 2026-11-10) — 아래 시트가 아니라 하위 화면.
 * 머리글(뒤로 + 가운데 「채팅 설정」 / 상세 이름)은 1단 공통 하위 화면 머리글이 그린다.
 * 첫 화면: 「알림」 켬/끔 4줄(56) · 「통화」·「대화」·「모임」·「친구」 각 한 줄(54, ›) → 상세 화면.
 * 상세 화면 내용은 예전 설정 시트 그대로(동작 같음).
 */
export function MessengerSettingsScreen(props: MessengerSettingsScreenProps) {
  const bottomNavOccupiesClearance = useBottomNavOccupiesClearance();
  return (
    <section
      className={`min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain ${
        bottomNavOccupiesClearance ? "pb-[var(--app-bottom-nav-clearance)]" : "pb-[var(--safe-bottom)]"
      }`}
      data-cm-settings-screen={props.page}
    >
      {props.page === "root" ? <SettingsRoot {...props} /> : null}
      {props.page === "call" ? <SettingsCallPage {...props} /> : null}
      {props.page === "conversation" ? <SettingsConversationPage {...props} /> : null}
      {props.page === "meeting" ? <SettingsMeetingPage {...props} /> : null}
      {props.page === "friends" ? <SettingsFriendsPage {...props} /> : null}
    </section>
  );
}

function SettingsRoot({
  busyId,
  notificationSettings,
  updateNotificationSettings,
  onOpenPage,
}: MessengerSettingsScreenProps) {
  const { t } = useI18n();
  const ns = notificationSettings;
  const busy = (key: string) => busyId === `notification-setting:${key}`;
  return (
    <>
      <SectionLabel>{t("common_notifications")}</SectionLabel>
      <SwitchRow
        title={t("cm_settings_notif_messenger")}
        checked={ns.community_chat_enabled}
        disabled={busy("community_chat_enabled")}
        onChange={(next) => void updateNotificationSettings({ community_chat_enabled: next })}
      />
      <SwitchRow
        title={t("cm_settings_notif_trade")}
        checked={ns.trade_chat_enabled}
        disabled={busy("trade_chat_enabled")}
        onChange={(next) => void updateNotificationSettings({ trade_chat_enabled: next })}
      />
      <SwitchRow
        title={t("cm_settings_notif_order")}
        checked={ns.order_enabled}
        disabled={busy("order_enabled")}
        onChange={(next) => void updateNotificationSettings({ order_enabled: next })}
      />
      <SwitchRow
        title={t("cm_settings_notif_sound_vibration")}
        checked={messengerSoundVibrationChecked(ns)}
        disabled={busy("sound_enabled") || busy("vibration_enabled") || busy("sound_enabled+vibration_enabled")}
        onChange={(next) => void updateNotificationSettings(messengerSoundVibrationPatch(next))}
      />
      {MESSENGER_SETTINGS_ROOT_GROUPS.map((g) => (
        <div key={g.page}>
          <SectionLabel>{t(g.labelKey)}</SectionLabel>
          <NavRow title={t(g.rowKey)} onClick={() => onOpenPage(g.page)} dataPage={g.page} />
        </div>
      ))}
    </>
  );
}

function SettingsCallPage({
  incomingCallSoundEnabled,
  onIncomingCallSoundChange,
  incomingCallBannerEnabled,
  onIncomingCallBannerChange,
}: MessengerSettingsScreenProps) {
  const { t } = useI18n();
  return (
    <>
      <SectionLabel>{t("cm_settings_call_incoming")}</SectionLabel>
      <SwitchRow
        title={t("cm_ui_incoming_call_bell")}
        description={t("cm_ui_incoming_call_bell_desc")}
        checked={incomingCallSoundEnabled}
        onChange={onIncomingCallSoundChange}
      />
      <SwitchRow
        title={t("cm_ui_incoming_call_screen_guide")}
        description={t("cm_ui_banner_overlay")}
        checked={incomingCallBannerEnabled}
        onChange={onIncomingCallBannerChange}
      />
      <SectionLabel>{t("cm_ui_call_devices")}</SectionLabel>
      <div className="px-4 pb-4">
        <CommunityMessengerDeviceSettingsSection visible embedded />
      </div>
    </>
  );
}

function SettingsConversationPage({
  localSettings,
  updateLocalSetting,
  exportSettingsBackup,
  backupInputRef,
  onBackupFileSelected,
}: MessengerSettingsScreenProps) {
  const { t } = useI18n();
  /**
   * 자동 저장은 네이티브 사진첩 저장(saveImages)이 있는 앱에서만 동작 — 아니면 설명에 업데이트 안내.
   * 앱 셸이면 설치된 바이너리 버전·빌드와 저장 엔진 상태를 함께 보여 준다(Android·iOS 실기기 검증용).
   */
  const [photoSaveDiag, setPhotoSaveDiag] = useState<MessengerPhotoSaveDiagnostics | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getMessengerPhotoSaveDiagnostics().then((diag) => {
      if (!cancelled) setPhotoSaveDiag(diag);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const autoSaveNativeSupported = photoSaveDiag ? photoSaveDiag.mode === "native" : null;
  const photoSaveDiagText =
    photoSaveDiag && (photoSaveDiag.mode === "native" || photoSaveDiag.mode === "update_required")
      ? [
          t(photoSaveDiag.mode === "native" ? "cm_ui_photo_save_diag_native" : "cm_ui_photo_save_diag_update_required"),
          t("cm_ui_photo_save_diag_app", {
            version: photoSaveDiag.appVersion ?? "?",
            build: photoSaveDiag.appBuild ?? "?",
          }),
          /** 판정 근거 코드 — 실기기 캡처로 구버전/플러그인 누락/브리지 이상을 구분한다. */
          `[${photoSaveDiag.headerState ?? "?"}]`,
        ].join(" · ")
      : null;
  return (
    <>
      <SectionLabel>{t("cm_settings_page_conversation")}</SectionLabel>
      <SwitchRow
        title={t("cm_ui_media_auto_save")}
        description={[
          autoSaveNativeSupported === false
            ? `${t("cm_ui_open_files_images_with_save_focus")} ${t("cm_ui_media_auto_save_requires_update")}`
            : t("cm_ui_open_files_images_with_save_focus"),
          photoSaveDiagText,
        ]
          .filter(Boolean)
          .join(" ")}
        checked={localSettings.mediaAutoSaveEnabled}
        onChange={(next) => {
          /** 켠 시각 이후 받은 사진만 자동 저장(과거 사진 일괄 저장 방지), 끄면 기준·권한 재시도 초기화 */
          syncMessengerImageAutoSaveEnabled(next);
          updateLocalSetting("mediaAutoSaveEnabled", next);
        }}
      />
      <SwitchRow
        title={t("cm_ui_check_info_before_join")}
        description={t("cm_ui_check_meeting_info_before_join")}
        checked={localSettings.groupJoinPreviewEnabled}
        onChange={(next) => updateLocalSetting("groupJoinPreviewEnabled", next)}
      />
      <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2" data-cm-settings-backup="">
        <span className="min-w-0">
          <span className="block text-[16px] leading-[1.35]" style={{ color: "var(--cm-chat-fg)" }}>
            {t("cm_ui_chat_backup")}
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: "var(--cm-chat-sub)" }}>
            {t("cm_ui_backup_settings_recent_device")}
          </span>
        </span>
        <span className="flex shrink-0 gap-1.5">
          <button type="button" onClick={exportSettingsBackup} className={MESSENGER_ROW_BTN_OVERLAY_SECONDARY}>
            {t("cm_ui_export")}
          </button>
          <button
            type="button"
            onClick={() => backupInputRef.current?.click()}
            className={MESSENGER_ROW_BTN_OVERLAY_SECONDARY}
          >
            {t("cm_ui_import")}
          </button>
        </span>
      </div>
      <input
        ref={backupInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(event) => void onBackupFileSelected(event)}
      />
    </>
  );
}

function SettingsMeetingPage({ onOpenOpenChatDiscovery, onOpenOpenGroupCreate }: MessengerSettingsScreenProps) {
  const { t } = useI18n();
  return (
    <>
      <SectionLabel>{t("cm_settings_page_meeting")}</SectionLabel>
      <NavRow
        title={t("cm_ui_find_meeting")}
        description={t("cm_ui_open_joinable_meetings")}
        onClick={onOpenOpenChatDiscovery}
        dataPage="meeting-find"
      />
      <NavRow
        title={t("cm_settings_meeting_create")}
        description={t("cm_ui_create_open_group_room")}
        onClick={onOpenOpenGroupCreate}
        dataPage="meeting-create"
      />
    </>
  );
}

function SettingsFriendsPage({
  busyId,
  blockedCount,
  hiddenCount,
  favoriteManageFriends,
  onOpenFriendManage,
  onToggleFavoriteFriend,
}: MessengerSettingsScreenProps) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <>
      <SectionLabel>{t("cm_settings_friends_contacts")}</SectionLabel>
      {/* 연락처 동기화 (SSOT v5 §13) — 예전 무동작 스위치 2개 대신 설정 화면으로 */}
      <NavRow
        title={t("cm_contacts_settings")}
        description={t("cm_contacts_start_desc")}
        onClick={() => router.push(MESSENGER_CONTACTS_SETTINGS_HREF)}
        dataPage="contacts-sync"
      />
      <SectionLabel>{t("cm_ui_manage_favorites")}</SectionLabel>
      {favoriteManageFriends.length ? (
        <ul role="list">
          {favoriteManageFriends.map((friend) => (
            <li key={friend.id} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
              <span className="min-w-0">
                <span className="block truncate text-[16px] leading-[1.35]" style={{ color: "var(--cm-chat-fg)" }}>
                  {friend.label}
                </span>
                <span className="block truncate text-[12.5px] leading-snug" style={{ color: "var(--cm-chat-sub)" }}>
                  {friend.isHiddenFriend ? t("cm_ui_hidden_friend_keep_favorite") : friend.subtitle ?? t("cm_ui_favorite")}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void onToggleFavoriteFriend(friend.id)}
                disabled={busyId === `favorite:${friend.id}`}
                className={MESSENGER_ROW_BTN_OVERLAY_SECONDARY}
              >
                {t("cm_ui_release")}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
          {t("cm_ui_no_favorite_friends")}
        </p>
      )}
      <SectionLabel>{t("cm_ui_friend_manage")}</SectionLabel>
      <NavRow
        title={t("cm_ui_friend_manage")}
        description={`${t("cm_ui_hidden_friends")} ${hiddenCount} · ${t("cm_ui_blocked_friends")} ${blockedCount}`}
        onClick={onOpenFriendManage}
        dataPage="friend-manage"
      />
    </>
  );
}
