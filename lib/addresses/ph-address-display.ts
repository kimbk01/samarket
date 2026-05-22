import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  buildAddressListDetailLine,
  buildAddressManagementListPrimaryLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";

function isPhRow(row: UserAddressDTO): boolean {
  const cc = (row.countryCode ?? "PH").trim().toUpperCase();
  return cc === "PH" || cc === "PHL";
}

/** 구글 한 줄(저장용) — 카드 본문에는 짧게만 쓴다 */
export function formatPhDeliveryStreetSummary(row: UserAddressDTO): string {
  const road = row.roadAddress?.trim();
  if (road) return stripCountryFromAddressDisplayLine(road, row.countryName);
  const fa = row.formattedAddress?.trim() || row.fullAddress?.trim() || "";
  if (!fa) return "";
  const stripped = stripCountryFromAddressDisplayLine(fa, row.countryName);
  const parts = stripped.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 2) return stripped;
  return `${parts[0]}, ${parts[1]}…`;
}

export function formatPhDeliveryAdminLine(row: UserAddressDTO): string {
  return [row.barangay, row.cityMunicipality, row.province].filter((x) => x?.trim()).join(", ").trim();
}

/** "X, X, 나머지" 처럼 앞 두 콤마 토큰이 같으면 하나만 남김 (한 줄 주소 중복 제거). */
export function dedupePhCommaDuplicateHead(s: string): string {
  const t = s.trim();
  if (!t) return t;
  const parts = t.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
    return [parts[0], ...parts.slice(2)].join(", ");
  }
  return t;
}

function normDedupComparable(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,，·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `Ave` vs `Avenue` 두 덩어리가 연달아 붙은 경우(one comma segment 안) 접기 */
function duplicatedStreetSpans(a: string, b: string): boolean {
  const na = normDedupComparable(a);
  const nb = normDedupComparable(b);
  if (!na || !nb || na.length < 12 || nb.length < 12) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function dedupeAdjacentRepeatedStreetPhraseSingle(seg: string): string {
  const words = seg.split(/\s+/).filter(Boolean);
  const n = words.length;
  if (n < 10) return seg;
  const maxSpan = Math.min(Math.floor(n / 2), 52);
  for (let span = maxSpan; span >= 5; span--) {
    const first = words.slice(0, span).join(" ");
    const w2 = words.slice(span, span + span);
    if (w2.length !== span) continue;
    const second = w2.join(" ");
    if (!duplicatedStreetSpans(first, second)) continue;
    const merged = [...words.slice(0, span), ...words.slice(span + span)];
    return dedupeAdjacentRepeatedStreetPhraseSingle(merged.join(" "));
  }
  return seg;
}

/** 콤마 구간별로 동일·약칭 반복 거리 줄 축약 (예: `… Ave … Avenue …`). */
export function dedupeAdjacentRepeatedStreetPhrase(line: string): string {
  const t = line.trim();
  if (!t) return t;
  return t
    .split(",")
    .map((p) => dedupeAdjacentRepeatedStreetPhraseSingle(p.trim()))
    .filter(Boolean)
    .join(", ");
}

function stripOuterEmDashAdminSuffix(line: string, admin: string): string {
  const a = admin.trim();
  if (!a) return line.trim();
  let s = line.trim();
  const suff = ` — ${a}`;
  if (s.toLowerCase().endsWith(suff.toLowerCase())) {
    s = s.slice(0, s.length - suff.length).trim();
  }
  return s;
}

/** `formatted` 꼬리의 `, Quezon City, Metro Manila` 등 — `barangay, city, province` 와 같으면 제거 */
function stripTrailingCommaAdminSuffix(line: string, admin: string): string {
  const a = admin.trim();
  if (!a) return line.trim();
  let s = line.trim();
  const tail = `, ${a}`;
  while (s.toLowerCase().endsWith(tail.toLowerCase())) {
    s = s.slice(0, s.length - tail.length).trim();
  }
  return s.replace(/[,，]\s*$/, "").trim();
}

/**
 * 주소 카드용(PH) — 도로/포맷 한 덩어리에서 행정 접미(` — …` 또는 `, Quezon City, Metro Manila`) 제거 후 콤마 중복 헤드 정리.
 */
export function stripPhAddressCardStreetCore(row: UserAddressDTO): string {
  if (!isPhRow(row)) return "";
  const admin = formatPhDeliveryAdminLine(row);
  /** 구글 전체 한 줄 우선 — `roadAddress`만 먼저 쓰면 파싱 단편(예: `LOWER GROUND`)만 남아 카드가 잘린다. */
  const raw =
    row.formattedAddress?.trim() ||
    row.fullAddress?.trim() ||
    row.roadAddress?.trim() ||
    row.streetAddress?.trim() ||
    "";
  let core = raw ? stripCountryFromAddressDisplayLine(raw, row.countryName) : "";
  core = stripOuterEmDashAdminSuffix(core, admin);
  core = stripTrailingCommaAdminSuffix(core, admin);
  core = dedupeAdjacentRepeatedStreetPhrase(core);
  return dedupePhCommaDuplicateHead(core);
}

export type FormatPhAddressCardOneLineOpts = {
  /**
   * `labelType === "shop"` 이고 예전 버그로 `building_name` 에 매장 표시명이 들어간 경우,
   * 본문 gate 에 POI 역할 건물명과 같은 문자열을 다시 붙이지 않는다.
   */
  suppressGateBuildingIfMatchesSamarketStore?: string | null;
};

/**
 * PH 주소 카드 한 줄 규칙 — `상세(동·호·기타), 도로·포맷…` (「상세주소」제목 없음). 행정 줄은 붙이지 않음.
 * `unitFloorRoom` → `detailAddress` → `buildingName` 순으로 앞에 붙이되, 도로 줄 앞머리와 중복이면 생략.
 */
export function formatPhAddressCardOneLine(
  row: UserAddressDTO,
  opts?: FormatPhAddressCardOneLineOpts | null,
): { gatePrefix: string; streetBody: string } {
  if (!isPhRow(row)) return { gatePrefix: "", streetBody: "" };
  const core = stripPhAddressCardStreetCore(row);
  const building = row.buildingName?.trim();
  const storeHead = opts?.suppressGateBuildingIfMatchesSamarketStore?.trim() ?? "";
  const includeBuildingGate =
    !!building &&
    building.toLowerCase() !== "null" &&
    building.toLowerCase() !== "undefined" &&
    !(row.labelType === "shop" && storeHead && building.toLowerCase() === storeHead.toLowerCase());

  const gateOrder = (
    [
      row.unitFloorRoom?.trim(),
      row.detailAddress?.trim(),
      includeBuildingGate ? building : null,
    ] as Array<string | null | undefined>
  ).filter((x): x is string => !!x && x.toLowerCase() !== "null" && x.toLowerCase() !== "undefined") as string[];
  const seen = new Set<string>();
  const gates: string[] = [];
  const cl = core.toLowerCase();
  for (const g of gateOrder) {
    const gl = g.toLowerCase();
    if (seen.has(gl)) continue;
    seen.add(gl);
    if (cl === gl || cl.startsWith(`${gl},`) || cl.startsWith(`${gl}，`)) continue;
    gates.push(g);
  }
  return { gatePrefix: gates.join(", ").trim(), streetBody: core };
}

export function formatPhAddressCardOneLinePlain(row: UserAddressDTO, opts?: FormatPhAddressCardOneLineOpts | null): string {
  const { gatePrefix, streetBody } = formatPhAddressCardOneLine(row, opts);
  if (gatePrefix && streetBody) return `${gatePrefix}, ${streetBody}`;
  return gatePrefix || streetBody || "—";
}

/**
 * 주소 관리·배달 카드 본문 한 줄(레거시/비카드) — PH 카드 UI는 `formatPhAddressCardOneLine` 규칙을 쓴다.
 */
export function formatPhDeliveryListPrimaryLine(row: UserAddressDTO): string {
  if (!isPhRow(row)) return "";
  const admin = formatPhDeliveryAdminLine(row);
  const street = formatPhDeliveryStreetSummary(row);
  const b = row.buildingName?.trim();
  const head = b && street && !street.toLowerCase().includes(b.toLowerCase()) ? `${b} · ${street}` : street || b || "";
  if (admin && head) return `${head} — ${admin}`;
  return head || admin || "—";
}

/** @deprecated 장바구니는 `StoreCartCheckoutAddressRowBody` + `formatPhAddressCardOneLine` 사용 */
export type CheckoutAddressBodyParts = {
  primaryLines: string[];
  detailLine: string | null;
  extraLines: string[];
};

/** 체크아웃·확인 모달용 — `formatPhAddressCardOneLinePlain` 과 동일 한 줄 */
export function formatPhDeliveryBlockForCheckout(row: UserAddressDTO): string {
  return formatPhAddressCardOneLinePlain(row);
}
