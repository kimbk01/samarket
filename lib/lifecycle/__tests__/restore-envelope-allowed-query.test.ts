/** @vitest-environment jsdom */
/**
 * 재감사(2026-11-10, Owner 승인) — 복원 기록은 허용 쿼리(cm_list)만 함께 저장한다.
 * 메신저 분할 화면 「주문채팅」 목록 범위가 OS 종료 후 복원에서 「대화」로 돌아가던 결함.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  RESTORE_ENVELOPE_KEY,
  buildRestoreEnvelopePath,
  writeRestoreEnvelope,
} from "@/lib/lifecycle/restore-envelope";

beforeEach(() => localStorage.clear());

describe("buildRestoreEnvelopePath", () => {
  it.each([
    ["/community-messenger/rooms/r1?cm_list=delivery", "/community-messenger/rooms/r1?cm_list=delivery"],
    ["/community-messenger/rooms/r1?from=delivery&cm_list=delivery&cm_return=x", "/community-messenger/rooms/r1?cm_list=delivery"],
    ["/community-messenger/rooms/r1?from=push&payment_callback=1", "/community-messenger/rooms/r1"],
    ["/stores?tab=x#frag", "/stores"],
    ["/mypage", "/mypage"],
    ["/community-messenger/rooms/r1?cm_list=", "/community-messenger/rooms/r1"],
  ])("%s → %s", (input, expected) => {
    expect(buildRestoreEnvelopePath(input)).toBe(expected);
  });
});

describe("writeRestoreEnvelope", () => {
  it("cm_list 만 남기고 저장, 1회용 쿼리는 버린다", () => {
    expect(writeRestoreEnvelope("/community-messenger/rooms/r1?cm_list=delivery&push_id=9", "u1")).toBe(true);
    const row = JSON.parse(localStorage.getItem(RESTORE_ENVELOPE_KEY)!);
    expect(row.path).toBe("/community-messenger/rooms/r1?cm_list=delivery");
    expect(row.accountKey).toBe("u1");
  });
});
