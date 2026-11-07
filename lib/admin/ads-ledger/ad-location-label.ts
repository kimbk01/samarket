/**
 * 광고 위치 문구 — 단일 함수 (설계 §1-1 ③ · §1-3 위치 예문 · §5 위치 지도).
 * 공통 원장 · 도메인 메뉴(같은 원장 + `?domain=`) · 위치 지도가 모두 이 함수만 쓴다.
 * 입력 = DB `admin_ads_ledger_rows` 의 위치 키(location_key) · 대상(location_target: 업종 slug·카테고리 id·주제 slug·팝업 화면 목록) · 대상 이름.
 */
import type { AdsLedgerKind } from "@/lib/admin/ads-control-plane/types";
import { ledgerText, type AdsLedgerTextKey } from "@/lib/admin/ads-ledger/ledger-text";

export type AdLocationInput = {
  kind?: AdsLedgerKind | string | null;
  locationKey: string | null | undefined;
  locationTarget?: string | null;
  locationTargetName?: string | null;
};

const POPUP_SURFACE_KEY: Record<string, AdsLedgerTextKey> = {
  GLOBAL: "ads_ledger_surface_global",
  COMMUNITY: "ads_ledger_surface_community",
  TRADE: "ads_ledger_surface_trade",
  DELIVERY: "ads_ledger_surface_delivery",
  DELIVERY_OWNER: "ads_ledger_surface_delivery_owner",
  ADMIN: "ads_ledger_surface_admin",
  MYPAGE: "ads_ledger_surface_mypage",
};

function surfacesOf(target: string | null | undefined): string[] {
  const list = String(target ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return list.length ? list : ["GLOBAL"];
}

/** 팝업 화면 목록 → 「커뮤니티·거래·배달·내정보」 */
export function adPopupSurfacesLabel(target: string | null | undefined, ko: boolean): string {
  return surfacesOf(target)
    .map((s) => (POPUP_SURFACE_KEY[s] ? ledgerText(POPUP_SURFACE_KEY[s], ko) : s))
    .join("·");
}

/** PTR 화면 목록 → 「커뮤니티·거래·매장 홈·browse」 (GLOBAL = 4화면 전부 · DELIVERY = 매장 홈·browse) */
export function adPtrSurfacesLabel(target: string | null | undefined, ko: boolean): string {
  const list = surfacesOf(target);
  if (list.includes("GLOBAL")) return ledgerText("ads_ledger_ptr_global", ko);
  return list
    .map((s) =>
      s === "DELIVERY"
        ? ledgerText("ads_ledger_ptr_delivery", ko)
        : POPUP_SURFACE_KEY[s]
          ? ledgerText(POPUP_SURFACE_KEY[s], ko)
          : s
    )
    .join("·");
}

function named(
  withName: AdsLedgerTextKey,
  without: AdsLedgerTextKey,
  input: AdLocationInput,
  ko: boolean
): string {
  const name = String(input.locationTargetName ?? "").trim() || String(input.locationTarget ?? "").trim();
  return name ? ledgerText(withName, ko, { name }) : ledgerText(without, ko);
}

/** 화면 › 자리 › 대상 (설계 §1-3 예문 그대로). 알 수 없는 키는 「위치 확인 못 함」 — 원문 코드값을 보이지 않는다. */
export function adLocationLabel(input: AdLocationInput, ko: boolean): string {
  const key = String(input.locationKey ?? "").trim().toUpperCase();
  switch (key) {
    case "TRADE_BOOST_TOP":
      return ledgerText("ads_ledger_loc_trade_boost", ko);
    case "COMMUNITY_BOOST_TOP":
      return ledgerText("ads_ledger_loc_community_boost", ko);
    case "TRADE_HOME":
      return ledgerText("ads_ledger_loc_trade_home_feed", ko);
    case "TRADE_CATEGORY":
      return named("ads_ledger_loc_trade_category_feed", "ads_ledger_loc_trade_category_feed_any", input, ko);
    case "COMMUNITY_HOME":
      return ledgerText("ads_ledger_loc_community_home_feed", ko);
    case "COMMUNITY_TOPIC":
      return named("ads_ledger_loc_community_topic_feed", "ads_ledger_loc_community_topic_feed_any", input, ko);
    case "STORES_HOME_HERO":
      return ledgerText("ads_ledger_loc_delivery_hero", ko);
    case "STORES_HOME_INLINE_1":
      return ledgerText("ads_ledger_loc_delivery_inline", ko);
    case "STORES_CATEGORY_TOP":
      return named("ads_ledger_loc_delivery_category_top", "ads_ledger_loc_delivery_category_top_any", input, ko);
    case "STORES_CATEGORY_INLINE":
      return named("ads_ledger_loc_delivery_category_inline", "ads_ledger_loc_delivery_category_inline_any", input, ko);
    case "STORES_SEARCH_TOP":
      return ledgerText("ads_ledger_loc_delivery_search_top", ko);
    case "STORE_DETAIL_RECOMMENDATION_BANNER":
      return ledgerText("ads_ledger_loc_delivery_store_detail", ko);
    case "STORES_HOME_FEED":
      return ledgerText("ads_ledger_loc_delivery_list_home", ko);
    case "STORES_CATEGORY_FEED":
      return named("ads_ledger_loc_delivery_list_category", "ads_ledger_loc_delivery_list_category_any", input, ko);
    case "POPUP":
      return ledgerText("ads_ledger_loc_popup", ko, { surfaces: adPopupSurfacesLabel(input.locationTarget, ko) });
    case "PTR":
      return ledgerText("ads_ledger_loc_ptr", ko, { surfaces: adPtrSurfacesLabel(input.locationTarget, ko) });
    case "MYPAGE_TOP":
      return ledgerText("ads_ledger_loc_mypage", ko);
    case "APP_INTRO":
      return ledgerText("ads_ledger_loc_intro", ko);
    case "EVENT_HERO": {
      const screen = String(input.locationTarget ?? "").trim().toUpperCase();
      const screenKey: AdsLedgerTextKey | null =
        screen === "TRADE_HOME"
          ? "ads_ledger_screen_trade_home"
          : screen === "COMMUNITY_HOME"
            ? "ads_ledger_screen_community_home"
            : screen === "STORES_HOME" || screen === "DELIVERY_HOME"
              ? "ads_ledger_screen_delivery_home"
              : null;
      return screenKey
        ? ledgerText("ads_ledger_loc_event_hero", ko, { screen: ledgerText(screenKey, ko) })
        : ledgerText("ads_ledger_loc_event_hero_any", ko);
    }
    default:
      return ledgerText("ads_ledger_loc_unknown", ko);
  }
}

/** 위치 지도 칸 → 원장 거름 값 (`?location=KEY` 또는 `KEY|대상`) — DB `admin_ads_ledger_page.p_location` 과 같은 형식. */
export function adLocationFilterValue(locationKey: string, locationTarget?: string | null): string {
  const t = String(locationTarget ?? "").trim();
  return t ? `${locationKey}|${t}` : locationKey;
}

export function parseAdLocationFilterValue(raw: string | null | undefined): { key: string; target: string | null } | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  const [key, target] = v.split("|");
  if (!key || !/^[A-Z0-9_]+$/i.test(key)) return null;
  return { key: key.toUpperCase(), target: target?.trim() || null };
}
