/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildPlatformPopupPresentationWinner } from "@/lib/platform-popup/build-presentation-winner";
import { resolvePlatformPopupCreativePublicUrl } from "@/lib/platform-popup/resolve-popup-creative-url";
import { resolvePlatformPopupPresentationSuppressionOptions } from "@/lib/platform-popup/popup-suppression-ui";
import {
  PLATFORM_POPUP_BACKDROP_RGBA,
  PLATFORM_POPUP_RADIUS_CLAMP,
  PLATFORM_POPUP_TABLET_MAX_WIDTH_PX,
} from "@/lib/platform-popup/popup-geometry-tokens";
import { platformPopupCreativeAspectRatio } from "@/lib/platform-popup/creative-contract";
import {
  markPlatformPopupImpression,
  assertHostMustNotEmitImpression,
} from "@/lib/platform-popup/popup-impression-boundary";
import {
  recordPlatformPopupEvent,
  resetPlatformPopupImpressionDedupeForTests,
} from "@/lib/platform-popup/record-popup-event-client";
import { assertNotImpressionFromResolver } from "@/lib/platform-popup/events";

const ROOT = process.cwd();

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsFiles(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

const baseCandidate = {
  id: "camp-1",
  status: "active" as const,
  approvalStatus: "approved" as const,
  priority: 1,
  surfaces: ["GLOBAL" as const],
  creative: {
    id: "cr-1",
    status: "ready" as const,
    aspectW: 36,
    aspectH: 25,
    assetPath: "qa/sample.webp",
    assetUrl: "https://example.supabase.co/storage/v1/object/public/platform-popup-creatives/qa/sample.webp",
    altText: "QA popup",
  },
  ctaType: "internal_page" as const,
  ctaTarget: "/market",
  externalUrl: null,
  suppressions: [],
};

describe("CUT3 renderer authority", () => {
  it("exactly one production renderer component", () => {
    const renderer = readRepo("components/platform-popup/DibayPopupAd.tsx");
    expect(renderer).toContain("export function DibayPopupAd");
    const dupes: string[] = [];
    for (const f of walkTsFiles(join(ROOT, "components"))) {
      if (f.endsWith("DibayPopupAd.tsx")) continue;
      const src = readFileSync(f, "utf8");
      if (src.includes("DibayPopupAd") && src.includes("platform-popup-creative")) {
        dupes.push(f.replace(ROOT + "/", ""));
      }
    }
    expect(dupes).toEqual([]);
  });

  it("GlobalPopupHost mounts DibayPopupAd only", () => {
    const host = readRepo("components/platform-popup/GlobalPopupHost.tsx");
    expect(host).toContain("DibayPopupAd");
    expect(host).not.toContain("cut2-lifecycle-boundary");
    expect(host).not.toContain("markPlatformPopupImpression");
  });

  it("renderer does not fetch DB or resolve surface", () => {
    const renderer = readRepo("components/platform-popup/DibayPopupAd.tsx");
    expect(renderer).not.toMatch(/fetch\s*\(/);
    expect(renderer).not.toContain("resolvePopupAd");
    expect(renderer).not.toContain("resolveDibaySurface");
    expect(renderer).not.toContain("loadPlatformPopupCandidates");
  });
});

describe("CUT3 geometry contract", () => {
  it("36:25 aspect ratio constant", () => {
    expect(platformPopupCreativeAspectRatio()).toBeCloseTo(36 / 25, 5);
  });

  it("CSS uses 36/25 creative aspect and dismiss row grid", () => {
    const css = readRepo("app/platform-popup.css");
    expect(css).toContain("aspect-ratio: 36 / 25");
    expect(css).toContain("grid-template-rows: auto auto");
    expect(css).toContain(".dibay-platform-popup-dismiss");
    expect(css).not.toContain("position: fixed"); // card not floating X
  });

  it("no X-only close on creative", () => {
    const renderer = readRepo("components/platform-popup/DibayPopupAd.tsx");
    expect(renderer).toContain('data-platform-popup-dismiss="close"');
    expect(renderer).not.toMatch(/×|&times;|aria-label="Close"[^>]*className="[^"]*absolute/);
  });

  it("calibration tokens are declared", () => {
    expect(PLATFORM_POPUP_BACKDROP_RGBA).toBe("rgba(0, 0, 0, 0.45)");
    expect(PLATFORM_POPUP_TABLET_MAX_WIDTH_PX).toBe(480);
    expect(PLATFORM_POPUP_RADIUS_CLAMP).toContain("clamp");
  });

  it("phone full-bleed width policy in CSS", () => {
    const css = readRepo("app/platform-popup.css");
    expect(css).toContain("width: 100%");
    expect(css).not.toMatch(/margin:\s*0\s+4%/);
  });
});

describe("CUT3 presentation payload", () => {
  it("builds normalized winner with creative URL", () => {
    const presentation = buildPlatformPopupPresentationWinner(
      {
        campaignId: "camp-1",
        creativeId: "cr-1",
        surface: "TRADE",
        href: "/market",
      },
      baseCandidate,
      {
        assetUrl: baseCandidate.creative!.assetUrl,
        assetPath: baseCandidate.creative!.assetPath,
        altText: "QA",
      },
      { suppressionMode: "TODAY", suppressionDurationSeconds: null, timezone: "Asia/Manila" }
    );
    expect(presentation?.creative.imageUrl).toContain("platform-popup-creatives");
    expect(presentation?.creative.aspectW).toBe(36);
    expect(presentation?.suppressionOptions).toContain("TODAY");
  });

  it("fail closed when creative URL missing", () => {
    const presentation = buildPlatformPopupPresentationWinner(
      {
        campaignId: "camp-1",
        creativeId: "cr-1",
        surface: "TRADE",
        href: "/market",
      },
      baseCandidate,
      { assetUrl: "", assetPath: "" },
      { suppressionMode: "TODAY" }
    );
    expect(presentation).toBeNull();
  });

  it("TODAY offered; CAMPAIGN when policy CAMPAIGN", () => {
    const opts = resolvePlatformPopupPresentationSuppressionOptions({
      suppressionMode: "CAMPAIGN",
      suppressionDurationSeconds: null,
    });
    expect(opts).toContain("TODAY");
    expect(opts).toContain("CAMPAIGN");
  });
});

describe("CUT3 impression boundary", () => {
  beforeEach(() => {
    resetPlatformPopupImpressionDedupeForTests();
    vi.restoreAllMocks();
  });

  it("resolver/API blocked from impression", () => {
    expect(assertNotImpressionFromResolver("impression", "resolver").ok).toBe(false);
    expect(assertNotImpressionFromResolver("impression", "api_eligibility").ok).toBe(false);
    expect(assertHostMustNotEmitImpression().ok).toBe(true);
  });

  it("renderer gate passes; duplicate impression blocked client-side", async () => {
    expect(
      markPlatformPopupImpression({
        campaignId: "c1",
        creativeId: "cr1",
        surface: "TRADE",
        source: "renderer",
      }).ok
    ).toBe(true);

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    const input = {
      campaignId: "c1",
      creativeId: "cr1",
      surface: "TRADE",
      eventType: "impression" as const,
      source: "renderer" as const,
      exposureId: "exp-1",
    };

    expect((await recordPlatformPopupEvent(input)).ok).toBe(true);
    expect((await recordPlatformPopupEvent(input)).ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("host does not call markPlatformPopupImpression directly", () => {
    const host = readRepo("components/platform-popup/GlobalPopupHost.tsx");
    expect(host).not.toContain("markPlatformPopupImpression");
    expect(host).toContain("recordPlatformPopupEvent");
  });
});

describe("CUT3 overlay + accessibility contract", () => {
  it("uses DibayOverlayRoot with scroll lock and escape", () => {
    const renderer = readRepo("components/platform-popup/DibayPopupAd.tsx");
    expect(renderer).toContain("DibayOverlayRoot");
    expect(renderer).toContain("lockScroll");
    expect(renderer).toContain("onClose");
  });

  it("i18n dismiss label — not hardcoded Korean only", () => {
    const renderer = readRepo("components/platform-popup/DibayPopupAd.tsx");
    expect(renderer).toContain("platform_popup_dismiss_close");
    expect(renderer).not.toMatch(/>\s*닫기\s*</);
  });

  it("embedded mode for future admin preview", () => {
    const renderer = readRepo("components/platform-popup/DibayPopupAd.tsx");
    expect(renderer).toContain("embedded");
    expect(renderer).not.toContain("usePathname");
  });
});
