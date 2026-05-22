import { describe, expect, it } from "vitest";
import {
  OWNER_COMPACT_SHELL_BODY_DATA_ATTR,
  OWNER_COMPACT_SHELL_HEADER_CLASS,
} from "@/lib/business/owner-compact-shell-layout";
import {
  OWNER_COMPACT_SHELL_MAX_PX,
  OWNER_COMPACT_SHELL_MEDIA_QUERY,
  OWNER_COMPACT_TABLET_LAYOUT_MAX_PX,
  OWNER_COMPACT_TABLET_LAYOUT_MIN_PX,
  OWNER_DESKTOP_SHELL_MIN_PX,
} from "@/lib/business/owner-compact-shell-viewport";

describe("owner-compact-shell-viewport", () => {
  it("aligns compact upper bound with design-tokens lg (1024px)", () => {
    expect(OWNER_COMPACT_SHELL_MAX_PX).toBe(1024);
    expect(OWNER_DESKTOP_SHELL_MIN_PX).toBe(1025);
    expect(OWNER_COMPACT_SHELL_MEDIA_QUERY).toBe("(max-width: 1024px)");
  });

  it("aligns tablet band with design-tokens sm-tablet (768–1023)", () => {
    expect(OWNER_COMPACT_TABLET_LAYOUT_MIN_PX).toBe(768);
    expect(OWNER_COMPACT_TABLET_LAYOUT_MAX_PX).toBe(1023);
  });

  it("exports layout hooks for body portal and header shell", () => {
    expect(OWNER_COMPACT_SHELL_BODY_DATA_ATTR).toBe("data-owner-compact-shell");
    expect(OWNER_COMPACT_SHELL_HEADER_CLASS).toBe("owner-compact-shell__header");
  });
});
