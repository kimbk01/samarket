import { describe, expect, it, vi } from "vitest";
import {
  createCallV4LinkQualityEvaluator,
  readCallV4AgoraLinkStats,
} from "@/lib/community-messenger/call-v4/call-v4-network-quality";

describe("V-8 — 웹 통화 품질 경고 히스테리시스", () => {
  it("품질 0(측정 전)은 무시 — 표시도 해제도 하지 않는다", () => {
    const ev = createCallV4LinkQualityEvaluator();
    expect(ev.push({ quality: 0 })).toBe(false);
    ev.push({ quality: 5 });
    expect(ev.push({ quality: 5 })).toBe(true);
    for (let i = 0; i < 5; i += 1) expect(ev.push({ quality: 0 })).toBe(true);
  });

  it("나쁨(4·5) 2회 연속이면 표시, 1회는 표시 안 함", () => {
    const ev = createCallV4LinkQualityEvaluator();
    expect(ev.push({ quality: 4 })).toBe(false);
    expect(ev.push({ quality: 2 })).toBe(false);
    expect(ev.push({ quality: 4 })).toBe(false);
    expect(ev.push({ quality: 5 })).toBe(true);
  });

  it("손실 > 15% 또는 RTT > 600ms 도 나쁨으로 센다", () => {
    const ev = createCallV4LinkQualityEvaluator();
    ev.push({ quality: 1, lossPct: 16 });
    expect(ev.push({ quality: 2, rttMs: 601 })).toBe(true);
    const ev2 = createCallV4LinkQualityEvaluator();
    ev2.push({ quality: 1, lossPct: 15, rttMs: 600 });
    expect(ev2.push({ quality: 1, lossPct: 15, rttMs: 600 })).toBe(false);
  });

  it("좋음(≤3) 3회 연속이어야 해제 — 중간에 나쁨이 끼면 다시 센다", () => {
    const ev = createCallV4LinkQualityEvaluator();
    ev.push({ quality: 4 });
    ev.push({ quality: 4 });
    expect(ev.push({ quality: 3 })).toBe(true);
    expect(ev.push({ quality: 2 })).toBe(true);
    expect(ev.push({ quality: 4 })).toBe(true);
    expect(ev.push({ quality: 1 })).toBe(true);
    expect(ev.push({ quality: 1 })).toBe(true);
    expect(ev.push({ quality: 1 })).toBe(false);
  });

  it("품질 6(끊김) 또는 재연결 중이면 즉시 표시", () => {
    expect(createCallV4LinkQualityEvaluator().push({ quality: 6 })).toBe(true);
    expect(createCallV4LinkQualityEvaluator().push({ quality: 0, reconnecting: true })).toBe(true);
  });

  it("Agora 통계에서 RTT·최대 손실률을 읽고, 없거나 예외면 null", () => {
    expect(
      readCallV4AgoraLinkStats({
        getRTCStats: () => ({ RTT: 320 }),
        getRemoteAudioStats: () => ({ a: { packetLossRate: 3 } }),
        getRemoteVideoStats: () => ({ a: { packetLossRate: 22 } }),
      }),
    ).toEqual({ rttMs: 320, lossPct: 22 });
    expect(
      readCallV4AgoraLinkStats({
        getRTCStats: vi.fn(() => {
          throw new Error("x");
        }),
      }),
    ).toEqual({ rttMs: null, lossPct: null });
  });
});
