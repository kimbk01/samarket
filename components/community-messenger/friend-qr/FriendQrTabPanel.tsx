"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import { MyFriendQrPanel } from "@/components/community-messenger/friend-qr/MyFriendQrPanel";
import { FriendQrScanPanel } from "@/components/community-messenger/friend-qr/FriendQrScanPanel";

/** QR 코드 시트 — [내 QR | QR 스캔] (설계안 v3 §3.6 · 시안 B·C) */
export function FriendQrTabPanel({
  onToken,
  initialMode = "my",
}: {
  onToken: (token: string) => void;
  initialMode?: "my" | "scan";
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"my" | "scan">(initialMode);
  return (
    <div className="space-y-3" data-testid="friend-qr-tab">
      {/** 탭 = 제품 공용 2단 탭(`Sam.tabs`) — 두 칸 같은 폭 */}
      <div className={`${Sam.tabs.bar} !static !bg-transparent`} role="tablist">
        {(["my", "scan"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`${mode === m ? Sam.tabs.tabActive : Sam.tabs.tab} !flex-1`}
          >
            {m === "my" ? t("friend_qr_tab_my") : t("friend_qr_tab_scan")}
          </button>
        ))}
      </div>
      {mode === "my" ? <MyFriendQrPanel /> : <FriendQrScanPanel onToken={onToken} />}
    </div>
  );
}
