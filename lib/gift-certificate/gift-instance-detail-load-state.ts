/**
 * 상품권 상세(S45) 응답 분류 — 순수 함수.
 * 403 = 수령 대기(현행 안내) · 404 또는 `ok:false` = 없음("상품권을 찾을 수 없어요") ·
 * 그 외 실패(5xx·JSON 깨짐) = 오류(+재시도). 네트워크 예외는 호출부 catch 에서 `error`.
 */
import type { GiftInstanceDetail } from "@/lib/gift-certificate/load-gift-instance-detail";

export type GiftInstanceDetailLoadState =
  | { kind: "loading" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "error" }
  | { kind: "ok"; instance: GiftInstanceDetail };

export function classifyGiftInstanceDetailResponse(
  status: number,
  json: unknown
): Exclude<GiftInstanceDetailLoadState, { kind: "loading" }> {
  if (status === 403) return { kind: "forbidden" };
  if (status === 404) return { kind: "not_found" };
  const body = json && typeof json === "object" ? (json as { ok?: unknown; instance?: unknown }) : null;
  if (status < 200 || status >= 300 || !body) return { kind: "error" };
  if (body.ok !== true) return { kind: "not_found" };
  if (!body.instance || typeof body.instance !== "object") return { kind: "not_found" };
  return { kind: "ok", instance: body.instance as GiftInstanceDetail };
}
