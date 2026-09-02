import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { openSupportCenter } from "@/lib/support/open-support-center";
import { DISABLED_SUPPORT_CONTEXT } from "@/lib/support/support-context";
import {
  SUPPORT_FAB_ENABLED_ROUTE_FILES,
  SUPPORT_FAB_ENABLED_VIEW_FILES,
  SUPPORT_FAB_FORBIDDEN_ROUTE_FILES,
} from "@/lib/support/support-fab-route-registry";

const ROOT = join(__dirname, "..", "..", "..");

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function listSupportTsFiles(dir: string): string[] {
  const abs = join(ROOT, dir);
  const out: string[] = [];
  for (const entry of readdirSync(abs)) {
    const rel = join(dir, entry);
    const full = join(ROOT, rel);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...listSupportTsFiles(rel));
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(rel);
    }
  }
  return out;
}

const SUPPORT_WIRING_MARKERS = [
  "SupportContextProvider",
  "OwnerSupportContextBridge",
  "OwnerStoreSupportShell",
  "OwnedGiftInstanceSupportShell",
  "OwnerProductEditSupportShell",
  "OwnerDeliveryAdDetailSupportShell",
  "OwnerDeliveryAdDetailPageBody",
  "MyStoreOrderDetailView",
  "buildMemberSupportContext",
  "buildOwnerSupportContext",
] as const;

function hasSupportFabWiring(source: string): boolean {
  return SUPPORT_WIRING_MARKERS.some((marker) => source.includes(marker));
}

describe("support fab visibility contract", () => {
  it("openSupportCenter rejects disabled context", () => {
    const res = openSupportCenter(DISABLED_SUPPORT_CONTEXT);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("disabled");
    }
  });

  it("lib/support visibility modules do not pathname-resolve FAB visibility", () => {
    const forbidden = [
      /resolveSupportContextFromPathname/,
      /usePathname\s*\(/,
      /startsWith\s*\(\s*["']\/mypage/,
      /startsWith\s*\(\s*["']\/stores/,
    ];
    const files = listSupportTsFiles("lib/support").filter(
      (f) => !f.includes("__tests__")
    );
    for (const file of files) {
      const src = readRepo(file);
      for (const pattern of forbidden) {
        expect(src, `${file} must not use pathname for FAB visibility`).not.toMatch(
          pattern
        );
      }
    }
  });

  it("SupportFabHost gates on enabled context only (no usePathname)", () => {
    const host = readRepo("components/support/SupportFabHost.tsx");
    expect(host).toContain("useSupportFabVisible");
    expect(host).not.toMatch(/usePathname\s*\(/);
  });

  it("enabled route registry files wire explicit support context", () => {
    for (const route of SUPPORT_FAB_ENABLED_ROUTE_FILES) {
      const src = readRepo(route);
      expect(hasSupportFabWiring(src), `${route} missing support FAB wiring`).toBe(
        true
      );
    }
    for (const view of SUPPORT_FAB_ENABLED_VIEW_FILES) {
      const src = readRepo(view);
      expect(hasSupportFabWiring(src), `${view} missing support FAB wiring`).toBe(
        true
      );
    }
  });

  it("forbidden routes do not opt in Support FAB at page level", () => {
    for (const route of SUPPORT_FAB_FORBIDDEN_ROUTE_FILES) {
      const src = readRepo(route);
      expect(
        src.includes("SupportContextProvider") ||
          src.includes("OwnerSupportContextBridge") ||
          src.includes("OwnerStoreSupportShell"),
        `${route} must not mount support FAB provider`
      ).toBe(false);
      expect(src).not.toMatch(/enabled:\s*true/);
    }
  });

  it("ConditionalAppShell mounts eager SupportModalHost and lazy FAB host", () => {
    const shell = readRepo("components/layout/ConditionalAppShell.tsx");
    expect(shell).toContain("SupportFabHostLazy");
    expect(shell).toContain("<SupportModalHost />");
    expect(shell).toContain("SupportFabRegistryProvider");
    expect(shell).not.toMatch(/SupportFabHost[\s\S]{0,200}usePathname/);
  });
});
