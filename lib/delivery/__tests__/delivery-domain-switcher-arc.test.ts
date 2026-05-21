import { describe, expect, it } from "vitest";
import {
  DELIVERY_DIAL_CHIP_SIZE_PX,
  DELIVERY_DIAL_SLOT_COUNT,
  DELIVERY_DIAL_SLOT_WIDTH_PX,
  deliveryDialArcStepDeg,
  deliveryDialItemAngleDeg,
  deliveryDialRadiusPx,
  deliveryDialRadiusPxBounded,
  deliveryDialAnimTotalMs,
  deliveryDialSweepStartDeg,
  snapDeliveryDialRotationDeg,
} from "@/lib/delivery/delivery-domain-switcher-arc";

function dialTipOffsetY(index: number, total: number, radiusPx: number): number {
  const deg = deliveryDialItemAngleDeg(index, total);
  const rad = (deg * Math.PI) / 180;
  return -radiusPx * Math.cos(rad);
}

describe("delivery-domain-switcher-arc", () => {
  it("6슬롯 반원 — -90° ~ +90°, 36° 간격", () => {
    expect(deliveryDialItemAngleDeg(0, 6)).toBe(-90);
    expect(deliveryDialItemAngleDeg(5, 6)).toBe(90);
    expect(deliveryDialSweepStartDeg(6)).toBe(-90);
    expect(deliveryDialArcStepDeg(6)).toBe(36);
  });

  it("고정 슬롯 폭 — 인접 호상 간격 ≥ 슬롯 폭", () => {
    const r = deliveryDialRadiusPx(6);
    const step = deliveryDialArcStepDeg(6);
    const chord = 2 * r * Math.sin((step / 2) * (Math.PI / 180));
    expect(chord).toBeGreaterThanOrEqual(DELIVERY_DIAL_SLOT_WIDTH_PX);
  });

  it("반원 — 가운데(배달·메신저)가 양끝보다 위에", () => {
    const r = deliveryDialRadiusPx(6);
    const left = dialTipOffsetY(0, 6, r);
    const mid = dialTipOffsetY(2, 6, r);
    expect(mid).toBeLessThan(left);
  });

  it("6슬롯 고정", () => {
    expect(DELIVERY_DIAL_SLOT_COUNT).toBe(6);
  });

  it("애니 전체 길이 — 440 + 5×88", () => {
    expect(deliveryDialAnimTotalMs(6)).toBe(440 + 5 * 88);
  });

  it("스와이프 스냅 — 36° 단위", () => {
    expect(snapDeliveryDialRotationDeg(20, 6)).toBe(36);
    expect(snapDeliveryDialRotationDeg(-10, 6)).toBeCloseTo(0);
  });

  it("좁은 뷰포트 — 반경이 화면 밖으로 나가지 않게 상한", () => {
    const narrow = 320;
    const r = deliveryDialRadiusPxBounded(narrow, 6);
    const halfSpan = r + DELIVERY_DIAL_SLOT_WIDTH_PX / 2 + 10;
    expect(halfSpan).toBeLessThanOrEqual(narrow / 2 + 1);
    expect(r).toBeLessThanOrEqual(deliveryDialRadiusPx(6));
  });
});
