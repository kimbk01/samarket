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
 * 임시 데이터 삭제 (최종 설계 S17 · 용어 `docs/i18n-ssot.md` §4-2 — 「캐시」 는 매장 화폐라 쓰지 않음).
 * 지울 항목 설명 → 지우지 않는 것 → 하단 [임시 데이터 삭제].
 * 「지우는 항목」 은 `clearAppClientCaches` 실제 대상과 1:1 (2026-11-19): 시작 화면 미디어(Cache Storage) ·
 * 목록 저장본(local/session 레지스트리) · 채팅방 화면 사본(IndexedDB) · 스크롤 위치 등 화면 상태(session).
 * 2026-11-19 문구 정정: 실제로 지우는 것 = 등록된 목록·화면 저장 키 + Cache Storage(앱 시작 화면 인트로 미디어만 사용).
 * 게시글·채팅 사진(WebView HTTP 캐시)은 웹 코드로 지울 수 없어 「지우지 않는 항목」에 표시 — 실제 삭제는 네이티브 후속.
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
      title: t("popup_q_delete_cache"),
      cancelLabel: t("common_cancel"),
      confirmLabel: t("common_delete"),
      confirmTone: "destructive",
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
          <li>{t("mypage_s17_clears_lists")}</li>
          <li>{t("mypage_s17_clears_chat_rooms")}</li>
          <li>{t("mypage_s17_clears_screens")}</li>
        </ul>
      </MyGroup>
      <MyGroup title={t("mypage_s17_keeps_title")}>
        <ul className="list-disc space-y-1 px-4 py-3 pl-8 sam-text-body-secondary text-sam-fg md:px-5 md:pl-9">
          <li>{t("mypage_s17_keeps_login")}</li>
          <li>{t("mypage_s17_keeps_chats")}</li>
          <li>{t("mypage_s17_keeps_consent")}</li>
          <li>{t("mypage_s17_keeps_language")}</li>
          <li>{t("mypage_s17_keeps_drafts")}</li>
          <li>{t("mypage_s17_keeps_photos")}</li>
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
