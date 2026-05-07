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
 * - "address2" MUST NOT contain address1 nor city/region tokens
 */
export function normalizeStoreAddressPh(input: NormalizeStoreAddressInput): NormalizeStoreAddressOutput {
  const region = trimOrNull(input.region);
  const city = trimOrNull(input.city);

  // Address1: strip trailing city/region tokens
  let address1 = trimOrNull(input.address1);
  if (address1) {
    if (city) address1 = stripTailToken(address1, city);
    if (region) address1 = stripTailToken(address1, region);
    address1 = stripLeadingTrailingCommaSpace(address1);
  }

  // Address2: strip embedded city/region + address1 duplication
  let address2 = trimOrNull(input.address2);
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

