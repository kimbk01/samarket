import { ZIP_TO_LOCATION_EXTRAS } from "./zip-to-location-extras";

/**
 * 필리핀 PhilPost 4자리 ZIP → `regions-data`의 regionId·cityId.
 * - 정확 매칭 테이블 + NCR·주요 권역 범위 보조(미등록 번호도 대표 동네로 안내).
 * - PhilPost는 지역마다 여러 코드를 쓰므로, 범위는 대표 행정구역 기준(세부 바랑가이는 아래에서 직접 선택).
 * @see https://phlpost.gov.ph/zip-code-locator/
 */

export type ZipLocationHit = { regionId: string; cityId: string };

/** 자주 쓰이는 우편번호 → 앱 내 동네(Area) id (PhilPost·공개 우편 목록 기준) */
const ZIP_TO_LOCATION_PRIMARY: Record<string, ZipLocationHit> = {
  // City of Manila
  "1000": { regionId: "manila", cityId: "m3" },
  "1001": { regionId: "manila", cityId: "m4" },
  "1002": { regionId: "manila", cityId: "m5" },
  "1003": { regionId: "manila", cityId: "m6" },
  "1004": { regionId: "manila", cityId: "m1" },
  "1005": { regionId: "manila", cityId: "m13" },
  "1006": { regionId: "manila", cityId: "m14" },
  "1007": { regionId: "manila", cityId: "m3" },
  "1008": { regionId: "manila", cityId: "m15" },
  "1009": { regionId: "manila", cityId: "m16" },
  "1010": { regionId: "manila", cityId: "m7" },
  "1011": { regionId: "manila", cityId: "m8" },
  "1012": { regionId: "manila", cityId: "m6" },
  "1013": { regionId: "manila", cityId: "m11" },
  "1014": { regionId: "manila", cityId: "m12" },
  "1015": { regionId: "manila", cityId: "m7" },
  "1016": { regionId: "manila", cityId: "m9" },
  "1017": { regionId: "manila", cityId: "m10" },
  "1018": { regionId: "manila", cityId: "m1" },
  // Makati (12xx 대역 — 이전 오매핑 1226=BGC 등 수정)
  "1200": { regionId: "manila", cityId: "m2" },
  "1210": { regionId: "manila", cityId: "m39" },
  "1219": { regionId: "manila", cityId: "m2" },
  "1223": { regionId: "manila", cityId: "m2" },
  "1224": { regionId: "manila", cityId: "m2" },
  "1225": { regionId: "manila", cityId: "m2" },
  "1226": { regionId: "manila", cityId: "m2" },
  "1227": { regionId: "manila", cityId: "m2" },
  "1228": { regionId: "manila", cityId: "m2" },
  "1230": { regionId: "manila", cityId: "m2" },
  "1231": { regionId: "manila", cityId: "m2" },
  "1232": { regionId: "manila", cityId: "m2" },
  "1233": { regionId: "manila", cityId: "m2" },
  "1234": { regionId: "manila", cityId: "m2" },
  "1235": { regionId: "manila", cityId: "m2" },
  // Taguig — BGC·맥킨리(1634~1635 등)
  "1630": { regionId: "manila", cityId: "m19" },
  "1631": { regionId: "manila", cityId: "m19" },
  "1632": { regionId: "manila", cityId: "m19" },
  "1633": { regionId: "manila", cityId: "m19" },
  "1634": { regionId: "manila", cityId: "m18" },
  "1635": { regionId: "manila", cityId: "m18" },
  "1636": { regionId: "manila", cityId: "m19" },
  "1637": { regionId: "manila", cityId: "m19" },
  "1638": { regionId: "manila", cityId: "m19" },
  "1640": { regionId: "manila", cityId: "m19" },
  "1641": { regionId: "manila", cityId: "m19" },
  "1642": { regionId: "manila", cityId: "m19" },
  "1643": { regionId: "manila", cityId: "m19" },
  "1644": { regionId: "manila", cityId: "m19" },
  "1645": { regionId: "manila", cityId: "m19" },
  "1646": { regionId: "manila", cityId: "m19" },
  "1647": { regionId: "manila", cityId: "m19" },
  "1648": { regionId: "manila", cityId: "m19" },
  // Pateros
  "1620": { regionId: "manila", cityId: "m38" },
  "1621": { regionId: "manila", cityId: "m38" },
  // Pasig
  "1600": { regionId: "manila", cityId: "m20" },
  "1601": { regionId: "manila", cityId: "m20" },
  "1602": { regionId: "manila", cityId: "m20" },
  "1603": { regionId: "manila", cityId: "m21" },
  "1604": { regionId: "manila", cityId: "m20" },
  "1605": { regionId: "manila", cityId: "m20" },
  "1606": { regionId: "manila", cityId: "m20" },
  "1607": { regionId: "manila", cityId: "m20" },
  "1608": { regionId: "manila", cityId: "m20" },
  "1609": { regionId: "manila", cityId: "m20" },
  "1610": { regionId: "manila", cityId: "m22" },
  "1611": { regionId: "manila", cityId: "m20" },
  "1612": { regionId: "manila", cityId: "m20" },
  // Marikina (18xx — 이전 1600=마리키나 오류 수정)
  "1800": { regionId: "manila", cityId: "m29" },
  "1801": { regionId: "manila", cityId: "m29" },
  "1802": { regionId: "manila", cityId: "m29" },
  "1803": { regionId: "manila", cityId: "m29" },
  "1804": { regionId: "manila", cityId: "m29" },
  "1805": { regionId: "manila", cityId: "m29" },
  "1806": { regionId: "manila", cityId: "m29" },
  "1807": { regionId: "manila", cityId: "m29" },
  "1808": { regionId: "manila", cityId: "m29" },
  "1809": { regionId: "manila", cityId: "m29" },
  "1810": { regionId: "manila", cityId: "m29" },
  "1811": { regionId: "manila", cityId: "m29" },
  "1812": { regionId: "manila", cityId: "m29" },
  // Mandaluyong / San Juan 인근
  "1550": { regionId: "manila", cityId: "m23" },
  "1552": { regionId: "manila", cityId: "m24" },
  // Pasay
  "1300": { regionId: "manila", cityId: "m36" },
  "1309": { regionId: "manila", cityId: "m37" },
  // Caloocan · Valenzuela · Malabon · Navotas · San Juan
  "1400": { regionId: "manila", cityId: "m30" },
  "1401": { regionId: "manila", cityId: "m31" },
  "1440": { regionId: "manila", cityId: "m32" },
  "1441": { regionId: "manila", cityId: "m33" },
  "1442": { regionId: "manila", cityId: "m34" },
  "1443": { regionId: "manila", cityId: "m35" },
  /** Malabon (Tinajeros 등) — PhilPost 1470 */
  "1470": { regionId: "manila", cityId: "m33" },
  // Quezon City
  "1100": { regionId: "quezon", cityId: "q3" },
  "1101": { regionId: "quezon", cityId: "q1" },
  "1102": { regionId: "quezon", cityId: "q23" },
  "1103": { regionId: "quezon", cityId: "q24" },
  "1104": { regionId: "quezon", cityId: "q25" },
  "1105": { regionId: "quezon", cityId: "q3" },
  "1106": { regionId: "quezon", cityId: "q4" },
  "1107": { regionId: "quezon", cityId: "q10" },
  "1109": { regionId: "quezon", cityId: "q11" },
  "1110": { regionId: "quezon", cityId: "q12" },
  "1111": { regionId: "quezon", cityId: "q13" },
  "1112": { regionId: "quezon", cityId: "q14" },
  "1113": { regionId: "quezon", cityId: "q15" },
  "1114": { regionId: "quezon", cityId: "q16" },
  "1115": { regionId: "quezon", cityId: "q5" },
  "1116": { regionId: "quezon", cityId: "q6" },
  "1117": { regionId: "quezon", cityId: "q7" },
  "1118": { regionId: "quezon", cityId: "q8" },
  "1119": { regionId: "quezon", cityId: "q2" },
  "1120": { regionId: "quezon", cityId: "q17" },
  "1121": { regionId: "quezon", cityId: "q18" },
  "1122": { regionId: "quezon", cityId: "q19" },
  "1123": { regionId: "quezon", cityId: "q20" },
  "1124": { regionId: "quezon", cityId: "q21" },
  "1125": { regionId: "quezon", cityId: "q22" },
  "1126": { regionId: "quezon", cityId: "q30" },
  "1127": { regionId: "quezon", cityId: "q31" },
  "1128": { regionId: "quezon", cityId: "q9" },
  // Cebu
  "6000": { regionId: "cebu", cityId: "c11" },
  "6001": { regionId: "cebu", cityId: "c2" },
  "6004": { regionId: "cebu", cityId: "c4" },
  "6006": { regionId: "cebu", cityId: "c6" },
  "6014": { regionId: "cebu", cityId: "c2" },
  "6015": { regionId: "cebu", cityId: "c28" },
  "6016": { regionId: "cebu", cityId: "c29" },
  "6045": { regionId: "cebu", cityId: "c28" },
  "6046": { regionId: "cebu", cityId: "c3" },
  // Angeles / Pampanga
  "2009": { regionId: "angeles", cityId: "a1" },
  "2010": { regionId: "angeles", cityId: "a2" },
};

const ZIP_TO_LOCATION: Record<string, ZipLocationHit> = {
  ...ZIP_TO_LOCATION_PRIMARY,
  ...ZIP_TO_LOCATION_EXTRAS,
};

type ZipRange = { from: number; to: number; hit: ZipLocationHit };

/** 정확 테이블에 없을 때 — PhilPost 구역 대역(앱에 있는 메트로만) */
const ZIP_RANGE_FALLBACK: ZipRange[] = [
  { from: 1000, to: 1099, hit: { regionId: "manila", cityId: "m3" } },
  { from: 1100, to: 1199, hit: { regionId: "quezon", cityId: "q3" } },
  { from: 1200, to: 1299, hit: { regionId: "manila", cityId: "m2" } },
  { from: 1300, to: 1399, hit: { regionId: "manila", cityId: "m36" } },
  { from: 1400, to: 1499, hit: { regionId: "manila", cityId: "m30" } },
  { from: 1500, to: 1599, hit: { regionId: "manila", cityId: "m23" } },
  { from: 1600, to: 1619, hit: { regionId: "manila", cityId: "m20" } },
  { from: 1620, to: 1621, hit: { regionId: "manila", cityId: "m38" } },
  { from: 1622, to: 1629, hit: { regionId: "manila", cityId: "m19" } },
  { from: 1630, to: 1655, hit: { regionId: "manila", cityId: "m19" } },
  { from: 1700, to: 1720, hit: { regionId: "manila", cityId: "m25" } },
  { from: 1740, to: 1757, hit: { regionId: "manila", cityId: "m27" } },
  { from: 1770, to: 1789, hit: { regionId: "manila", cityId: "m28" } },
  { from: 1800, to: 1819, hit: { regionId: "manila", cityId: "m29" } },
  { from: 2000, to: 2030, hit: { regionId: "angeles", cityId: "a1" } },
  { from: 6000, to: 6099, hit: { regionId: "cebu", cityId: "c11" } },
];

/** 입력 중: 숫자만, 최대 4자리 */
export function normalizePhilippinesZipInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 4);
}

/**
 * PhilPost 4자리 코드로 확정 (적용 시).
 * - 3자리만 입력된 경우 선행 0 패딩 (예: 800 → 0800).
 */
export function finalizePhilippinesZipCode(raw: string): string | null {
  let d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length === 3) d = d.padStart(4, "0");
  if (d.length !== 4) return null;
  return d;
}

function hitFromRange(n: number): ZipLocationHit | null {
  if (n === 1634 || n === 1635) {
    return { regionId: "manila", cityId: "m18" };
  }
  for (const r of ZIP_RANGE_FALLBACK) {
    if (n >= r.from && n <= r.to) return r.hit;
  }
  return null;
}

export function lookupLocationByPhilippinesZip(raw: string): ZipLocationHit | null {
  const code = finalizePhilippinesZipCode(raw);
  if (!code) return null;
  const exact = ZIP_TO_LOCATION[code];
  if (exact) return exact;
  const n = parseInt(code, 10);
  if (Number.isNaN(n)) return null;
  return hitFromRange(n);
}

/** ZIP 입력이 적용 가능한 4자리인지 (UI 메시지용) */
export function isPhilippinesZipInputComplete(raw: string): boolean {
  return finalizePhilippinesZipCode(raw) !== null;
}

let cachedLocationToZipCodes: Map<string, string[]> | null = null;

/**
 * PhilPost 4자리 전체(1000–9999)를 `lookupLocationByPhilippinesZip`에 넣어
 * regionId·cityId별로 매핑되는 코드 목록을 한 번만 계산합니다.
 */
function loadLocationToZipCodesMap(): Map<string, string[]> {
  if (cachedLocationToZipCodes) return cachedLocationToZipCodes;
  const bucket = new Map<string, Set<string>>();
  for (let n = 1000; n <= 9999; n++) {
    const code = String(n).padStart(4, "0");
    const hit = lookupLocationByPhilippinesZip(code);
    if (!hit) continue;
    const k = `${hit.regionId}|${hit.cityId}`;
    let set = bucket.get(k);
    if (!set) {
      set = new Set();
      bucket.set(k, set);
    }
    set.add(code);
  }
  const sorted = new Map<string, string[]>();
  for (const [k, set] of bucket) {
    sorted.set(k, [...set].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)));
  }
  cachedLocationToZipCodes = sorted;
  return sorted;
}

/**
 * 지역·동네(regionId, cityId)에 해당하는 PhilPost ZIP 후보(오름차순).
 * 표·범위 보조 로직과 ZIP→지역 적용과 동일한 기준입니다.
 */
export function getPhilippinesZipCodesForLocation(regionId: string, cityId: string): string[] {
  if (!regionId?.trim() || !cityId?.trim()) return [];
  return loadLocationToZipCodesMap().get(`${regionId}|${cityId}`) ?? [];
}
