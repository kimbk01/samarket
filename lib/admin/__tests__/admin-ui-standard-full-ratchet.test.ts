/**
 * UI/UX/CTA 표준 전수 래칫 (재설계 R1 · 2026-10-20) — 관리자 **모든** 화면을 검사한다.
 *
 * `admin-ui-standard-ratchet.test.ts` 는 메뉴 화면(ADMIN_UI_STANDARD_SCREENS)만 위반 0 을 강제한다.
 * 이 래칫은 그 밖의 상세·하위 화면까지 포함해 다음을 검사한다:
 *  - 대상: `app/admin/**\/page.tsx` 전부(리다이렉트 전용 제외) + 그 화면이 import 하는 관리자 파일
 *    (`components/admin/ui` 공용 부품, 관리자 문구·라벨이 있는 `lib/admin*` 포함 — 회원·사장님 앱 공용 부품은 제외).
 *  - 규칙: 표준 래칫 6개 + 원시 상태값 출력(2-4) + 확인창 우회 경로(2-3 엔진 단일화)
 *    + (2026-10-30 확장) 변경 동작 CTA 의 ghost/quiet 글자형 버튼 · 확인 단계 문자열 직접 지정(삼항·상수 포함)
 *    · 등록/수정/상세 화면(`new`·`create`·`edit`·`[id]`)이 데이터를 읽는데 4종 상태(AdminStateViews) 미사용.
 *  - 기준선(`admin-ui-standard-baseline.json`)은 현재 남은 위반 수다. **늘면 실패, 줄면 기준선을 낮추라고 실패**(감소만 허용).
 *    기준선 갱신: `WRITE_ADMIN_UI_BASELINE=1 npx vitest run lib/admin/__tests__/admin-ui-standard-full-ratchet.test.ts`
 *    — 갱신 diff 에 증가가 있으면 리뷰에서 거부한다.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_UI_STANDARD_RULES } from "@/lib/admin/ui-standard/admin-ui-standard-rules";

const ROOT = process.cwd();
const BASELINE_FILE = path.join(ROOT, "lib/admin/__tests__/admin-ui-standard-baseline.json");

/** 회원·사장님 앱 공용 부품 · 앱 공용 UI — 관리자 표준 대상 밖 (표준 래칫과 같은 근거). */
const MEMBER_APP_SHARED = [
  /^components\/ui\//,
  /^components\/i18n\//,
  /^components\/navigation\//,
  /^components\/launch-intro\//,
  /^components\/trust\//,
  /^components\/(?:layout|my|notifications|philife|write)\//,
  /^components\/addresses\//,
  /^components\/stores\/(?:commission|browse|home)\//,
  /^components\/stores\/store-facebook-feed-tokens\.ts$/,
  /^components\/business\/admin\/StoreOpsOnOffSwitch\.tsx$/,
  /^components\/gift-certificate\/(?:DibayGiftCertificateFace|GiftVisualCard)\.tsx$/,
  /^components\/ads\/FeedAdBannerCarousel\.tsx$/,
  /^components\/notices\/CustomerCenterSafeMarkdownBody\.tsx$/,
  /^components\/platform-events\/PlatformEventDetailContent\.tsx$/,
  /^components\/platform-popup\/(?:presentations|primitives)\//,
  /^components\/ptr\/(?:DibayPtrSlot|DibayPtrRevealBand)\.tsx$/,
  /^components\/delivery\/DeliveryServiceAreaEditorCore\.tsx$/,
  // 3-C §9-3 — 관리자 샘플 메뉴 편집이 API 경로만 바꿔 재사용하는 사장님 앱 메뉴 편집 부품 (사장님 앱 UI 표준 대상)
  /^components\/business\/owner\/(?:OwnerProductsHubClient|OwnerProductForm|OwnerMenuCategoriesClient|OwnerToastHost)\.tsx$/,
  /^components\/stores\/advertising\/(?:DeliveryAdBanner|DeliveryAdOperationsComposer|DeliveryAdOperationsPanel|DeliveryAdOperationsTimeline|DeliveryAdOwnerPhoneFrame|DeliveryAdPlacementPreview)\.tsx$/,
];

/** lib 중 관리자 화면 문구·라벨·표시를 만드는 곳만 검사 (그 밖의 lib 는 대상 밖). */
const ADMIN_LIB = /^lib\/admin(?:[-/])/;
/** 표시 형식 SSOT 자체 — Intl 사용이 정의 그 자체. */
const FORMAT_SSOT = new Set(["lib/admin/ui-standard/admin-format.ts", "lib/admin/metrics/manila-period.ts"]);
/** 금지 CTA 단어 표 자체 (금지어를 정의하는 파일). */
const CTA_SSOT = "lib/admin/ui-standard/admin-cta.ts";
/** 표준 버튼 부품 자체(AdminActionButton·AdminChipButton·AdminTabs 등) — `<button>` 을 정의하는 곳. */
const UI_PRIMITIVES = /^components\/admin\/ui\//;
/** 규칙 예외 — 근거가 있는 파일·규칙만 (화면 문구가 아닌 경우). */
const RULE_EXEMPT: Readonly<Record<string, string>> = {
  "lib/admin/ads-exposure/ops-status.ts::forbiddenCta": "원시 상태 문자열(「거절」)을 해석하는 코드 — 화면 문구 아님",
  "lib/admin/platform/platform-launch-default-colors.ts::rawColor": "저장 데이터 기본값(#RRGGBB) — 서버가 hex 만 받음",
  "lib/admin/operator-ux/admin-confirm-action.ts::directConfirm": "확인 엔진 자체 — 관리자 셸 밖에서 앱 대화상자로 대체하는 경로",
  "components/admin/ptr-reveal/AdminPtrRevealListPage.tsx::confirmPath": "새 광고 이름 입력 폼(prompt) — 확인 단계가 아닌 입력 폼",
};
/** 확인창 호스트·엔진 자체. */
const CONFIRM_ENGINE = /^(?:components\/admin\/ui\/|lib\/admin\/operator-ux\/)/;

function resolveImport(spec: string, from: string): string | null {
  let p: string;
  if (spec.startsWith("@/")) p = spec.slice(2);
  else if (spec.startsWith(".")) p = path.join(path.dirname(from), spec);
  else return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const f = p + ext;
    const abs = path.join(ROOT, f);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile() && /\.(tsx|ts)$/.test(f)) return f;
  }
  return null;
}

function inScope(rel: string): boolean {
  if (/\.test\.tsx?$/.test(rel) || rel.includes("/__tests__/")) return false;
  if (MEMBER_APP_SHARED.some((re) => re.test(rel))) return false;
  if (rel.startsWith("lib/")) return ADMIN_LIB.test(rel);
  return true;
}

function listAdminPages(dir = "app/admin"): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) out.push(...listAdminPages(rel));
    else if (name === "page.tsx") out.push(rel);
  }
  return out;
}

/** `redirect(...)` 만 하는 화면 (JSX 없음). */
function isRedirectOnly(src: string): boolean {
  return /\bredirect\(/.test(src) && !/<[A-Za-z]/.test(src);
}

function collectAdminFiles(): string[] {
  const seen = new Set<string>();
  const stack = listAdminPages().filter((p) => !isRedirectOnly(fs.readFileSync(path.join(ROOT, p), "utf8")));
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)) {
      const r = resolveImport(m[1], f);
      if (r && inScope(r)) stack.push(r);
    }
  }
  return [...seen].sort();
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** 표준 6개 규칙 + 재설계 R1 추가 규칙. */
export const ADMIN_UI_FULL_RULES: Record<string, (src: string, file: string) => string[]> = {
  ...Object.fromEntries(
    Object.entries(ADMIN_UI_STANDARD_RULES).map(([k, fn]) => [
      k,
      (s: string, file: string) =>
        (k === "localeFormat" && FORMAT_SSOT.has(file)) ||
        (k === "forbiddenCta" && file === CTA_SSOT) ||
        (k === "rawButton" && UI_PRIMITIVES.test(file))
          ? []
          : fn(s),
    ])
  ),
  /** 2-4 — 상태값(enum)을 라벨 없이 그대로 출력 (`>{row.status}<`). */
  rawStatus: (s) =>
    s.match(/>\s*\{\s*[\w.?!]+\.(?:status|state|kind|[a-z]+_status|[a-z]+Status)\s*\}\s*</g) ?? [],
  /**
   * 2-3 — 확인 단계는 동작 표(`adminActionLevel`)로 정한다. 화면에 단계 문자열을 직접 쓰지 않는다.
   * `level: "L1"` 뿐 아니라 `level: x ? "L2" : "L1"` · `const L: AdminConfirmLevel = "L2"` 도 같은 위반.
   */
  literalConfirmLevel: (s, file) =>
    CONFIRM_ENGINE.test(file)
      ? []
      : [
          ...(s.match(/\blevel:[^\n,;}]*["']L[123]["']/g) ?? []),
          ...(s.match(/:\s*AdminConfirmLevel\s*=\s*["']L[123]["']/g) ?? []),
        ],
  /**
   * 2-2 — 변경 동작(승인·반려·삭제·숨김·저장·노출 중지 등) 버튼은 ghost/quiet(글자형) 로 그리지 않는다
   * (secondary · danger · primary). 빨간 글자 ghost(`text-sam-danger`) 도 같은 위반.
   */
  mutatingQuietCta: (s) => mutatingQuietCtaBlocks(s),
  /** 2-3 — 확인 엔진 단일화: `confirmAdminAction` 밖의 확인 경로를 화면에서 직접 쓰지 않는다. */
  confirmPath: (s, file) =>
    CONFIRM_ENGINE.test(file) ? [] : (s.match(/\buseAdminConfirmDialog\s*\(|<AdminActionConfirmDialog\b/g) ?? []),
};

/** 변경 동작 신호 — CTA 어휘 키 또는 화면 단어. */
const MUTATING_CTA_KEYS =
  /adminCta\(\s*["'](?:save|create|approve|reject|hold|sanction|liftSanction|exposeStart|exposeStop|refund|payout|delete)["']/;
const MUTATING_CTA_WORDS = /승인|반려|삭제|숨김|복구|저장|노출 중지|노출 시작|일시중지|재개|차단|환불|지급|제재|강제 취소/;

function mutatingQuietCtaBlocks(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/<AdminActionButton\b[\s\S]*?<\/AdminActionButton>/g)) {
    const block = m[0];
    if (!/\bvariant=\s*\{?\s*["'](?:ghost|quiet)["']/.test(block)) continue;
    if (!/\bonClick=/.test(block)) continue;
    if (MUTATING_CTA_KEYS.test(block) || MUTATING_CTA_WORDS.test(block) || /text-sam-danger/.test(block)) {
      out.push(block.slice(0, 60));
    }
  }
  return out;
}

/** 등록·수정·상세 화면 — URL 이 `new`·`create`·`edit` 이거나 동적 세그먼트(`[id]`)로 끝나는 화면. */
function isCreateEditDetailPage(page: string): boolean {
  return /\/(?:new|create|edit|\[[^\]/]+\])\/page\.tsx$/.test(page);
}

/**
 * 화면이 데이터를 읽는가 — 화면 + 2단계 import 안 한 파일에 `useEffect` + `fetch`/`adminFetch`, 또는 `useAdminSyncLoad`.
 * (저장·업로드 POST 만 하는 등록 폼은 읽기 화면이 아니다.)
 */
function readsData(src: string): boolean {
  return (/\buseEffect\(/.test(src) && /\b(?:fetch|adminFetch)\(/.test(src)) || /\buseAdminSyncLoad\(/.test(src);
}
/** 4종 상태 표시 — AdminStateViews 부품 또는 그것을 감싼 게이트. */
const USES_STATE_VIEWS = /\bAdmin(?:LoadingState|ErrorState|EmptyState|ForbiddenState|SyncLoadGate)\b/;

function importClosure(entry: string, depth: number): string[] {
  const seen = new Set<string>([entry]);
  let frontier = [entry];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const f of frontier) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      for (const m of src.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)) {
        const r = resolveImport(m[1], f);
        if (!r || !inScope(r) || UI_PRIMITIVES.test(r) || seen.has(r)) continue;
        seen.add(r);
        next.push(r);
      }
    }
    frontier = next;
  }
  return [...seen];
}

/** 2-5 — 등록·수정·상세 화면이 데이터를 읽으면서 4종 상태를 쓰지 않는다 (화면당 1). */
function missingStateViewsPages(): string[] {
  const out: string[] = [];
  for (const page of listAdminPages()) {
    if (!isCreateEditDetailPage(page)) continue;
    const pageSrc = fs.readFileSync(path.join(ROOT, page), "utf8");
    if (isRedirectOnly(pageSrc)) continue;
    const srcs = importClosure(page, 2).map((f) => stripComments(fs.readFileSync(path.join(ROOT, f), "utf8")));
    if (!srcs.some(readsData)) continue;
    if (srcs.some((x) => USES_STATE_VIEWS.test(x))) continue;
    out.push(page);
  }
  return out;
}

function computeCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const page of missingStateViewsPages()) {
    if (!RULE_EXEMPT[`${page}::missingStateViews`]) counts[`${page}::missingStateViews`] = 1;
  }
  for (const f of collectAdminFiles()) {
    const src = stripComments(fs.readFileSync(path.join(ROOT, f), "utf8"));
    for (const [rule, find] of Object.entries(ADMIN_UI_FULL_RULES)) {
      const n = RULE_EXEMPT[`${f}::${rule}`] ? 0 : find(src, f).length;
      if (n > 0) counts[`${f}::${rule}`] = n;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

describe("UI/UX/CTA 표준 전수 래칫 — 관리자 전 화면 (기준선 감소만)", () => {
  const current = computeCounts();
  if (process.env.WRITE_ADMIN_UI_BASELINE === "1") {
    fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(current, null, 2)}\n`);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")) as Record<string, number>;

  it("관리자 화면이 리다이렉트 제외 전부 대상이다", () => {
    const pages = listAdminPages();
    expect(pages.length).toBeGreaterThan(250);
    expect(collectAdminFiles()).toEqual(expect.arrayContaining(["app/admin/page.tsx", "components/admin/ui/AdminActionButton.tsx"]));
  });

  it("위반이 기준선보다 늘지 않는다 (새 파일·새 규칙 위반 포함)", () => {
    const increased = Object.entries(current)
      .filter(([k, n]) => n > (baseline[k] ?? 0))
      .map(([k, n]) => `${k}: ${baseline[k] ?? 0} → ${n}`);
    expect(increased).toEqual([]);
  });

  it("줄어든 위반은 기준선에 반영한다 (기준선은 감소만)", () => {
    const decreased = Object.entries(baseline)
      .filter(([k, n]) => (current[k] ?? 0) < n)
      .map(([k, n]) => `${k}: ${n} → ${current[k] ?? 0}`);
    expect(decreased).toEqual([]);
  });
});
