import { describe, expect, it } from "vitest";
import {
  OWNER_COMPACT_SHELL_MAIN_PB_CLASS,
  OWNER_COMPACT_SHELL_SCROLL_CLASS,
} from "@/lib/business/owner-compact-shell-layout";

describe("owner compact shell scroll contract", () => {
  it("scroll hide targets owner scroll + main-pb roots only", () => {
    expect(OWNER_COMPACT_SHELL_SCROLL_CLASS).toBe("owner-compact-shell__scroll");
    expect(OWNER_COMPACT_SHELL_MAIN_PB_CLASS).toBe("owner-compact-shell__main-pb");
  });
});
