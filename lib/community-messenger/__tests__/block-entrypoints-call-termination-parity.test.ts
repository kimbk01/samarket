import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** 차단(blockUserSocial 성공) 진입점은 모두 같은 통화 종료 부수효과를 가진다. */
const BLOCK_ENTRYPOINTS = [
  "app/api/community-messenger/relations/block/route.ts",
  "app/api/community/block-relations/route.ts",
  "app/api/chat/rooms/[roomId]/block/route.ts",
];

describe("block entrypoints — call termination parity", () => {
  for (const rel of BLOCK_ENTRYPOINTS) {
    it(`${rel} ends ringing/active direct calls after block`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      expect(src).toContain("blockUserSocial(");
      expect(src).toContain("terminateDirectCallsOnBlockBestEffort(");
      expect(src.indexOf("terminateDirectCallsOnBlockBestEffort(")).toBeGreaterThan(src.indexOf("blockUserSocial("));
    });
  }
});
