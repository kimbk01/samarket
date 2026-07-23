/**
 * @vitest-environment node
 * Hub blank-list remount contract — source-level regression guards.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("hub list remount blank-list lock", () => {
  it("empty remount must not be gated by session foreground claim", () => {
    const home = read("lib/community-messenger/home/use-community-messenger-home-bootstrap.ts");
    expect(home).not.toContain("tryClaimInitialForegroundBootstrap");
    expect(home).not.toContain("samarket:cm:initial-foreground-bootstrap:v1");
    expect(home).toContain("room_return_memory_paint");
    expect(home).toMatch(/Empty \/ missing cache — always fetch/);
  });

  it("viewer null must not clearBootstrapCache (Host remount wipe)", () => {
    const src = read("lib/community-messenger/home/bootstrap-cache-bus-writer.ts");
    expect(src).toContain("DO NOT call clearBootstrapCache on viewer null");
    expect(src).not.toMatch(/if \(!next\) \{\s*clearBootstrapCache\(\);/);
  });

  it("memoryFresh requires hasRooms before skip refresh", () => {
    const home = read("lib/community-messenger/home/use-community-messenger-home-bootstrap.ts");
    expect(home).toMatch(
      /hasRooms && \(isBootstrapCacheFresh\(\) \|\| isCriticalBootstrapCacheFresh\(\)\)/
    );
  });
});
