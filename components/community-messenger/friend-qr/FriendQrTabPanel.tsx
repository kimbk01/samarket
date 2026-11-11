"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyFriendQrPanel } from "@/components/community-messenger/friend-qr/MyFriendQrPanel";
import { FriendQrScanPanel } from "@/components/community-messenger/friend-qr/FriendQrScanPanel";

/** 친구 추가 시트 「QR」 탭 — [내 QR | QR 스캔] (설계안 v3 §3.6 · 시안 B·C) */
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
      <div className="grid grid-cols-2 gap-1 rounded-full border border-[color:var(--overlay-border)] p-1" role="tablist">
        {(["my", "scan"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-full py-1.5 text-[length:var(--overlay-body-2-size)] font-semibold ${
              mode === m ? "bg-sam-primary text-sam-on-primary" : ""
            }`}
            style={mode === m ? undefined : { color: "var(--overlay-text-secondary)" }}
          >
            {m === "my" ? t("friend_qr_tab_my") : t("friend_qr_tab_scan")}
          </button>
        ))}
      </div>
      {mode === "my" ? <MyFriendQrPanel /> : <FriendQrScanPanel onToken={onToken} />}
    </div>
  );
}
