/**
 * SECURITY: `/api/community-messenger/calls` is read-only.
 * The former POST let any authenticated user insert a call log (service role) for an
 * arbitrary peer/room. Call logs are written only by the server terminal writer
 * (`updateCommunityMessengerCallSession` → finalizeLog / ensureTerminalCallStub).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");

describe("calls collection route is GET-only", () => {
  it("exports GET and no mutating handler", () => {
    const src = fs.readFileSync(path.join(ROOT, "app/api/community-messenger/calls/route.ts"), "utf8");
    expect(src).toMatch(/export async function GET\(/);
    expect(src).not.toMatch(/export (async )?function (POST|PUT|PATCH|DELETE)\b/);
    expect(src).not.toContain("createCommunityMessengerCallLog");
  });
});
