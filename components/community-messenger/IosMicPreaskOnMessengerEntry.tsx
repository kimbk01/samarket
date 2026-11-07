"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayInfoDialog } from "@/components/ui/dibay-overlay";
import {
  markIosMicPreaskShown,
  requestIosMicFromPreask,
  shouldShowIosMicPreask,
} from "@/lib/community-messenger/ios-mic-preask";

/**
 * iOS 앱 · 회원 — 채팅 첫 진입 시 마이크 권한 안내 1회 → 「계속」 하나로 iOS 시스템 창.
 * (App Store 5.1.1: 시스템 창 앞 안내에는 건너뛰기 버튼을 두지 않는다 — 닫아도 시스템 창으로 이어진다.)
 */
export function IosMicPreaskOnMessengerEntry() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void shouldShowIosMicPreask().then((show) => {
      if (cancelled || !show) return;
      markIosMicPreaskShown();
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onContinue = () => {
    setOpen(false);
    void requestIosMicFromPreask();
  };

  return (
    <DibayInfoDialog
      open={open}
      title={t("cm_ui_mic_preask_title")}
      description={t("cm_ui_mic_preask_body")}
      confirmLabel={t("cm_ui_mic_preask_continue")}
      onConfirm={onContinue}
    />
  );
}
