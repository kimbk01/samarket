/**
 * 「가격이 바뀌었어요」 공용 처리 (광고 감사 X-2 · 2026-11-27).
 * 서버가 409 `price_changed` 를 주면 목록을 **다시 읽고**, 다시 읽기가 성공했을 때만 안내를 띄운다
 * (실패면 화면의 「불러오지 못했어요 · 다시 시도」가 남는다 — R-60·R-61).
 * 쓰는 곳: 거래 광고 창 · 커뮤니티 결제 창 · 배너 신청 화면.
 */
export const PRICE_CHANGED_ERROR = "price_changed" as const;

export function isPriceChangedError(code: string | null | undefined): boolean {
  return String(code ?? "").trim() === PRICE_CHANGED_ERROR;
}

/** reload 가 false 를 돌려주면(다시 읽기 실패) 안내하지 않는다. void·true 는 성공으로 본다. */
export async function handlePriceChanged(input: {
  reload: () => Promise<boolean | void>;
  notify: () => void;
}): Promise<boolean> {
  const ok = await input.reload();
  if (ok === false) return false;
  input.notify();
  return true;
}
