/**
 * 앱 진입 어드민 v3 §5 — 첫 진입 화면 6종(앱 `initialSurface` 값) ↔ 어드민 문구 키 · 회원 전용 여부.
 * 값 목록은 앱 단일 정의(`INITIAL_APP_SURFACES`)를 그대로 쓴다.
 */
import type { InitialAppSurface } from "@/lib/startup/initial-app-surface";
import type { MessageKey } from "@/lib/i18n/messages";

export const APP_ENTRY_SURFACE_LABEL_KEY: Record<InitialAppSurface, MessageKey> = {
  home: "admin_startup_config_surface_home",
  community: "admin_startup_config_surface_community",
  trade: "admin_startup_config_surface_trade",
  food: "admin_startup_config_surface_food",
  chat: "admin_startup_config_surface_chat",
  my: "admin_startup_config_surface_my",
};

/** telRING·MY 는 회원 화면 — 비회원은 홈으로 간다(카드에 표시) */
export const APP_ENTRY_MEMBERS_ONLY_SURFACES: ReadonlySet<InitialAppSurface> = new Set<InitialAppSurface>(["chat", "my"]);
