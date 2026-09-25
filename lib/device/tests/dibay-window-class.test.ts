import { describe, expect, it } from "vitest";
import {
  DIBAY_COMMUNITY_GEOMETRY,
  DIBAY_DOMAIN_GEOMETRY_LOCK_STATE,
  DIBAY_MESSENGER_GEOMETRY,
  DIBAY_TRADE_GEOMETRY,
  getDomainTwoPaneFloorPx,
} from "@/lib/device/dibay-domain-geometry";
import {
  DIBAY_EXISTING_BREAKPOINT_CLASSIFICATION,
  DIBAY_SHADOW_DEVICE_AUTHORITIES_REMAINING,
} from "@/lib/device/dibay-breakpoint-classification";
import { resolveLayoutMode } from "@/lib/device/dibay-layout-resolver";
import {
  classifyWindowClass,
  DIBAY_WINDOW_CLASS_BANDS,
  DIBAY_WINDOW_CLASS_LOCK_STATE,
  measureUsableWindow,
} from "@/lib/device/dibay-window-class";

describe("FD2 WindowClass bands — CANDIDATE_NOT_LOCKED", () => {
  it("does not claim HARD LOCK numbers", () => {
    expect(DIBAY_WINDOW_CLASS_LOCK_STATE).toBe("CANDIDATE_NOT_LOCKED");
    expect(DIBAY_WINDOW_CLASS_BANDS.lockState).toBe("CANDIDATE_NOT_LOCKED");
    expect(DIBAY_DOMAIN_GEOMETRY_LOCK_STATE).toBe("CANDIDATE_NOT_LOCKED");
  });

  it("classifies candidate bands from usable width, not Device", () => {
    expect(classifyWindowClass(759)).toBe("COMPACT");
    expect(classifyWindowClass(760)).toBe("MEDIUM");
    expect(classifyWindowClass(1229)).toBe("MEDIUM");
    expect(classifyWindowClass(1230)).toBe("EXPANDED");
    expect(classifyWindowClass(1301)).toBe("EXPANDED");
    expect(classifyWindowClass(1302)).toBe("LARGE");
  });
});

describe("FD2 usable window authority", () => {
  it("prefers visualViewport.width minus safe left/right", () => {
    const snap = measureUsableWindow({
      innerWidth: 430,
      innerHeight: 932,
      visualViewportWidth: 414,
      visualViewportHeight: 700,
      safeLeftPx: 8,
      safeRightPx: 6,
    });
    expect(snap.availableWidthSource).toBe("visualViewport.width");
    expect(snap.availableWidth).toBe(414);
    expect(snap.usableWidth).toBe(400);
    expect(snap.usableHeight).toBe(700);
  });

  it("falls back to innerWidth when visualViewport width is absent", () => {
    const snap = measureUsableWindow({
      innerWidth: 390,
      innerHeight: 844,
      visualViewportWidth: null,
      safeLeftPx: 0,
      safeRightPx: 0,
    });
    expect(snap.availableWidthSource).toBe("innerWidth");
    expect(snap.usableWidth).toBe(390);
  });

  it("does not treat innerWidth alone as Device identity", () => {
    const snap = measureUsableWindow({
      innerWidth: 1024,
      visualViewportWidth: 1024,
      safeLeftPx: 0,
      safeRightPx: 0,
    });
    expect(classifyWindowClass(snap.usableWidth)).toBe("MEDIUM");
  });
});

describe("FD2 domain floors are not Device cutoffs", () => {
  it("keeps Messenger / Community / Trade floors distinct", () => {
    expect(DIBAY_MESSENGER_GEOMETRY.twoPaneFloorPx).toBe(760);
    expect(DIBAY_MESSENGER_GEOMETRY.listMinPx + DIBAY_MESSENGER_GEOMETRY.roomMinPx).toBe(760);
    expect(DIBAY_MESSENGER_GEOMETRY.legacyCssSplitMinPx).toBe(768);
    expect(DIBAY_COMMUNITY_GEOMETRY.twoPaneFloorPx).toBe(840);
    expect(DIBAY_TRADE_GEOMETRY.twoPaneFloorPx).toBe(720);
    expect(DIBAY_TRADE_GEOMETRY.twoPaneFloorPx).not.toBe(DIBAY_COMMUNITY_GEOMETRY.twoPaneFloorPx);
    expect(getDomainTwoPaneFloorPx("messenger")).toBe(760);
    expect(getDomainTwoPaneFloorPx("community")).toBe(840);
    expect(getDomainTwoPaneFloorPx("trade")).toBe(720);
  });
});

describe("FD2 required layout matrix", () => {
  it("PHONE_ANDROID + W390 → PHONE_SINGLE", () => {
    const result = resolveLayoutMode({
      deviceClass: "PHONE_ANDROID",
      usableWidthPx: 390,
      domain: "messenger",
    });
    expect(result.layoutMode).toBe("PHONE_SINGLE");
    expect(result.deviceClass).toBe("PHONE_ANDROID");
    expect(result.windowClass).toBe("COMPACT");
  });

  it("PHONE_ANDROID + W844 → PHONE_SINGLE (wide phone stays phone)", () => {
    const result = resolveLayoutMode({
      deviceClass: "PHONE_ANDROID",
      usableWidthPx: 844,
      domain: "community",
    });
    expect(result.layoutMode).toBe("PHONE_SINGLE");
    expect(result.deviceClass).toBe("PHONE_ANDROID");
    expect(result.windowClass).toBe("MEDIUM");
  });

  it("PHONE_IOS + W430 → PHONE_SINGLE", () => {
    expect(
      resolveLayoutMode({
        deviceClass: "PHONE_IOS",
        usableWidthPx: 430,
        domain: "trade",
      }).layoutMode,
    ).toBe("PHONE_SINGLE");
  });

  it("PHONE_IOS + W932 → PHONE_SINGLE", () => {
    expect(
      resolveLayoutMode({
        deviceClass: "PHONE_IOS",
        usableWidthPx: 932,
        domain: "messenger",
      }).layoutMode,
    ).toBe("PHONE_SINGLE");
  });

  it("phone stays PHONE_SINGLE at 760 / 768 / 840 / 1024 / 1366", () => {
    for (const width of [760, 768, 840, 1024, 1366]) {
      expect(
        resolveLayoutMode({
          deviceClass: "PHONE_ANDROID",
          usableWidthPx: width,
          domain: "community",
        }).layoutMode,
      ).toBe("PHONE_SINGLE");
      expect(
        resolveLayoutMode({
          deviceClass: "PHONE_IOS",
          usableWidthPx: width,
          domain: "messenger",
        }).layoutMode,
      ).toBe("PHONE_SINGLE");
    }
  });

  it("TABLET_ANDROID + W590 → TABLET_STACKED", () => {
    const result = resolveLayoutMode({
      deviceClass: "TABLET_ANDROID",
      usableWidthPx: 590,
      domain: "messenger",
    });
    expect(result.layoutMode).toBe("TABLET_STACKED");
    expect(result.deviceClass).toBe("TABLET_ANDROID");
    expect(result.windowClass).toBe("COMPACT");
  });

  it("TABLET_ANDROID + W760 → Messenger TABLET_DUAL candidate", () => {
    const result = resolveLayoutMode({
      deviceClass: "TABLET_ANDROID",
      usableWidthPx: 760,
      domain: "messenger",
    });
    expect(result.layoutMode).toBe("TABLET_DUAL");
    expect(result.windowClassLockState).toBe("CANDIDATE_NOT_LOCKED");
  });

  it("TABLET_IPAD + W744 → Community TABLET_STACKED", () => {
    expect(
      resolveLayoutMode({
        deviceClass: "TABLET_IPAD",
        usableWidthPx: 744,
        domain: "community",
      }).layoutMode,
    ).toBe("TABLET_STACKED");
  });

  it("TABLET_IPAD + W820 → Community TABLET_STACKED if floor 840", () => {
    expect(DIBAY_COMMUNITY_GEOMETRY.twoPaneFloorPx).toBe(840);
    expect(
      resolveLayoutMode({
        deviceClass: "TABLET_IPAD",
        usableWidthPx: 820,
        domain: "community",
      }).layoutMode,
    ).toBe("TABLET_STACKED");
  });

  it("TABLET_IPAD + W1024 → Community TABLET_DUAL", () => {
    expect(
      resolveLayoutMode({
        deviceClass: "TABLET_IPAD",
        usableWidthPx: 1024,
        domain: "community",
      }).layoutMode,
    ).toBe("TABLET_DUAL");
  });

  it("DESKTOP_WINDOWS + W500 → DESKTOP_STACKED", () => {
    const result = resolveLayoutMode({
      deviceClass: "DESKTOP_WINDOWS",
      usableWidthPx: 500,
      domain: "trade",
    });
    expect(result.layoutMode).toBe("DESKTOP_STACKED");
    expect(result.deviceClass).toBe("DESKTOP_WINDOWS");
  });

  it("DESKTOP_WINDOWS + W1400 → DESKTOP_DUAL, never auto TRIPLE", () => {
    const result = resolveLayoutMode({
      deviceClass: "DESKTOP_WINDOWS",
      usableWidthPx: 1400,
      domain: "messenger",
    });
    expect(result.layoutMode).toBe("DESKTOP_DUAL");
    expect(result.layoutMode).not.toBe("DESKTOP_TRIPLE");
    expect(result.windowClass).toBe("LARGE");
  });

  it("UNKNOWN → UNKNOWN_SAFE", () => {
    expect(
      resolveLayoutMode({
        deviceClass: "UNKNOWN",
        usableWidthPx: 1024,
        domain: "community",
      }).layoutMode,
    ).toBe("UNKNOWN_SAFE");
  });
});

describe("FD2 keyboard must not move Device family", () => {
  it("keyboardOpen does not turn a wide phone into tablet/desktop", () => {
    const result = resolveLayoutMode({
      deviceClass: "PHONE_ANDROID",
      usableWidthPx: 844,
      domain: "messenger",
      keyboardOpen: true,
    });
    expect(result.layoutMode).toBe("PHONE_SINGLE");
    expect(result.layoutFamily).toBe("PHONE");
    expect(result.keyboardOpen).toBe(true);
  });

  it("keyboard-shrunk desktop window stays DESKTOP_STACKED, not PHONE_SINGLE", () => {
    const result = resolveLayoutMode({
      deviceClass: "DESKTOP_WINDOWS",
      usableWidthPx: 390,
      domain: "community",
      keyboardOpen: true,
    });
    expect(result.layoutMode).toBe("DESKTOP_STACKED");
    expect(result.deviceClass).toBe("DESKTOP_WINDOWS");
  });

  it("keyboard-shrunk tablet window stays TABLET_STACKED, not PHONE_SINGLE", () => {
    const result = resolveLayoutMode({
      deviceClass: "TABLET_IPAD",
      usableWidthPx: 500,
      domain: "messenger",
      keyboardOpen: true,
    });
    expect(result.layoutMode).toBe("TABLET_STACKED");
    expect(result.deviceClass).toBe("TABLET_IPAD");
  });
});

describe("FD2 call modes are Device-family only", () => {
  it("maps call domain without using width as Device", () => {
    expect(
      resolveLayoutMode({
        deviceClass: "PHONE_IOS",
        usableWidthPx: 932,
        domain: "call",
        orientation: "landscape",
      }).layoutMode,
    ).toBe("CALL_PHONE");
    expect(
      resolveLayoutMode({
        deviceClass: "TABLET_ANDROID",
        usableWidthPx: 590,
        domain: "call",
        orientation: "portrait",
      }).layoutMode,
    ).toBe("CALL_TABLET_PORTRAIT");
    expect(
      resolveLayoutMode({
        deviceClass: "TABLET_IPAD",
        usableWidthPx: 1024,
        domain: "call",
        orientation: "landscape",
      }).layoutMode,
    ).toBe("CALL_TABLET_LANDSCAPE");
    expect(
      resolveLayoutMode({
        deviceClass: "WEB_DESKTOP",
        usableWidthPx: 500,
        domain: "call",
      }).layoutMode,
    ).toBe("CALL_DESKTOP");
  });
});

describe("FD2 breakpoint inventory", () => {
  it("marks 768 messenger split as DOMAIN_PANE_FLOOR, not Device", () => {
    const messengerSplit = DIBAY_EXISTING_BREAKPOINT_CLASSIFICATION.find(
      (row) => row.px === 768 && row.kind === "DOMAIN_PANE_FLOOR",
    );
    expect(messengerSplit?.meaning).toMatch(/Not a tablet Device cutoff/i);
  });

  it("does not keep the FD4-removed 5-tier viewport identity as a live shadow", () => {
    expect(DIBAY_SHADOW_DEVICE_AUTHORITIES_REMAINING.map((row) => row.id)).not.toContain(
      "use-app-viewport-size-5-tier",
    );
  });
});
