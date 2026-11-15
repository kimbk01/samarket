import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_BACK_CHEVRON_PATH,
  APP_BACK_CHEVRON_STROKE,
  APP_BACK_CHEVRON_VIEWBOX,
} from "@/lib/ui/app-back-glyph";

/**
 * 헤더 뒤로 원형 계약 (Owner 「기본값대로 구현」 2026-11-16)
 * 설계 docs/design/header-back-round-design-2026-11-16.md — R1 원 36 · R2 눌림 · R3 소리 · R4 ‹ 정중앙.
 * 모든 헤더 뒤로 진입점이 같은 부품(`AppBackButton` 또는 `HeaderBackRoundButton`)을 쓰는지 고정한다.
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** 자체 이동 핸들러를 가진 헤더 뒤로 — 모양·눌림·소리만 공용 부품 */
const ROUND_BUTTON_SITES = [
  "components/search/global/GlobalSearchView.tsx",
  "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx",
  "components/community-messenger/call-history/CommunityMessengerCallPeerDetailPanel.tsx",
  "components/business/owner/OwnerStoreOrderChatSlidePanel.tsx",
  "components/stores/StoreDetailBackRow.tsx",
  "components/mypage/profile/PhoneVerificationBox.tsx",
  "components/support/SupportTicketViews.tsx",
];

describe("header back round — R1 원 · R2 눌림 (CSS)", () => {
  const css = read("app/sector-header.css");
  const rule = (sel: string) => {
    const i = css.indexOf(`\n${sel} {`);
    expect(i, sel).toBeGreaterThan(-1);
    const st = css.indexOf("{", i);
    return css.slice(st + 1, css.indexOf("\n}", st));
  };

  it("원 36 · 테두리 1px currentColor 22% · 흰 72% · 가운데", () => {
    expect(rule(".sector-header-back--round")).toContain("--header-back-round-size: 36px;");
    const before = rule(".sector-header-back--round::before");
    expect(before).toContain("width: var(--header-back-round-size);");
    expect(before).toContain("border: 1px solid color-mix(in srgb, currentColor 22%, transparent);");
    expect(before).toContain("background: color-mix(in srgb, #ffffff 72%, transparent);");
    expect(before).toContain("transform: translate(-50%, -50%) scale(1);");
  });

  it("버튼 자체 바탕(4px 네모)은 끔 — 원만 보임", () => {
    expect(rule(".sector-header-back--round")).toContain("background: transparent !important;");
  });

  it("눌림 = data-pressed(닿는 순간) + :active, 0.9배 · 70ms", () => {
    expect(css).toContain(".sector-header-back--round[data-pressed]::before,\n.sector-header-back--round:active::before {");
    const i = css.indexOf(".sector-header-back--round[data-pressed]::before");
    const body = css.slice(i, css.indexOf("\n}", i));
    expect(body).toContain("scale(0.9)");
    expect(body).toContain("transition-duration: 70ms;");
  });

  it("꺾쇠 상자 24 · 획 2", () => {
    expect(rule(".sector-header-back--round .app-back-chevron")).toContain("width: var(--sector-header-touch-icon) !important;");
    expect(rule(".sector-header-back--round .app-back-chevron path")).toContain("stroke-width: 2;");
  });
});

describe("header back round — R4 ‹ 정중앙 (SVG 좌표)", () => {
  it("꺾쇠 잉크 상자(획 포함) 중심 = 24 상자 중심 (12, 12)", () => {
    expect(APP_BACK_CHEVRON_VIEWBOX).toBe("0 0 24 24");
    const nums = APP_BACK_CHEVRON_PATH.match(/-?\d+(\.\d+)?/g)!.map(Number);
    // M x0 y0 x1 y1 l dx dy
    const [x0, y0, x1, y1, dx, dy] = nums;
    const pts = [
      [x0, y0],
      [x1, y1],
      [x1 + dx, y1 + dy],
    ];
    const half = APP_BACK_CHEVRON_STROKE / 2;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    // 둥근 끝·둥근 꺾임 → 잉크는 모든 점에서 획 절반만큼 바깥
    const cx = (Math.min(...xs) - half + Math.max(...xs) + half) / 2;
    const cy = (Math.min(...ys) - half + Math.max(...ys) + half) / 2;
    expect(cx).toBe(12);
    expect(cy).toBe(12);
  });

  it("공용 부품은 SVG 꺾쇠를 그린다 (글자 ‹ 아님)", () => {
    const src = read("components/navigation/HeaderBackRoundButton.tsx");
    expect(src).toContain("<path d={APP_BACK_CHEVRON_PATH} />");
    expect(src).toContain('strokeLinecap="round"');
    expect(src).toContain('strokeLinejoin="round"');
    expect(src).toContain("{children ?? <AppBackChevronIcon />}");
  });
});

describe("header back round — 진입점 전수 (같은 부품)", () => {
  it("AppBackButton: 뒤로 = 원형·SVG·눌림·소리, 닫기 ✕ = 지금 모양", () => {
    const src = read("components/navigation/AppBackButton.tsx");
    expect(src).toContain('const isRound = variant === "back";');
    expect(src).toContain("isRound ? SECTOR_HEADER_BACK_ROUND_CLASS");
    expect(src).toContain('const Icon = variant === "close" ? AppCloseIcon : AppBackChevronIcon;');
    // Link · backHref · onBack 세 갈래 모두
    expect(src.match(/\{\.\.\.pressProps\}/g)?.length).toBe(3);
    expect(src.match(/if \(isRound\) playHeaderBackPressSound\(e\);/g)?.length).toBe(3);
  });

  it.each(ROUND_BUTTON_SITES)("%s — HeaderBackRoundButton 사용, 글자 ‹·lucide ChevronLeft 없음", (rel) => {
    const src = read(rel);
    expect(src).toContain("<HeaderBackRoundButton");
    expect(src).not.toContain("<AppBackIcon");
    expect(src).not.toMatch(/<ChevronLeft\b/);
  });

  it("매장 상세: 흰 헤더만 원형, 사진 위 유리·투명 버튼은 지금 모양(배달 매장 헤더 계약)", () => {
    expect(read("components/stores/store-order-detail/StoreOrderStickyHeader.tsx")).toContain("round={elevated}");
    expect(read("components/stores/StoreDetailBackRow.tsx")).toContain('if (variant === "back" && round) {');
  });

  it("분할 방 진입 프레임(장식)도 같은 원형·SVG 모양", () => {
    const src = read("components/community-messenger/room/MessengerSplitRoomEntryFrame.tsx");
    expect(src).toContain("SECTOR_HEADER_BACK_ROUND_CLASS");
    expect(src).toContain("<AppBackChevronIcon />");
  });

  it("통화 화면 CallHeader 는 무변경 (통화 코드 — 원형 적용 제외)", () => {
    const src = read("components/messenger/call/CallHeader.tsx");
    expect(src).toContain("<AppBackIcon />");
    expect(src).not.toContain("HeaderBackRoundButton");
  });
});

const liveCall = vi.hoisted(() => ({ value: null as null | { callId: string | null; source: string } }));
const feedback = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("@/lib/call/own-live-call", () => ({ readOwnLiveCall: () => liveCall.value }));
vi.mock("@/lib/ui/light-tap-feedback", () => ({
  triggerInteractionFeedback: (...args: unknown[]) => {
    feedback.calls.push(args);
  },
}));

describe("header back round — R3 소리", () => {
  beforeEach(async () => {
    liveCall.value = null;
    feedback.calls = [];
    const m = await import("@/lib/ui/header-back-press-feedback");
    m.resetHeaderBackSoundGuardForTest();
    await m.prewarmHeaderBackPressFeedback();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("앱 기존 「딸깍」(light) 1회 · 터치 종류 전달", async () => {
    const { playHeaderBackPressSound } = await import("@/lib/ui/header-back-press-feedback");
    playHeaderBackPressSound({ nativeEvent: { pointerType: "touch" } } as never);
    expect(feedback.calls).toEqual([["light", { pointerType: "touch" }]]);
  });

  it("700ms 안 연타 = 1회, 지나면 다시", async () => {
    const { playHeaderBackPressSound } = await import("@/lib/ui/header-back-press-feedback");
    playHeaderBackPressSound(null);
    vi.advanceTimersByTime(300);
    playHeaderBackPressSound(null);
    expect(feedback.calls.length).toBe(1);
    vi.advanceTimersByTime(500);
    playHeaderBackPressSound(null);
    expect(feedback.calls.length).toBe(2);
  });

  it("내 통화가 울리거나 진행 중이면 소리 없음", async () => {
    const { playHeaderBackPressSound } = await import("@/lib/ui/header-back-press-feedback");
    liveCall.value = { callId: "c1", source: "session" };
    playHeaderBackPressSound(null);
    expect(feedback.calls.length).toBe(0);
  });

  it("통화 판정 모듈은 정적으로 가져오지 않는다 (뒤로 버튼 번들에 통화 저장소가 붙지 않게)", () => {
    const src = read("lib/ui/header-back-press-feedback.ts");
    expect(src).not.toMatch(/^import [^;]*own-live-call/m);
    expect(src).toContain('import("@/lib/call/own-live-call")');
    expect(src).toContain("if (!mod) return;");
  });

  it("눌림 표시 = pointerdown 에 data-pressed, 떼기·취소·나감에 제거", async () => {
    const { headerBackPressHandlers } = await import("@/lib/ui/header-back-press-feedback");
    const attrs = new Set<string>();
    const el = {
      setAttribute: (k: string) => attrs.add(k),
      removeAttribute: (k: string) => attrs.delete(k),
    };
    headerBackPressHandlers.onPointerDown({ button: 0, currentTarget: el } as never);
    expect(attrs.has("data-pressed")).toBe(true);
    for (const h of ["onPointerUp", "onPointerCancel", "onPointerLeave"] as const) {
      headerBackPressHandlers.onPointerDown({ button: 0, currentTarget: el } as never);
      headerBackPressHandlers[h]({ currentTarget: el } as never);
      expect(attrs.has("data-pressed"), h).toBe(false);
    }
  });
});
