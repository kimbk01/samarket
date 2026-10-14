import { describe, expect, it } from "vitest";
import {
  assertPhase1Layers,
  isShaFormat,
  readRuntimeGitSha,
} from "@/lib/admin/deploy-promotion/deploy-promotion-ssot";

describe("deploy-promotion-ssot", () => {
  it("accepts git sha formats", () => {
    expect(isShaFormat("6ba9ad329")).toBe(true);
    expect(isShaFormat("not-a-sha")).toBe(false);
  });

  it("phase1 allows web only", () => {
    expect(assertPhase1Layers(["web"]).ok).toBe(true);
    expect(assertPhase1Layers(["web", "android"]).ok).toBe(false);
  });

  it("reads runtime sha from env", () => {
    expect(readRuntimeGitSha({ VERCEL_GIT_COMMIT_SHA: "abc1234" })).toBe("abc1234");
  });
});
