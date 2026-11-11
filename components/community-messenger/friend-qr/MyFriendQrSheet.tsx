"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import { FriendQrTabPanel } from "@/components/community-messenger/friend-qr/FriendQrTabPanel";
import { buildFriendQrHomePath } from "@/lib/community-messenger/friend-qr/friend-qr-contract";
import { useFriendQrResultStore } from "@/lib/community-messenger/friend-qr/friend-qr-result-store";

/**
 * QR 시트 — [내 QR | QR 스캔] (설계안 v3 §3.6 · 시안 B·C). 진입 = 마이페이지 내 프로필·메신저 친구 탭 내 프로필 줄.
 * 스캔 결과 시트는 메신저 홈의 `FriendQrResultHost` 하나만 그린다:
 * 메신저 안이면 결과 스토어로 바로 열고, 다른 화면(마이페이지)이면 `?friendQr=` 주소로 메신저 홈에 넘긴다.
 * (11-10 채팅 화면 개편으로 친구 추가 시트를 여는 버튼이 없어져 스캔 진입을 이 시트로 옮김)
 */
export function MyFriendQrSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const onToken = useCallback(
    (token: string) => {
      onClose();
      if (pathname?.startsWith("/community-messenger")) {
        useFriendQrResultStore.getState().open(token);
        return;
      }
      router.push(buildFriendQrHomePath(token));
    },
    [onClose, pathname, router]
  );
  return (
    <MessengerHomeBottomSheetShell onClose={onClose} closeAriaLabel={t("nav_close")} dialogAriaLabel={t("friend_qr_sheet_title")}>
      <div className="grid gap-3 px-4 pb-5 pt-4" data-testid="my-friend-qr-sheet">
        <p className="text-[length:var(--overlay-title-2-size)] font-semibold" style={{ color: "var(--overlay-text-primary)" }}>
          {t("friend_qr_sheet_title")}
        </p>
        <FriendQrTabPanel onToken={onToken} />
      </div>
    </MessengerHomeBottomSheetShell>
  );
}
