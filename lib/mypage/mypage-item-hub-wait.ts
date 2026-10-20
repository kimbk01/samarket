/**
 * 섹션 화면별 「내정보 전체 데이터(hub) 대기」 여부 (최종 설계 Part B 공통 전제 · §1.7).
 *
 * - 정적·설정 화면(S10~S19)은 hub 데이터를 기다리지 않는다 — 헤더와 본문을 즉시 그리고, 화면이 필요한 값만 스스로 조회.
 * - S09 결제정보 등 hub 값(`hasOwnerStore`·`ownerHubStoreId`)이 필요한 화면만 core(`loadMypageServerShell`) 시드를 쓴다.
 */
import type { MyScreenTemplate } from "@/components/mypage/ds/MyStateView";

const NO_HUB_WAIT_ITEMS: Readonly<Record<string, ReadonlySet<string>>> = {
  settings: new Set([
    "device-permissions",
    "notifications",
    "language",
    "country",
    "video-autoplay",
    "personalization",
    "chat-settings",
    "cache",
    "version",
    "leave",
  ]),
  account: new Set(["favorite-users", "blocked-users", "hidden-users"]),
};

export function isMypageItemWithoutHubWait(section: string, item: string): boolean {
  return NO_HUB_WAIT_ITEMS[section]?.has(item) ?? false;
}

/** 화면 유형(스켈레톤 모양) — 섹션 화면 SSOT */
export function mypageItemScreenTemplate(section: string, item: string): MyScreenTemplate {
  if (section === "account" && /-users$/.test(item)) return "list";
  if (section === "settings") {
    if (item === "cache" || item === "version" || item === "leave" || item === "language") return "static";
    return "settings";
  }
  if (section === "store" && item === "payment") return "hub";
  return "list";
}
