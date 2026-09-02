import { describe, expect, it } from "vitest";
import {
  isSupportCasePushPath,
  parseSupportCaseIdFromPushPath,
} from "@/lib/support/support-push-modal-entry";

const CASE_ID = "b17d0642-80fd-4a5e-9c0d-97ccb727876b";

describe("support-push-modal-entry", () => {
  it("parses exact case path", () => {
    expect(parseSupportCaseIdFromPushPath(`/support/cases/${CASE_ID}`)).toBe(CASE_ID);
    expect(parseSupportCaseIdFromPushPath(`/support/cases/${CASE_ID}?x=1`)).toBe(CASE_ID);
    expect(isSupportCasePushPath(`/support/cases/${CASE_ID}`)).toBe(true);
  });

  it("rejects enter / bare / unsafe", () => {
    expect(parseSupportCaseIdFromPushPath("/support/enter")).toBeNull();
    expect(parseSupportCaseIdFromPushPath("/support")).toBeNull();
    expect(parseSupportCaseIdFromPushPath("/support/cases")).toBeNull();
    expect(parseSupportCaseIdFromPushPath("/notifications")).toBeNull();
    expect(isSupportCasePushPath("/support/enter")).toBe(false);
  });
});
