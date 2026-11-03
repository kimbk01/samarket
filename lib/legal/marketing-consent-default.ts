/**
 * 혜택·이벤트 수신 동의 (선택) — 어드민 `/admin/app/legal` 의 `marketing` 문서가 정본.
 * 아래는 게시 문서가 없거나 읽지 못할 때만 쓰는 기본 문구(첫 게시 문서 시드와 같은 글).
 * 제목 = 가입 화면 체크박스 · 내정보 스위치 이름, 본문 = 전문 (Owner 지시 2026-11-03).
 */
export const MARKETING_CONSENT_DEFAULT_VERSION = "2026-11-03";

export const MARKETING_CONSENT_DEFAULT: Record<"ko" | "en", { title: string; body: string }> = {
  ko: {
    title: "혜택·이벤트 알림 받기",
    body: [
      "DIBAY 가 진행하는 이벤트, 할인·쿠폰 등 혜택 소식을 앱 푸시 알림으로 보내 드립니다.",
      "동의하지 않아도 DIBAY 의 모든 서비스를 이용할 수 있습니다. 공지사항·시스템 안내·업데이트 소식은 동의와 관계없이 받으며, 혜택·이벤트 소식도 앱 알림함에서는 언제든 볼 수 있습니다.",
      "동의는 내정보 › 알림 설정 › 혜택·이벤트 알림에서 언제든 끄거나 다시 켤 수 있습니다.",
    ].join("\n\n"),
  },
  en: {
    title: "Receive benefits & events notifications",
    body: [
      "DIBAY sends news about events, discounts, coupons and other benefits as app push notifications.",
      "You can use every DIBAY service without agreeing. Notices, system notices and update news are sent regardless, and benefits & events news is always available in the in-app notification inbox.",
      "You can turn this off or back on at any time in My info › Notification settings › Benefits & events notifications.",
    ].join("\n\n"),
  },
};

/** 회원 전문 화면 경로 — 가입 동의 전에도 열리는 `/privacy` 아래 (가입 게이트 허용 경로). */
export const MARKETING_CONSENT_DOC_PATH = "/privacy/marketing";
