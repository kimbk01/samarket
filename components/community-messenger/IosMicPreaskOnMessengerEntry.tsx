"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayInfoDialog } from "@/components/ui/dibay-overlay";
import {
  hasAnyPreaskNeed,
  markIosMicPreaskShown,
  requestIosPermissionsFromPreask,
  resolveIosPermissionPreaskNeeds,
  type IosPermissionPreaskNeeds,
} from "@/lib/community-messenger/ios-mic-preask";

/**
 * iOS 앱 · 회원 — 채팅 첫 진입 시 알림·마이크·카메라 권한 안내 1회 → 「계속」 하나로 iOS 시스템 창을 차례로.
 * 아직 묻지 않은 권한 줄만 보인다.
 * (App Store 5.1.1: 시스템 창 앞 안내에는 건너뛰기 버튼을 두지 않는다 — 닫아도 시스템 창으로 이어진다.)
 */
export function IosMicPreaskOnMessengerEntry() {
  const { t } = useI18n();
  const [needs, setNeeds] = useState<IosPermissionPreaskNeeds | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolveIosPermissionPreaskNeeds().then((resolved) => {
      if (cancelled || !hasAnyPreaskNeed(resolved)) return;
      markIosMicPreaskShown();
      setNeeds(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onContinue = () => {
    const current = needs;
    setNeeds(null);
    if (current) void requestIosPermissionsFromPreask(current);
  };

  const lines: string[] = [];
  if (needs?.notification) lines.push(t("cm_ui_perm_preask_line_notification"));
  if (needs?.microphone) lines.push(t("cm_ui_perm_preask_line_microphone"));
  if (needs?.camera) lines.push(t("cm_ui_perm_preask_line_camera"));

  return (
    <DibayInfoDialog
      open={needs !== null}
      title={t("cm_ui_mic_preask_title")}
      description={
        <span className="block">
          {lines.map((line) => (
            <span key={line} className="block">
              · {line}
            </span>
          ))}
          <span className="mt-2 block">{t("cm_ui_mic_preask_body")}</span>
        </span>
      }
      confirmLabel={t("cm_ui_mic_preask_continue")}
      onConfirm={onContinue}
    />
  );
}
