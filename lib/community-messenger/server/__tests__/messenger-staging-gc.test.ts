import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  messengerStagingGcStartIndex,
  runMessengerStagingGc,
  type MessengerStagingGcStorage,
} from "@/lib/community-messenger/server/messenger-staging-gc.server";

const NOW = Date.parse("2026-10-21T00:00:00Z");
const OLD = new Date(NOW - 25 * 3600_000).toISOString();
const FRESH = new Date(NOW - 2 * 3600_000).toISOString();
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const R1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const F_OLD = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf";
const F_FRESH = "cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg";
const F_OLD_IMG = "dddddddd-dddd-4ddd-8ddd-dddddddddddd.png";

type Obj = { name: string; id: string | null; created_at?: string | null };

function fakeStorage(tree: Record<string, Record<string, Obj[]>>) {
  const removed: Record<string, string[]> = {};
  let listCalls = 0;
  const storage: MessengerStagingGcStorage = {
    from(bucket: string) {
      return {
        async list(p: string, opts?: { limit?: number; offset?: number }) {
          listCalls += 1;
          const b = tree[bucket];
          if (!b) return { data: null, error: { message: "Bucket not found" } };
          const all = b[p] ?? [];
          const off = opts?.offset ?? 0;
          const lim = opts?.limit ?? 100;
          return { data: all.slice(off, off + lim), error: null };
        },
        async remove(paths: string[]) {
          (removed[bucket] ??= []).push(...paths);
          return { data: [], error: null };
        },
      };
    },
  };
  return { storage, removed, listCalls: () => listCalls };
}

const folder = (name: string): Obj => ({ name, id: null });
const file = (name: string, created_at: string): Obj => ({ name, id: `id-${name}`, created_at });

describe("A-2 messenger staging GC", () => {
  it("removes only staging leaves older than 24h; keeps fresh, final media and foreign names", async () => {
    const legacy: Record<string, Obj[]> = {
      "": [folder(U1), folder(U2), folder("not-a-user"), file("root.txt", OLD)],
      [`${U1}/community`]: [folder("messenger-file-staging"), folder("messenger-image-staging"), folder("messenger-file")],
      [`${U1}/community/messenger-file-staging`]: [folder(R1)],
      [`${U1}/community/messenger-file-staging/${R1}`]: [
        file(F_OLD, OLD),
        file(F_FRESH, FRESH),
        file("evil.pdf", OLD),
        folder("nested"),
      ],
      [`${U1}/community/messenger-image-staging`]: [folder(R1)],
      [`${U1}/community/messenger-image-staging/${R1}`]: [file(F_OLD_IMG, OLD)],
      [`${U1}/community/messenger-file/${R1}`]: [file(F_OLD, OLD)],
      [`${U2}/community`]: [],
    };
    const fs = fakeStorage({ "post-images": legacy });
    const r = await runMessengerStagingGc({ storage: fs.storage, nowMs: NOW });
    expect(fs.removed["post-images"]!.sort()).toEqual(
      [
        `${U1}/community/messenger-file-staging/${R1}/${F_OLD}`,
        `${U1}/community/messenger-image-staging/${R1}/${F_OLD_IMG}`,
      ].sort()
    );
    expect(r.removed).toBe(2);
    const priv = r.buckets.find((b) => b.bucket === "messenger-media")!;
    expect(priv.skipped).toBe("list_failed");
    const leg = r.buckets.find((b) => b.bucket === "post-images")!;
    expect(leg.users_total).toBe(2);
    expect(leg.staged_objects).toBe(3);
    expect(leg.stale).toBe(2);
  });

  it("respects hard caps (removals, list calls)", async () => {
    const files = Array.from({ length: 30 }, (_, i) =>
      file(`${String(i).padStart(8, "0")}-0000-4000-8000-000000000000.bin`, OLD)
    );
    const tree = {
      "post-images": {
        "": [folder(U1)],
        [`${U1}/community`]: [folder("messenger-file-staging")],
        [`${U1}/community/messenger-file-staging`]: [folder(R1)],
        [`${U1}/community/messenger-file-staging/${R1}`]: files,
      },
    };
    const a = fakeStorage(tree);
    const r = await runMessengerStagingGc({ storage: a.storage, nowMs: NOW, limits: { maxRemovals: 10 } });
    expect(r.removed).toBe(10);
    expect(r.capped).toBe("removals");

    const b = fakeStorage(tree);
    const r2 = await runMessengerStagingGc({ storage: b.storage, nowMs: NOW, limits: { maxListCalls: 2 } });
    expect(r2.capped).toBe("list_calls");
    expect(b.listCalls()).toBeLessThanOrEqual(2);
    expect(r2.removed).toBe(0);
  });

  it("rotates the user window by day", () => {
    expect(messengerStagingGcStartIndex(10, 20, NOW)).toBe(0);
    const day = 24 * 3600_000;
    const a = messengerStagingGcStartIndex(1000, 300, NOW);
    const b = messengerStagingGcStartIndex(1000, 300, NOW + day);
    expect(b).toBe((a + 300) % 1000);
  });

  it("cron route checks CRON_SECRET and is registered daily in vercel.json", () => {
    const root = path.resolve(__dirname, "../../../..");
    const route = readFileSync(path.join(root, "app/api/cron/community-messenger-staging-gc/route.ts"), "utf8");
    expect(route).toContain("verifyCronRequestAuthorization(req, secret)");
    expect(route).toContain("cron_secret_not_configured");
    const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const entry = vercel.crons.find((c) => c.path === "/api/cron/community-messenger-staging-gc");
    expect(entry).toBeTruthy();
    expect(entry!.schedule.split(" ").slice(2)).toEqual(["*", "*", "*"]);
    expect(entry!.schedule.split(" ")[1]).toMatch(/^\d+$/);
  });
});
