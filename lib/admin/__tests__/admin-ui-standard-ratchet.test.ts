/**
 * UI/UX/CTA 표준 래칫 (수정 계획 2-8) — `ADMIN_UI_STANDARD_SCREENS` 의 화면(page.tsx + 화면 전용 컴포넌트)은
 * 아래 위반이 0건이어야 한다. 공용 부품(components/admin/ui · components/ui)과 lib 는 대상 밖.
 * 회원 앱 화면 부품(components/navigation · components/launch-intro 인트로 플레이어 · components/trust 매너 배터리 · 거래 글쓰기 미리보기가 쓰는 layout·my·notifications·philife·write — 관리자 화면이 그대로 쓴다)도 대상 밖.
 * 광고·팝업·이벤트·당겨서 새로고침 미리보기가 쓰는 회원 앱 부품(피드 광고 캐러셀 · 고객센터 본문 · 이벤트 상세 · 팝업 표현·부품 · PTR 슬롯·띠)도 대상 밖.
 * 사장님 앱 공용: 배달 구역 편집기(DeliveryServiceAreaEditorCore) · 배달 광고 배너·운영 패널·미리보기 부품(components/stores/advertising 6개)도 대상 밖.
 * 배달·매장 미리보기가 쓰는 회원·사장님 앱 부품(components/addresses 주소 · components/stores 의 commission·browse·home 카드와 피드 토큰 · 사장님 영업 스위치 StoreOpsOnOffSwitch · 상품권 카드 DibayGiftCertificateFace·GiftVisualCard)도 대상 밖.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_UI_STANDARD_RULES } from "@/lib/admin/ui-standard/admin-ui-standard-rules";
import { ADMIN_UI_STANDARD_SCREENS } from "@/lib/admin/ui-standard/admin-ui-standard-screens";

const ROOT = process.cwd();
const SHARED = [/^components\/ui\//, /^components\/admin\/ui\//, /^components\/i18n\//, /^components\/navigation\//, /^components\/launch-intro\//, /^components\/trust\//, /^components\/(?:layout|my|notifications|philife|write)\//, /^components\/addresses\//, /^components\/stores\/(?:commission|browse|home)\//, /^components\/stores\/store-facebook-feed-tokens\.ts$/, /^components\/business\/admin\/StoreOpsOnOffSwitch\.tsx$/, /^components\/gift-certificate\/(?:DibayGiftCertificateFace|GiftVisualCard)\.tsx$/, /^components\/ads\/FeedAdBannerCarousel\.tsx$/, /^components\/notices\/CustomerCenterSafeMarkdownBody\.tsx$/, /^components\/platform-events\/PlatformEventDetailContent\.tsx$/, /^components\/platform-popup\/(?:presentations|primitives)\//, /^components\/ptr\/(?:DibayPtrSlot|DibayPtrRevealBand)\.tsx$/, /^components\/delivery\/DeliveryServiceAreaEditorCore\.tsx$/, /^components\/stores\/advertising\/(?:DeliveryAdBanner|DeliveryAdOperationsComposer|DeliveryAdOperationsPanel|DeliveryAdOperationsTimeline|DeliveryAdOwnerPhoneFrame|DeliveryAdPlacementPreview)\.tsx$/, /^lib\//];

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

/** page.tsx 에서 시작해 화면 전용 파일(공용 제외)을 모두 모은다. */
export function adminScreenFiles(route: string): string[] {
  const start = `app${route}/page.tsx`;
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)) {
      const r = resolveImport(m[1], f);
      if (r && !SHARED.some((re) => re.test(r)) && !/\.test\.tsx?$/.test(r)) stack.push(r);
    }
  }
  return [...seen].sort();
}

/** 주석 제거 (규칙은 코드만 본다). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("UI/UX/CTA 표준 래칫 — 적용 화면 위반 0건", () => {
  for (const [ws, routes] of Object.entries(ADMIN_UI_STANDARD_SCREENS)) {
    it(`${ws}: 화면 파일 위반 0건`, () => {
      const violations: string[] = [];
      for (const route of routes) {
        expect(fs.existsSync(path.join(ROOT, `app${route}/page.tsx`)), `${route} page.tsx`).toBe(true);
        for (const f of adminScreenFiles(route)) {
          const src = stripComments(fs.readFileSync(path.join(ROOT, f), "utf8"));
          for (const [rule, find] of Object.entries(ADMIN_UI_STANDARD_RULES)) {
            const hits = find(src);
            if (hits.length) violations.push(`${f} · ${rule} · ${[...new Set(hits)].slice(0, 5).join(", ")} (${hits.length})`);
          }
        }
      }
      expect([...new Set(violations)]).toEqual([]);
    });
  }
});
