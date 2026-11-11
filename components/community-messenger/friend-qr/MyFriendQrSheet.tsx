"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import { MyFriendQrPanel } from "@/components/community-messenger/friend-qr/MyFriendQrPanel";

/** 내 QR 시트 — 마이페이지 내 프로필·메신저 친구 탭 내 프로필 줄 진입점 (설계안 v3 §3.6 · 시안 B) */
export function MyFriendQrSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <MessengerHomeBottomSheetShell onClose={onClose} closeAriaLabel={t("nav_close")} dialogAriaLabel={t("friend_qr_tab_my")}>
      <div className="grid gap-3 px-4 pb-5 pt-4" data-testid="my-friend-qr-sheet">
        <p className="text-[length:var(--overlay-title-2-size)] font-semibold" style={{ color: "var(--overlay-text-primary)" }}>
          {t("friend_qr_tab_my")}
        </p>
        <MyFriendQrPanel />
      </div>
    </MessengerHomeBottomSheetShell>
  );
}
