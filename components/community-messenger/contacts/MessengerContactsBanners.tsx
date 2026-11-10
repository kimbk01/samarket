"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import { MESSENGER_ROW_BTN_CLASS } from "@/components/community-messenger/friend-cta/MessengerFriendRelationCta";
import { isContactsAppUpdateNeeded, openContactsAppSettings } from "@/lib/community-messenger/contacts/contacts-native";
import type { MessengerContactsView } from "@/lib/community-messenger/contacts/use-messenger-contacts";

function Banner({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="mx-4 my-2 flex items-center gap-3 rounded-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--cm-chat-band)] px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold" style={{ color: "var(--cm-chat-fg)" }}>
          {title}
        </p>
        {desc ? (
          <p className="text-[12.5px]" style={{ color: "var(--cm-chat-sub)" }}>
            {desc}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** 권한 꺼짐 · 다른 기기 결과만 있음 · 앱 업데이트 필요 · 웹 보기 전용 안내 (상태별 1개) */
export function MessengerContactsBanners({
  view,
  onAddThisDevice,
  onLater,
  onRequestPermission,
}: {
  view: MessengerContactsView;
  onAddThisDevice: () => void;
  onLater: () => void;
  onRequestPermission: () => void;
}) {
  const { t } = useI18n();
  if (view.otherDeviceOnly) {
    return (
      <Banner title={t("cm_contacts_new_device_title")} desc={t("cm_contacts_new_device_desc")}>
        <div className="flex shrink-0 flex-col gap-1">
          <button type="button" className={`${Sam.btn.primaryCombo} ${MESSENGER_ROW_BTN_CLASS}`} onClick={onAddThisDevice}>
            {t("cm_contacts_new_device_add")}
          </button>
          <button type="button" className={`${Sam.btn.ghostCombo} ${MESSENGER_ROW_BTN_CLASS}`} onClick={onLater}>
            {t("cm_contacts_later")}
          </button>
        </div>
      </Banner>
    );
  }
  if (view.nativeAvailable && view.permission === "denied") {
    return (
      <Banner title={t("cm_contacts_permission_off_title")} desc={t("cm_contacts_permission_off_desc")}>
        <button type="button" className={`${Sam.btn.secondaryCombo} ${MESSENGER_ROW_BTN_CLASS}`} onClick={() => void openContactsAppSettings()}>
          {t("cm_contacts_open_settings")}
        </button>
      </Banner>
    );
  }
  if (view.nativeAvailable && view.permission === "prompt") {
    return (
      <Banner title={t("cm_contacts_start_title")} desc={t("cm_contacts_start_desc")}>
        <button type="button" className={`${Sam.btn.primaryCombo} ${MESSENGER_ROW_BTN_CLASS}`} onClick={onRequestPermission}>
          {t("cm_contacts_start_cta")}
        </button>
      </Banner>
    );
  }
  if (!view.nativeAvailable) {
    // 앱인데 연락처 플러그인이 없는 예전 바이너리 → 「앱 업데이트」 (웹 안내 문구를 앱에 띄우지 않는다 — 최종 점검 #4)
    return <Banner title={t(isContactsAppUpdateNeeded() ? "cm_contacts_app_update_needed" : "cm_contacts_web_only_view")} />;
  }
  return null;
}
