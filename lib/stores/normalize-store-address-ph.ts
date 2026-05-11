export type NormalizeStoreAddressInput = {
  region?: string | null;
  city?: string | null;
  address1?: string | null;
  address2?: string | null;
};

export type NormalizeStoreAddressOutput = {
  region: string | null;
  city: string | null;
  /** 주소1 (street / building no.) */
  address1: string | null;
  /** 세부주소 (unit / room / landmark) */
  address2: string | null;
};

function trimOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t ? t : null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingTrailingCommaSpace(s: string): string {
  return s.replace(/^[,\s]+|[,\s]+$/g, "").trim();
}

function stripTailToken(line: string, token: string): string {
  let s = line.trim();
  const t = token.trim();
  if (!s || !t) return s;
  const re = new RegExp(String.raw`(?:,\s*|\s+)${escapeRegExp(t)}\s*$`, "i");
  while (re.test(s)) s = s.replace(re, "").trim();
  return stripLeadingTrailingCommaSpace(s);
}

/** `token,` 또는 `token ` 로 시작하는 중복 제거(상세가 가로 줄 앞에 붙은 경우) */
function stripHeadToken(line: string, token: string): string {
  let s = line.trim();
  const t = token.trim();
  if (!s || !t) return s;
  const re = new RegExp(String.raw`^${escapeRegExp(t)}(?:\s*,|\s+)`, "i");
  while (re.test(s)) s = s.replace(re, "").trim();
  return stripLeadingTrailingCommaSpace(s);
}

/**
 * 구글/지도에서 고른 **가로 줄**에 `address_line2`(동·호·층 등)가 앞·뒤에 또 붙어 있으면 제거.
 * 표시 규칙: **상세는 항상 line2**, 가로는 구글 선택 주소만.
 */
export function stripStoreDetailFromGoogleStreetLine(
  street: string | null | undefined,
  detail: string | null | undefined
): string | null {
  const s = trimOrNull(street);
  const d = trimOrNull(detail);
  if (!s || !d) return s;
  let out = s;
  let prev = "";
  while (prev !== out) {
    prev = out;
    out = stripTailToken(out, d);
    out = stripHeadToken(out, d);
    out = stripEmbeddedToken(out, d);
    out = stripLeadingTrailingCommaSpace(out);
  }
  return trimOrNull(out);
}

function stripEmbeddedToken(line: string, token: string): string {
  let s = line.trim();
  const t = token.trim();
  if (!s || !t) return s;
  const esc = escapeRegExp(t);
  // remove token surrounded by commas/spaces
  s = s.replace(new RegExp(String.raw`(?:,\s*|\s+)${esc}(?=,|\s|$)`, "ig"), " ");
  s = s.replace(new RegExp(String.raw`^${esc}(?=,|\s|$)`, "ig"), " ");
  s = s.replace(/\s+/g, " ").trim();
  return stripLeadingTrailingCommaSpace(s);
}

/**
 * Store address normalization (PH convention)
 * - "region/city" are treated as the authoritative delivery-area keys
 * - "address1" MUST NOT contain city/region suffix
 * - "address1" MUST NOT duplicate "address2" at start/end (Google full line + separate detail field)
 * - "address2" MUST NOT contain address1 nor city/region tokens
 */
export function normalizeStoreAddressPh(input: NormalizeStoreAddressInput): NormalizeStoreAddressOutput {
  const region = trimOrNull(input.region);
  const city = trimOrNull(input.city);
  const address2Raw = trimOrNull(input.address2);

  // Address1: strip trailing city/region tokens
  let address1 = trimOrNull(input.address1);
  if (address1) {
    if (city) address1 = stripTailToken(address1, city);
    if (region) address1 = stripTailToken(address1, region);
    address1 = stripLeadingTrailingCommaSpace(address1);
  }

  /** 구글 선택 주소 끝·앞에 상세(동·호)가 중복 저장된 경우 제거 */
  if (address1 && address2Raw) {
    address1 = stripStoreDetailFromGoogleStreetLine(address1, address2Raw);
  }

  // Address2: strip embedded city/region + address1 duplication
  let address2 = address2Raw;
  if (address2) {
    if (address1) {
      const idx = address2.toLowerCase().indexOf(address1.toLowerCase());
      if (idx >= 0) {
        address2 = `${address2.slice(0, idx)} ${address2.slice(idx + address1.length)}`
          .replace(/\s+/g, " ")
          .trim();
      }
    }
    if (city) address2 = stripEmbeddedToken(address2, city);
    if (region) address2 = stripEmbeddedToken(address2, region);
    address2 = stripLeadingTrailingCommaSpace(address2);
  }

  return {
    region,
    city,
    address1: address1 || null,
    address2: address2 || null,
  };
}

