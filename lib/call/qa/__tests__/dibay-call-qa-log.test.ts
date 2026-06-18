import { beforeEach, describe, expect, it } from "vitest";
import {
  appendDibayCallQaLog,
  clearDibayCallQaLogs,
  exportDibayCallQaLogsText,
  getDibayCallQaLogs,
} from "@/lib/call/qa/dibay-call-qa-log";

describe("dibay-call-qa-log", () => {
  beforeEach(() => {
    clearDibayCallQaLogs();
  });

  it("stores entries and exports text", () => {
    appendDibayCallQaLog({ step: "active_call_connected", callId: "c1", mediaType: "voice" });
    appendDibayCallQaLog({ step: "heartbeat_patch_ok", callId: "c1" });
    expect(getDibayCallQaLogs()).toHaveLength(2);
    const text = exportDibayCallQaLogsText();
    expect(text).toContain("active_call_connected");
    expect(text).toContain("heartbeat_patch_ok");
    expect(text).toContain("callId=c1");
  });
});
