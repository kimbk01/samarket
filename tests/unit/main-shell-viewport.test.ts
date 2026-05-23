import { describe, expect, it } from "vitest";
import {
  APP_SHELL_FILL_VIEWPORT_CLASS,
  MAIN_COLUMN_SCROLL_CLASS,
  MAIN_SHELL_VIEWPORT_LOCK_CLASS,
  resolvesMainScrollInMainColumn,
} from "@/lib/layout/main-shell-viewport";

describe("main-shell-viewport", () => {
  it("locks viewport height on main shell root", () => {
    expect(MAIN_SHELL_VIEWPORT_LOCK_CLASS).toMatch(/100dvh/);
    expect(MAIN_SHELL_VIEWPORT_LOCK_CLASS).toMatch(/overflow-hidden/);
  });

  it("enables main column scroll for hub surfaces", () => {
    expect(
      resolvesMainScrollInMainColumn({
        isChatRoomDetail: false,
        isStoreOwnerAdminRoute: false,
        isMainColumnViewportLocked: false,
      })
    ).toBe(true);
  });

  it("disables main column scroll for chat·owner·cart lock", () => {
    expect(
      resolvesMainScrollInMainColumn({
        isChatRoomDetail: true,
        isStoreOwnerAdminRoute: false,
        isMainColumnViewportLocked: false,
      })
    ).toBe(false);
    expect(
      resolvesMainScrollInMainColumn({
        isChatRoomDetail: false,
        isStoreOwnerAdminRoute: true,
        isMainColumnViewportLocked: false,
      })
    ).toBe(false);
    expect(
      resolvesMainScrollInMainColumn({
        isChatRoomDetail: false,
        isStoreOwnerAdminRoute: false,
        isMainColumnViewportLocked: true,
      })
    ).toBe(false);
  });

  it("main scroll class includes overflow-y-auto", () => {
    expect(MAIN_COLUMN_SCROLL_CLASS).toMatch(/overflow-y-auto/);
    expect(APP_SHELL_FILL_VIEWPORT_CLASS).toMatch(/overflow-hidden/);
  });
});
