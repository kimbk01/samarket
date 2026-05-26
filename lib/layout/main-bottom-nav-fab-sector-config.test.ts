import { describe, expect, it } from "vitest";
import {
  FAB_ICON_BOX_REM,
  FAB_PANEL_INSET_REM,
  FAB_SHELL_W_REM,
  FAB_SURFACE_ALPHA,
  fabSectorRootStyle,
} from "@/lib/layout/main-bottom-nav-fab-sector-config";

describe("main-bottom-nav-fab-sector-config", () => {
  it("패널 inset = (셸 − 아이콘박스) / 2", () => {
    expect(FAB_PANEL_INSET_REM).toBe((FAB_SHELL_W_REM - FAB_ICON_BOX_REM) / 2);
  });

  it("fabSectorRootStyle — CSS 변수 일관", () => {
    const style = fabSectorRootStyle();
    expect(style["--fab-surface-alpha"]).toBe(String(FAB_SURFACE_ALPHA));
    expect(style["--fab-shell-w"]).toBe(`${FAB_SHELL_W_REM}rem`);
    expect(style["--fab-panel-inset"]).toBe(`${FAB_PANEL_INSET_REM}rem`);
  });
});
