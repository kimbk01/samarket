/**
 * DIBAY 통합 공유 CTA SSOT (S2) — 같은 동작 = 같은 이름.
 * 설계: docs/audit/dibay-unified-share-audit-design-2026-11-14.md §E · 시안 5절.
 * 「공유하기」= 공유 시트 열기 · 「다른 앱으로 공유」= 기기 공유 · 「링크 복사」= 직접 복사.
 * 실패·취소 때 링크를 대신 복사했다는 문구는 두지 않는다(§I-1). 전달 확정 문구(「보냈어요」)도 두지 않는다.
 */
import { APP_PRODUCT_DISPLAY_NAME as APP } from "../../brand/app-display-name";
import { DIBAY_SERVICE_BRAND as B } from "../../brand/dibay-service-brand";

export const shareMessages = {
  ko: {
    share_cta_open: "공유하기",
    share_sheet_title: "공유하기",
    share_option_native: "다른 앱으로 공유",
    share_option_copy: "링크 복사",
    share_toast_copied: "링크를 복사했어요",
    share_toast_failed: "공유하지 못했어요",
    share_toast_copy_failed: "링크를 복사하지 못했어요",
    share_no_option: "지금은 공유할 수 없어요",
    /** 앱 공유 (Owner G-1 2026-11-14) — 소개 문구 = PWA 설명(`lib/pwa/dibay-web-app-manifest.ts`) 그대로 */
    share_app_row: `${APP} 공유하기`,
    share_app_desc: `필리핀 거주 한국인을 위한 ${B.MARKET}·${B.LOUNGE}·${B.DIPICK}·${B.LETARING}`,
    share_app_page_title: `${APP} 앱`,
    share_app_cta_install: "앱 설치하기",
    share_app_cta_app_store: "App Store",
    share_app_cta_web: "웹에서 둘러보기",
    share_app_in_app: "지금 앱에서 보고 있어요",
    /** 메시지 「전달하기」 (통합 공유 S6 · G-4·G-5 · 시안 3절) */
    share_forward_cta: "전달하기",
    share_forward_title: "전달하기",
    share_forward_recent: "최근 채팅",
    share_forward_friends: "친구",
    share_forward_submit: "전달하기 ({count})",
    share_forward_limit: "최대 {max}곳까지 보낼 수 있어요",
    share_forward_empty: "보낼 수 있는 대화가 없어요",
    share_forward_done: "{count}곳에 전달했어요",
    share_forward_failed_title: "전달하지 못한 곳",
    share_forward_retry: "다시 시도 ({count})",
    share_forward_err_retry: "연결이 불안정해요 · 다시 시도할 수 있어요",
    share_forward_err_not_allowed: "이 대화방에는 보낼 수 없어요",
    share_forward_err_source: "이 메시지는 전달할 수 없어요",
    share_forwarded_label: "전달됨",
  },
  en: {
    share_cta_open: "Share",
    share_sheet_title: "Share",
    share_option_native: "Share to other apps",
    share_option_copy: "Copy link",
    share_toast_copied: "Link copied",
    share_toast_failed: "Couldn't share",
    share_toast_copy_failed: "Couldn't copy the link",
    share_no_option: "You can't share right now",
    share_app_row: `Share ${APP}`,
    share_app_desc: `${B.MARKET}·${B.LOUNGE}·${B.DIPICK}·${B.LETARING} for Koreans in the Philippines`,
    share_app_page_title: `${APP} app`,
    share_app_cta_install: "Install the app",
    share_app_cta_app_store: "App Store",
    share_app_cta_web: "Browse on the web",
    share_app_in_app: "You're already in the app",
    share_forward_cta: "Forward",
    share_forward_title: "Forward",
    share_forward_recent: "Recent chats",
    share_forward_friends: "Friends",
    share_forward_submit: "Forward ({count})",
    share_forward_limit: "You can send to up to {max} chats",
    share_forward_empty: "No chats to send to",
    share_forward_done: "Forwarded to {count}",
    share_forward_failed_title: "Not sent",
    share_forward_retry: "Try again ({count})",
    share_forward_err_retry: "Connection problem · you can try again",
    share_forward_err_not_allowed: "You can't send to this chat",
    share_forward_err_source: "This message can't be forwarded",
    share_forwarded_label: "Forwarded",
  },
} as const;
