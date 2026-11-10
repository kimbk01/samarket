/**
 * 한국 시/군/구(기초자치단체) 판정 — 한국 주소 지원 1단계 (Owner 2026-11-10 「시안대로 구현」).
 *
 * 자료: `data/kr-sigungu/kr-sigungu.json` = 국토교통부 「전국 법정동」 2026-07-29 (공공데이터포털 15063424)에서
 * 시/군/자치구 230곳만 추린 표. 일반구(수원시 장안구 등 39곳)는 상위 시로 묶는다(자치단체 단위).
 *
 * 지역 코드 형식: 필리핀 = PSGC 10자리 그대로(`1381300000`), 한국 = `KR:` + 법정동코드 앞 5자리(`KR:11680`).
 * 한국 법정동코드도 10자리라 접두 없이는 필리핀 코드와 겹칠 수 있다 — 반드시 `KR:` 를 붙인다.
 * 브라우저·서버 공용(fs 없음).
 */
import data from "@/data/kr-sigungu/kr-sigungu.json";

type KrUnit = { code: string; sido: string; name: string };
type KrGeneralGu = { parentName: string; guName: string; parentCode: string };

const UNITS = (data as { units: KrUnit[] }).units;
const GENERAL_GU = (data as { generalGu: Record<string, KrGeneralGu> }).generalGu;
const SIDO_SHORT = (data as { sidoShort: Record<string, string> }).sidoShort;

export const KR_REGION_PREFIX = "KR:";
/** 거래 지역 표(trade_national_lgu.dataset_version) 와 같은 값 */
export const KR_SIGUNGU_DATASET_VERSION = "kr-bjd-20260729";

const BY_CODE = new Map(UNITS.map((u) => [u.code, u]));

/** 구글·예전 이름 → 현행 시도 이름 — 표는 데이터 파일(`sidoAliases`, 한국어 고유명사라 코드에 두지 않음) */
const SIDO_ALIASES = (data as { sidoAliases: Record<string, string> }).sidoAliases;

function clean(v: string | null | undefined): string {
  return (v ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeKrSido(raw: string | null | undefined): string | null {
  const t = clean(raw);
  if (!t) return null;
  if (SIDO_SHORT[t]) return t;
  return SIDO_ALIASES[t] ?? null;
}

export function isKrRegionId(id: string | null | undefined): boolean {
  return /^KR:\d{5}$/.test(clean(id));
}

export function krRegionId(code: string): string {
  return `${KR_REGION_PREFIX}${code}`;
}

/** `KR:11680` → 「서울 강남구」 (같은 이름 구가 여러 시도에 있어 시도 줄임말을 붙인다 — 중구 9곳 등) */
export function krRegionDisplayName(id: string | null | undefined): string | null {
  const m = clean(id).match(/^KR:(\d{5})$/);
  if (!m) return null;
  const u = BY_CODE.get(m[1]!);
  if (!u) return null;
  const short = SIDO_SHORT[u.sido] ?? u.sido;
  /** 세종특별자치시 세종시 → 「세종시」 */
  if (u.name.startsWith(short)) return u.name;
  return `${short} ${u.name}`;
}

/** `KR:11680` → 시/군/구 행(코드·시도·이름) — 거래 지역 서버 검사용 */
export function getKrSigunguUnit(id: string | null | undefined): { code: string; sido: string; name: string } | null {
  const m = clean(id).match(/^KR:(\d{5})$/);
  if (!m) return null;
  return BY_CODE.get(m[1]!) ?? null;
}

/** `KR:11680` → 「강남구」 (같은 시도 안 표시용) */
export function krRegionShortName(id: string | null | undefined): string | null {
  const m = clean(id).match(/^KR:(\d{5})$/);
  if (!m) return null;
  return BY_CODE.get(m[1]!)?.name ?? null;
}

/**
 * 시도 + 후보 이름들 → 시/군/구 코드. 후보는 구글 순서(구 → 시 → 군)로 넘긴다.
 * - 자치구·시·군 이름이 그 시도에 정확히 있으면 그 코드
 * - 일반구(장안구)는 「상위 시 + 구」 이름으로만 일반구 표에 있으므로, 상위 시 후보와 함께 맞으면 상위 시 코드
 * 맞는 게 없으면 null (추정 금지).
 */
export function resolveKrSigunguCode(input: { sido: string | null | undefined; names: Array<string | null | undefined> }): string | null {
  const sido = normalizeKrSido(input.sido);
  if (!sido) return null;
  const names = input.names.map(clean).filter(Boolean);
  for (const n of names) {
    const hit = UNITS.find((u) => u.sido === sido && u.name === n);
    if (hit) return hit.code;
  }
  for (const n of names) {
    for (const g of Object.values(GENERAL_GU)) {
      if (g.guName === n && names.includes(g.parentName)) {
        const parent = BY_CODE.get(g.parentCode);
        if (parent?.sido === sido) return g.parentCode;
      }
      /** 「수원시장안구」·「수원시 장안구」 한 덩어리 */
      if (n.replace(/\s+/g, "") === `${g.parentName}${g.guName}`) {
        const parent = BY_CODE.get(g.parentCode);
        if (parent?.sido === sido) return g.parentCode;
      }
    }
  }
  return null;
}

/** 대한민국 영역(대략) — 현재 위치·지도 핀의 나라 판정용 */
export function isKoreaLatLng(lat: number, lng: number): boolean {
  return lat >= 33.0 && lat <= 38.9 && lng >= 124.4 && lng <= 132.0;
}
