/**
 * 언어 SSOT B3 — 저장된 시스템 문장을 보는 사람 언어로 다시 그린다(`docs/audit/i18n-b3-stored-preview-design-2026-11-08.md`).
 * 코드가 저장 글자와 맞을 때만 코드로, 아니면 저장 글자 그대로.
 */
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  cmRoomLastMessageMetaFromMessage,
  cmSystemFirstLine,
  parseCmRoomLastMessageMeta,
  resolveCmSystemListPreview,
  resolveCmSystemMessageText,
} from "@/lib/community-messenger/system-message-i18n";
import { resolveStoreOrderOpsBodyText } from "@/lib/store-order-chat/store-order-ops-i18n";
import { describeManagementEvent } from "@/lib/community-messenger/room/describe-management-event";
import { listPreviewFromMessengerMessageRow } from "@/lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message";

const en = (key: MessageKey, vars?: Record<string, string | number>) => translate("en", key, vars);
const ko = (key: MessageKey, vars?: Record<string, string | number>) => translate("ko", key, vars);

describe("B3 system-message-i18n", () => {
  it("첫 줄 규칙 = DB 함수와 같음(\\r 제거·첫 줄·앞뒤 공백)", () => {
    expect(cmSystemFirstLine("📋 주문 요약\r\n매장: A")).toBe("📋 주문 요약");
    expect(cmSystemFirstLine("  배달이 완료되었습니다.  ")).toBe("배달이 완료되었습니다.");
  });

  it("주문 사건 → 대화방 줄과 같은 함수(저장 키가 카탈로그에서 정리돼도 주문 상태로 정본 문장)", () => {
    /** 운영 실제 모양: 11-04 정본 통일로 카탈로그에서 정리된 옛 키 + 주문 상태 값 */
    const metadata = {
      domain: "store_order",
      lineKind: "delivery",
      orderStatus: "completed",
      orderFlow: "delivery",
      deliveryStatus: "delivered",
      message_key: "store_delivery_ops_body_completed_delivery",
    };
    const lastMessage = "배달이 완료되었습니다.";
    const meta = cmRoomLastMessageMetaFromMessage(lastMessage, metadata);
    const timelineEn = resolveStoreOrderOpsBodyText({
      orderStatus: "completed",
      lineKind: "delivery",
      content: lastMessage,
      metadata,
      t: en,
    });
    const out = resolveCmSystemListPreview({ lastMessage, meta }, en);
    expect(out).toBe(cmSystemFirstLine(timelineEn));
    expect(out).not.toMatch(/[가-힣]/);
    const outKo = resolveCmSystemListPreview({ lastMessage, meta }, ko);
    expect(outKo).toMatch(/[가-힣]/);
  });

  it("주문 요약 kind → 「Order summary」, 상품 상태 → 대화방과 같은 키", () => {
    expect(
      resolveCmSystemListPreview(
        { lastMessage: "📋 주문 요약\n매장: A", meta: { text: "📋 주문 요약", kind: "store_order_summary" } },
        en
      )
    ).toBe("📋 Order summary");
    const listing = resolveCmSystemListPreview(
      {
        lastMessage: "제품의 상태가 예약중으로 변경되었습니다.",
        meta: { text: "제품의 상태가 예약중으로 변경되었습니다.", kind: "listing_change", listingState: "reserved" },
      },
      en
    );
    expect(listing).toBe(`${en("trade_listing_change_system_title")} · ${en("trade_listing_step_reserved")}`);
  });

  it("메타 글자가 저장 글자와 다르면 코드로 그리지 않는다(다른 메시지의 코드)", () => {
    expect(
      resolveCmSystemListPreview(
        { lastMessage: "📋 주문 요약\n매장: A", meta: { text: "배달이 완료되었습니다.", message_key: "store_delivery_ops_body_completed_delivery" } },
        en
      )
    ).toBeNull();
    expect(resolveCmSystemListPreview({ lastMessage: "그룹이 만들어졌습니다", meta: null }, en)).toBeNull();
  });

  it("카탈로그에 없는 키·잘못된 모양은 저장 글자", () => {
    expect(
      resolveCmSystemMessageText({ content: "원문", metadata: { message_key: "zz_not_a_real_key_x" } }, en)
    ).toBe("원문");
    expect(parseCmRoomLastMessageMeta({ message_key: "x" })).toBeNull();
    expect(parseCmRoomLastMessageMeta([1])).toBeNull();
  });

  it("그룹 관리 키 → 대화방 줄·관리 기록이 보는 사람 언어", () => {
    const metadata = { domain: "group_mgmt", message_key: "cm_svc_mgmt_member_kick_named", message_vars: { name: "Ana" } };
    expect(resolveCmSystemMessageText({ content: "Ana 님을 내보냈습니다", metadata }, en)).toBe(
      en("cm_svc_mgmt_member_kick_named", { name: "Ana" })
    );
    const ev = describeManagementEvent("Member removed", { message_key: "cm_svc_mgmt_notice_edit", message_vars: { text: "hi" } });
    expect(ev.detail).toBe("hi");
  });

  it("실시간 메시지 행 → 시스템이면 메타, 아니면 null(지난 메타 지움)", () => {
    const sys = listPreviewFromMessengerMessageRow({
      content: "배달이 완료되었습니다.",
      message_type: "system",
      created_at: "2026-11-08T12:00:00Z",
      metadata: { message_key: "store_delivery_ops_body_completed_delivery" },
    });
    expect(sys?.lastMessageMeta).toEqual(
      cmRoomLastMessageMetaFromMessage("배달이 완료되었습니다.", { message_key: "store_delivery_ops_body_completed_delivery" })
    );
    const text = listPreviewFromMessengerMessageRow({
      content: "hello",
      message_type: "text",
      created_at: "2026-11-08T12:00:01Z",
    });
    expect(text?.lastMessageMeta).toBeNull();
  });
});

describe("B3 픽업 완료 줄 (L24 수정 후)", () => {
  it("픽업 주문의 delivery 완료 줄 → 픽업 문장(배달 문장 아님)", () => {
    const lastMessage = "주문이 완료되었습니다. 픽업해 주세요.";
    const meta = cmRoomLastMessageMetaFromMessage(lastMessage, {
      domain: "store_order",
      lineKind: "delivery",
      orderFlow: "pickup",
      orderStatus: "completed",
    });
    const out = resolveCmSystemListPreview({ lastMessage, meta }, en) ?? "";
    expect(out).not.toMatch(/deliver/i);
    expect(out).not.toMatch(/[가-힣]/);
    expect(resolveCmSystemListPreview({ lastMessage, meta }, ko) ?? "").not.toContain("배달");
  });
});
