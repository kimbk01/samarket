"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayConfirm } from "@/components/ui/dibay-overlay/DibayAppDialogProvider";
import { clearAppClientCaches } from "@/lib/mypage/clear-app-client-caches";
import { showMypageToast } from "@/lib/mypage/mypage-toast";

/** 캐시 삭제 — 확인 → 실제 삭제(Cache Storage·세션 임시·목록 캐시) → 토스트. 로그인·기기 설정은 보존 (D16) */
export function CacheSettingsContent() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const clear = async () => {
    if (inFlight.current) return;
    const ok = await dibayConfirm({
      title: t("mypage_cache_clear_confirm_title"),
      description: t("mypage_cache_clear_confirm_desc"),
      cancelLabel: t("common_cancel"),
      confirmLabel: t("settings_cache_clear"),
    });
    if (!ok) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await clearAppClientCaches();
      showMypageToast(t("mypage_cache_clear_done"), "success");
    } catch {
      showMypageToast(t("mypage_cache_clear_failed"), "error");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="sam-text-body text-sam-muted">{t("mypage_cache_clear_desc")}</p>
      <button
        type="button"
        onClick={() => void clear()}
        disabled={busy}
        aria-busy={busy}
        className="sam-btn sam-btn--secondary sam-btn--block"
      >
        {busy ? t("common_loading") : t("settings_cache_clear")}
      </button>
    </div>
  );
}
