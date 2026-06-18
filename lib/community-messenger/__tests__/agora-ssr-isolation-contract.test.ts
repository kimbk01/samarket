import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("agora-ssr-isolation contract markers", () => {
  it("CallIncomingChromeRoot uses ssr:false dynamic shell import", () => {
    const src = readFileSync(
      path.join(process.cwd(), "components/layout/providers/CallIncomingChromeRoot.tsx"),
      "utf8"
    );
    expect(src).toMatch(/ssr:\s*false/);
    expect(src).toMatch(/CallIncomingChrome/);
  });

  it("app/layout mounts CallIncomingChromeRoot not CallIncomingChrome", () => {
    const src = readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8");
    expect(src).toMatch(/CallIncomingChromeRoot/);
    expect(src).not.toMatch(
      /from\s+["']@\/components\/layout\/providers\/CallIncomingChrome["']/
    );
  });
});
