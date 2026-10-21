"use client";

import { resolveMyStickyCtaBodyClearanceClass } from "@/lib/mypage/my-sticky-cta-placement";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayConfirm } from "@/components/ui/dibay-overlay/DibayAppDialogProvider";
import { MyStickyCta } from "@/components/mypage/ds/MyStickyCta";
import { MyGroup } from "@/components/mypage/ds/MyGroup";
import { clearAppClientCaches } from "@/lib/mypage/clear-app-client-caches";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { useMypageSubmitGuard } from "@/lib/mypage/use-mypage-submit-guard";

/**
 * 캐시 삭제 (최종 설계 S17) — 지울 항목 설명 → 지우지 않는 것 → 하단 [캐시 삭제].
 * 확인 → 레지스트리 키만 삭제(`client-cache-key-registry`) → 토스트. 진행 중 = 버튼 안 스피너.
 * 정적 화면 — 로딩 없음, 서버 요청 0.
 */
export function CacheSettingsContent() {
  /** 하단탭 실제 마운트 기준 CTA 본문 여백 — 탭 있음/없음 safe 1회 (M-04) */
  const stickyCtaBodyClearanceClass = resolveMyStickyCtaBodyClearanceClass(useBottomNavOccupiesClearance());
  const { t } = useI18n();
  const { run, pending } = useMypageSubmitGuard();

  const clear = async () => {
    if (pending) return;
    const ok = await dibayConfirm({
      title: t("mypage_cache_clear_confirm_title"),
      description: t("mypage_cache_clear_confirm_desc"),
      cancelLabel: t("common_cancel"),
      confirmLabel: t("settings_cache_clear"),
    });
    if (!ok) return;
    await run(async () => {
      try {
        await clearAppClientCaches();
        showMypageToast(t("mypage_cache_clear_done"), "success");
      } catch {
        showMypageToast(t("mypage_cache_clear_failed"), "error");
      }
    });
  };

  return (
    <div className={`space-y-2 ${stickyCtaBodyClearanceClass}`} data-testid="cache-settings">
      <p className="px-1 pb-1 sam-text-body text-sam-muted">{t("mypage_cache_clear_desc")}</p>
      <MyGroup title={t("mypage_s17_clears_title")}>
        <ul className="list-disc space-y-1 px-4 py-3 pl-8 sam-text-body-secondary text-sam-fg md:px-5 md:pl-9">
          <li>{t("mypage_s17_clears_images")}</li>
          <li>{t("mypage_s17_clears_screens")}</li>
          <li>{t("mypage_s17_clears_lists")}</li>
        </ul>
      </MyGroup>
      <MyGroup title={t("mypage_s17_keeps_title")}>
        <ul className="list-disc space-y-1 px-4 py-3 pl-8 sam-text-body-secondary text-sam-fg md:px-5 md:pl-9">
          <li>{t("mypage_s17_keeps_login")}</li>
          <li>{t("mypage_s17_keeps_consent")}</li>
          <li>{t("mypage_s17_keeps_language")}</li>
          <li>{t("mypage_s17_keeps_drafts")}</li>
        </ul>
      </MyGroup>
      <MyStickyCta
        dirty
        primaryTone="secondary"
        primary={{ label: t("settings_cache_clear"), onPress: () => void clear(), loading: pending }}
      />
    </div>
  );
}
