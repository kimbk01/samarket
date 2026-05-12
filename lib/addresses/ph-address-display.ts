import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { stripCountryFromAddressDisplayLine } from "@/lib/addresses/user-address-format";

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
  const raw =
    row.roadAddress?.trim() || row.formattedAddress?.trim() || row.fullAddress?.trim() || "";
  let core = raw ? stripCountryFromAddressDisplayLine(raw, row.countryName) : "";
  core = stripOuterEmDashAdminSuffix(core, admin);
  core = stripTrailingCommaAdminSuffix(core, admin);
  return dedupePhCommaDuplicateHead(core);
}

/**
 * PH 주소 카드 한 줄 규칙 — `상세(동·호·기타), 도로·포맷…` (「상세주소」제목 없음). 행정 줄은 붙이지 않음.
 * `unitFloorRoom` → `detailAddress` → `buildingName` 순으로 앞에 붙이되, 도로 줄 앞머리와 중복이면 생략.
 */
export function formatPhAddressCardOneLine(row: UserAddressDTO): { gatePrefix: string; streetBody: string } {
  if (!isPhRow(row)) return { gatePrefix: "", streetBody: "" };
  const core = stripPhAddressCardStreetCore(row);
  const gateOrder = [row.unitFloorRoom, row.detailAddress, row.buildingName]
    .map((x) => x?.trim())
    .filter((x) => x && x.toLowerCase() !== "null" && x.toLowerCase() !== "undefined") as string[];
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

export function formatPhAddressCardOneLinePlain(row: UserAddressDTO): string {
  const { gatePrefix, streetBody } = formatPhAddressCardOneLine(row);
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

/** 체크아웃·확인 모달용 여러 줄(원문 `formatted_address` 전체 덤프 지양) */
export function formatPhDeliveryBlockForCheckout(row: UserAddressDTO): string {
  if (!isPhRow(row)) {
    const legacy = [row.roadAddress ?? row.formattedAddress, row.detailAddress ?? row.unitFloorRoom]
      .map((x) => x?.trim())
      .filter(Boolean) as string[];
    return legacy.join("\n");
  }
  const lines: string[] = [];
  const street = formatPhDeliveryStreetSummary(row);
  if (street) lines.push(dedupePhCommaDuplicateHead(street));
  const admin = formatPhDeliveryAdminLine(row);
  if (admin) lines.push(admin);
  const detail = [row.detailAddress, row.unitFloorRoom].map((x) => x?.trim()).filter(Boolean).join(" · ");
  if (detail) {
    const sl = street.toLowerCase();
    const dl = detail.toLowerCase();
    if (!sl.startsWith(dl) && sl !== dl) lines.push(detail);
  }
  if (row.landmark?.trim()) lines.push(`Near: ${row.landmark.trim()}`);
  if (row.deliveryNote?.trim()) lines.push(`Delivery note: ${row.deliveryNote.trim()}`);
  return lines.join("\n") || "—";
}
