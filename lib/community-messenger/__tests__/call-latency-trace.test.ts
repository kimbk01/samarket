import { describe, expect, it, vi } from "vitest";
import {
  logCallLatencyCallScreenPainted,
  logCallLatencyDialClick,
  logCallLatencyRouteReplace,
  logCallMediaOutgoingVideoGumDeferred,
} from "@/lib/community-messenger/call-latency-trace";

describe("call-latency-trace", () => {
  it("emits P1-1 latency markers with sinceClick after dial_click", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    logCallLatencyDialClick({ callKind: "voice" });
    logCallLatencyRouteReplace({ sessionId: "tmp_1" });
    logCallLatencyCallScreenPainted({ sessionId: "tmp_1" });
    logCallMediaOutgoingVideoGumDeferred({ phase: "outgoing_dial" });

    expect(infoSpy).toHaveBeenCalledWith("[call-latency] dial_click", expect.any(Object));
    expect(infoSpy).toHaveBeenCalledWith("[call-latency] route_replace", expect.any(Object));
    expect(infoSpy).toHaveBeenCalledWith("[call-latency] call_screen_painted", expect.any(Object));
    expect(infoSpy).toHaveBeenCalledWith("[call-media] outgoing_video_gum_deferred", expect.any(Object));

    const routePayload = infoSpy.mock.calls.find((c) => c[0] === "[call-latency] route_replace")?.[1] as {
      sinceClick?: number;
    };
    expect(typeof routePayload.sinceClick).toBe("number");

    infoSpy.mockRestore();
  });
});
