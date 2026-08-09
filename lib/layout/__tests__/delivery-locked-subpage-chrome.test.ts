import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DELIVERY_LOCKED_SUBPAGE_HEADER_CLASS,
  DELIVERY_LOCKED_SUBPAGE_ROOT_CLASS,
} from "@/lib/layout/delivery-locked-subpage-chrome";

const ROOT = join(__dirname, "..", "..", "..");

describe("delivery locked subpage chrome SSOT", () => {
  it("owns safe-top and width without vw units", () => {
    expect(DELIVERY_LOCKED_SUBPAGE_HEADER_CLASS).toContain("pt-[var(--safe-top)]");
    expect(DELIVERY_LOCKED_SUBPAGE_HEADER_CLASS).toContain("min-w-0");
    expect(DELIVERY_LOCKED_SUBPAGE_HEADER_CLASS).toContain("max-w-full");
    expect(DELIVERY_LOCKED_SUBPAGE_HEADER_CLASS).not.toMatch(/100(?:d|s|l)?vw/);
    expect(DELIVERY_LOCKED_SUBPAGE_ROOT_CLASS).toContain("min-w-0");
  });

  it("DeliverySubpageHeader and MySubpageHeader inlineChrome consume SSOT", () => {
    const delivery = readFileSync(
      join(ROOT, "components/stores/chrome/DeliverySubpageHeader.tsx"),
      "utf8"
    );
    const my = readFileSync(join(ROOT, "components/my/MySubpageHeader.tsx"), "utf8");
    expect(delivery).toContain("DELIVERY_LOCKED_SUBPAGE_HEADER_CLASS");
    expect(my).toContain("DELIVERY_LOCKED_SUBPAGE_HEADER_CLASS");
  });
});
