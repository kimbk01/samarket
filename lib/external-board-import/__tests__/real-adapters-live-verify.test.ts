import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveExternalBoardAdapter } from "@/lib/external-board-import/adapters/registry";

const OUT = resolve("tests/e2e/.artifacts/external-board-real-adapter-verify");
mkdirSync(OUT, { recursive: true });

const TARGETS = [
  "http://manilaseoul.co.kr/bbs_list.php?tb=board_free",
  "https://pinoy.forum/",
  "https://philsamo.com/bbs/board.php?bo_table=news",
  "https://hellocebuph.com/",
] as const;

const LIVE = process.env.EXTERNAL_BOARD_LIVE_VERIFY === "1";

describe("real external board adapter live verify", () => {
  it(
    "VERIFY READY/PARTIAL with sample documents on 4 hosts",
    async () => {
      if (!LIVE) {
        // Network/live host proof — run explicitly: EXTERNAL_BOARD_LIVE_VERIFY=1
        expect(LIVE).toBe(false);
        return;
      }
      const results = [];
      for (const url of TARGETS) {
        const { adapter, ctx } = resolveExternalBoardAdapter(url);
        expect(adapter, `adapter for ${url}`).toBeTruthy();
        const t0 = Date.now();
        const verified = await adapter!.verifyBoard(ctx);
        const row = {
          url,
          adapterId: adapter!.id,
          ms: Date.now() - t0,
          status: verified.status,
          reasons: verified.reasons,
          sampleCount: verified.samples.length,
          withDocs: verified.samples.filter((s) => (s.sampleDocument?.nodes.length ?? 0) > 0).length,
          samples: verified.samples.map((s) => ({
            id: s.stableArticleIdentity,
            title: s.title,
            nodes: s.sampleDocument?.nodes.length ?? 0,
            images: s.sampleDocument?.nodes.filter((n) => n.type === "image").length ?? 0,
            author: s.sourceAuthor ?? null,
            date: s.sourcePublishedAt ?? null,
            excerpt:
              s.sampleDocument?.nodes
                .filter((n) => n.type === "paragraph")
                .map((n) => ("text" in n ? n.text : ""))
                .join(" ")
                .slice(0, 160) ?? "",
          })),
        };
        results.push(row);
      }
      writeFileSync(resolve(OUT, "LIVE-VERIFY.json"), JSON.stringify({ TIMESTAMP: new Date().toISOString(), results }, null, 2));
      const ready = results.filter((r) => r.status === "READY").length;
      const partial = results.filter((r) => r.status === "PARTIAL").length;
      const unsupported = results.filter((r) => r.status === "UNSUPPORTED");
      writeFileSync(
        resolve(OUT, "SUMMARY.md"),
        `# Real adapter live VERIFY\n\nREADY=${ready}/${results.length}\nPARTIAL=${partial}\nUNSUPPORTED=${unsupported.length}\n\n` +
          results.map((r) => `- ${r.adapterId}: ${r.status} docs=${r.withDocs}`).join("\n") +
          "\n\nREAL INGESTION PASS still requires Admin publish→Community (not claimed here).\n"
      );
      expect(unsupported, JSON.stringify(unsupported)).toEqual([]);
      expect(ready + partial).toBe(results.length);
      for (const r of results) {
        expect(r.withDocs).toBeGreaterThanOrEqual(1);
      }
    },
    180_000
  );
});
