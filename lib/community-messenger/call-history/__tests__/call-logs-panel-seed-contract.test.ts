import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  callLogsIdentityKey,
  mergeCallLogsFirstPage,
} from "@/lib/community-messenger/call-history/call-logs-panel-merge";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";

const row = (id: string, extra: Partial<CommunityMessengerCallLog> = {}) =>
  ({ id, status: "ended", endedAt: "2026-10-21T00:00:00Z", durationSeconds: 10, ...extra }) as CommunityMessengerCallLog;

describe("C-2 mergeCallLogsFirstPage", () => {
  it("keeps older pages and puts new rows on top", () => {
    const prev = [row("b"), row("c"), row("d")];
    const merged = mergeCallLogsFirstPage(prev, [row("a"), row("b", { durationSeconds: 99 })]);
    expect(merged.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
    expect(merged[1].durationSeconds).toBe(99);
  });
});

describe("C-1 callLogsIdentityKey", () => {
  it("is stable for a fresh array with the same rows", () => {
    expect(callLogsIdentityKey([row("a")])).toBe(callLogsIdentityKey([row("a")]));
    expect(callLogsIdentityKey([])).toBe("");
  });
  it("changes when status or duration changes", () => {
    expect(callLogsIdentityKey([row("a")])).not.toBe(callLogsIdentityKey([row("a", { status: "missed" as never })]));
    expect(callLogsIdentityKey([row("a")])).not.toBe(callLogsIdentityKey([row("a", { durationSeconds: 11 })]));
  });
});

describe("C-1/C-18 MessengerCallLogsPanel source contract", () => {
  const src = readFileSync(
    path.join(process.cwd(), "components/community-messenger/MessengerCallLogsPanel.tsx"),
    "utf8"
  );
  it("does not default props to a new array per render", () => {
    expect(src).not.toMatch(/seedCalls = \[\]/);
    expect(src).not.toMatch(/peerProfiles = \[\]/);
    expect(src).toMatch(/seedCalls = EMPTY_CALLS/);
    expect(src).toMatch(/peerProfiles = EMPTY_PROFILES/);
  });
  it("seed effect is keyed on content, not array identity", () => {
    expect(src).toMatch(/\[seedKey, callsHydrating, enrichCalls\]/);
    expect(src).not.toMatch(/\[seedCalls, callsHydrating, enrichCalls\]/);
  });
  it("resolves viewer id asynchronously when the sync cache is empty", () => {
    expect(src).toMatch(/getCurrentUserIdForDb\(\)/);
  });
});
