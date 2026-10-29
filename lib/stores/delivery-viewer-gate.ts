import type { StoreListDeliveryOrigin } from "@/lib/stores/store-list-delivery-origin";

/**
 * 배달 열람 게이트 — 단일 판정 (Owner 2026-10-29 08:59, 감사 S-07·S-08·S-09).
 *
 * - `login_required`  : 비로그인 → 배달 홈·업종·검색·매장 상세 대신 로그인 유도
 * - `address_required`: 로그인했지만 배달 가능한 저장 주소 없음 → 「주소가 없습니다」 + 주소 설정 CTA
 * - `ok`              : 저장 주소 있음 → 기존 동작 (배달 가능 실매장 + 범위 판정)
 *
 * 입력은 목록이 쓰는 `resolveStoreListDeliveryOrigin` 결과뿐이다. 홈 피드·업종 목록·검색 API 가
 * 같은 함수로 판정해 응답 `meta.viewer_gate` 에 싣고, `ok` 가 아니면 매장 목록을 비워 반환한다.
 * 비로그인 쿼리 좌표(`explicit_coords`)는 열람 자격이 아니다. 배달 범위 계산식은 건드리지 않는다.
 */
export type DeliveryViewerGate = "login_required" | "address_required" | "ok";

export const DELIVERY_VIEWER_GATES: readonly DeliveryViewerGate[] = [
  "login_required",
  "address_required",
  "ok",
] as const;

export function resolveDeliveryViewerGate(
  origin: Pick<StoreListDeliveryOrigin, "source" | "userId">
): DeliveryViewerGate {
  if (!origin.userId) return "login_required";
  if (origin.source !== "saved_address") return "address_required";
  return "ok";
}

/**
 * 묶음4 R-1 — 매장 상세 계열 API 서버 게이트. 화면 게이트(`DeliveryViewerGuestGate`)와 같이
 * **로그인 여부만** 본다 — 상세는 주소 없는 회원도 열람 가능(주소 게이트는 목록 전용), 사장님·관리자
 * 미리보기·주문 채팅 헤더 등 로그인 사용자 경로는 그대로 통과.
 */
export function resolveStoreDetailViewerGate(
  viewerUserId: string | null | undefined
): Extract<DeliveryViewerGate, "login_required" | "ok"> {
  return String(viewerUserId ?? "").trim() ? "ok" : "login_required";
}

/** 고객 화면: API 응답 meta 에서 게이트를 읽는다. 없거나 모르는 값이면 null (기존 응답 호환). */
export function readDeliveryViewerGate(meta: unknown): DeliveryViewerGate | null {
  if (!meta || typeof meta !== "object") return null;
  const v = (meta as { viewer_gate?: unknown }).viewer_gate;
  return typeof v === "string" && (DELIVERY_VIEWER_GATES as readonly string[]).includes(v)
    ? (v as DeliveryViewerGate)
    : null;
}

export function isDeliveryViewerGateBlocked(gate: DeliveryViewerGate | null | undefined): boolean {
  return gate === "login_required" || gate === "address_required";
}

const STORES_RESERVED_FIRST_SEGMENTS = new Set(["owner", "cart", "browse", "search", "gift-mall"]);

/**
 * 비로그인 화면 게이트 대상 경로 — 배달 홈·업종·검색·매장 상세(및 메뉴·상품·정보·리뷰).
 * 장바구니·주문서·신고·사장님 경로는 대상 아님 (각자 기존 인증 규칙).
 */
export function isDeliveryViewerGatedPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.replace(/\/+$/, "") || "";
  if (p === "/stores") return true;
  if (!p.startsWith("/stores/")) return false;
  const parts = p.split("/").filter(Boolean);
  const first = parts[1] ?? "";
  if (first === "browse" || first === "search") return true;
  if (!first || STORES_RESERVED_FIRST_SEGMENTS.has(first)) return false;
  if (parts.length === 2) return true;
  const sub = parts[2] ?? "";
  return sub === "menu" || sub === "p" || sub === "info" || sub === "reviews";
}
