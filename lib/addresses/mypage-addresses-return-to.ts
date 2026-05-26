/** `/mypage/addresses` — `returnTo` 쿼리(내부 경로만) */
export function parseSafeInternalReturnTo(raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "";
  return trimmed;
}

export function buildMypageAddressesHref(returnTo?: string | null): string {
  const rt = parseSafeInternalReturnTo(returnTo);
  if (!rt) return "/mypage/addresses";
  return `/mypage/addresses?returnTo=${encodeURIComponent(rt)}`;
}

export function buildMypageAddressEditHref(opts: {
  returnTo?: string | null;
  id?: string | null;
  map?: boolean;
}): string {
  const params = new URLSearchParams();
  const rt = parseSafeInternalReturnTo(opts.returnTo);
  if (rt) params.set("returnTo", rt);
  if (opts.id?.trim()) params.set("id", opts.id.trim());
  if (opts.map) params.set("map", "1");
  const q = params.toString();
  return q ? `/mypage/addresses/edit?${q}` : "/mypage/addresses/edit";
}
