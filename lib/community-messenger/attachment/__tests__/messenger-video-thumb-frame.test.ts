import { describe, expect, it } from "vitest";
import {
  MESSENGER_VIDEO_THUMB_MIN_LUMA,
  messengerVideoAverageLuma,
  messengerVideoThumbCandidateTimes,
  pickMessengerVideoThumbTime,
} from "@/lib/community-messenger/attachment/messenger-video-web";

describe("영상 미리보기 장면 고르기 (설계 2026-11-25 §4-1)", () => {
  it("후보 시점: 0.1초 → 1초 → 길이 10% → 길이 50%", () => {
    expect(messengerVideoThumbCandidateTimes(72)).toEqual([0.1, 1, 7.2, 36]);
  });

  it("짧은 영상: 길이를 넘는 시점·겹치는 시점은 뺀다", () => {
    const r = (xs: number[]) => xs.map((x) => Math.round(x * 1000) / 1000);
    expect(r(messengerVideoThumbCandidateTimes(0.8))).toEqual([0.008, 0.08, 0.4]);
    expect(r(messengerVideoThumbCandidateTimes(2))).toEqual([0.02, 1, 0.2]);
  });

  it("길이를 모르면 0초 한 장", () => {
    expect(messengerVideoThumbCandidateTimes(NaN)).toEqual([0]);
    expect(messengerVideoThumbCandidateTimes(0)).toEqual([0]);
  });

  it("평균 밝기: 검정 0 · 흰색 255", () => {
    expect(messengerVideoAverageLuma([0, 0, 0, 255, 0, 0, 0, 255])).toBe(0);
    expect(messengerVideoAverageLuma([255, 255, 255, 255])).toBeCloseTo(255);
    expect(messengerVideoAverageLuma([])).toBe(0);
  });

  it("검은 시작 영상: 어둡지 않은 첫 장면을 고르고 그 뒤는 보지 않는다", async () => {
    const seen: number[] = [];
    const luma: Record<number, number> = { 0.1: 2, 1: 5, 7.2: 120, 36: 200 };
    const t = await pickMessengerVideoThumbTime(72, async (x) => {
      seen.push(x);
      return luma[x];
    });
    expect(t).toBe(7.2);
    expect(seen).toEqual([0.1, 1, 7.2]);
  });

  it("첫 장면이 밝으면 한 장만 본다", async () => {
    const seen: number[] = [];
    const t = await pickMessengerVideoThumbTime(72, async (x) => {
      seen.push(x);
      return MESSENGER_VIDEO_THUMB_MIN_LUMA;
    });
    expect(t).toBe(0.1);
    expect(seen).toEqual([0.1]);
  });

  it("모두 어두우면 가장 밝은 장면", async () => {
    const luma: Record<number, number> = { 0.1: 1, 1: 9, 7.2: 3, 36: 4 };
    expect(await pickMessengerVideoThumbTime(72, async (x) => luma[x])).toBe(1);
  });

  it("한 장도 못 재면 null", async () => {
    expect(await pickMessengerVideoThumbTime(72, async () => null)).toBeNull();
  });
});
