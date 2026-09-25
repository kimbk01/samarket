import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("FD4 App Shell authority wiring", () => {
  it("ConditionalAppShell consumes the canonical shell hook and does not remount on DeviceClass", () => {
    const shell = src("components/layout/ConditionalAppShell.tsx");
    expect(shell).toContain("useDibayAppShellAuthority");
    expect(shell).toContain("data-dibay-device-class");
    expect(shell).toContain("data-dibay-shell-family");
    expect(shell).toContain("data-dibay-nav-presentation");
    expect(shell).not.toMatch(/key=\{[^}]*deviceClass/);
    expect(shell).not.toMatch(/key=\{[^}]*shellFamily/);
    expect(shell).not.toContain("useIsAppViewportMobile");
    expect(shell).not.toContain("useIsAppViewportTabletOrAbove");
    expect(shell).not.toContain("navigator.userAgent");
    expect(shell).not.toContain("maxTouchPoints");
    expect(shell).not.toMatch(/width\s*<\s*768/);
    expect(shell).not.toMatch(/width\s*>=\s*768/);
    expect(shell).toContain("<BottomNav");
    expect(shell).not.toContain("MainDesktopSideNav");
    expect(shell).not.toContain("TabletNav");
  });

  it("use-app-viewport-size is measurement only after FD4", () => {
    const vp = src("lib/ui/use-app-viewport-size.ts");
    expect(vp).toContain("Viewport measurement only");
    expect(vp).not.toContain("pickBreakpoint");
    expect(vp).not.toContain("isTouchTablet");
    expect(vp).not.toContain("useIsAppViewportMobile");
    expect(vp).not.toContain("useIsAppViewportTabletOrAbove");
    expect(vp).not.toContain("tablet-portrait");
    expect(vp).not.toContain("maxTouchPoints");
    expect(vp).toContain("width");
    expect(vp).toContain("visualHeight");
  });

  it("shell resolver does not read window or UA", () => {
    const resolver = src("lib/device/dibay-shell-resolver.ts");
    expect(resolver).toContain("resolveAppShell");
    expect(resolver).not.toContain("innerWidth");
    expect(resolver).not.toContain("matchMedia");
    expect(resolver).not.toContain("userAgent");
    expect(resolver).not.toContain("maxTouchPoints");
    expect(resolver).toContain("EXISTING_MAIN_BOTTOM_NAV");
  });

  it("does not restore a second mounted desktop rail", () => {
    const desktopHook = src("hooks/use-is-desktop-shell-viewport.ts");
    expect(desktopHook).toContain("항상 false");
    const flags = src("lib/layout/conditional-app-shell-flags.ts");
    expect(flags).toContain("showMainDesktopSideNavEligible");
  });

  it("leaves Messenger 768 split with FD7", () => {
    const messenger = src("hooks/use-is-messenger-split-viewport.ts");
    expect(messenger).toContain("APP_MESSENGER_SPLIT_MIN_PX");
    const shell = src("components/layout/ConditionalAppShell.tsx");
    expect(shell).toContain("APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS");
    expect(shell).toContain("useIsMessengerSplitViewport");
  });
});
