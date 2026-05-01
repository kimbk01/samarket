/**
 * 거래 글쓰기 스킨 키 정규화.
 * 관리자·시드에서 중고차를 `icon_key: "car"` 로 둔 카테고리도 작성 폼에서는 `used-car` 와 동일하게 취급한다.
 */
export function resolveTradeWriteSkinKey(iconKey: string | null | undefined): string {
  const k = (iconKey ?? "general").trim();
  if (k === "car") return "used-car";
  return k.length > 0 ? k : "general";
}

export function isUsedCarTradeWriteSkin(skinKey: string | null | undefined): boolean {
  const s = (skinKey ?? "").trim();
  return s === "used-car" || s === "car";
}
