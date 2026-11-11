/**
 * 주문 단계·용어 4단계 정본 계약 (Owner 2026-11-04 「용어와 프로세스를 정확히 통일」)
 * 설계: docs/audit/store-order-process-terms-unify-design-2026-11-04.md §1(b)(c) · §3
 * (a) 전이 — 배달·픽업 모두 사장님 버튼 4번
 * (b) 단일 원천 — 주문 상태 → 한글 이름 표를 모델 밖에서 만들지 않는다 · 옛 이름 0건
 * (c) 전 화면 대조표 — 같은 상태 = 모든 화면 같은 이름
 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 쓰는 코드를 실행한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import { setRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { allowedOrderTransitions, STORE_ORDER_STATUS_LIST } from "@/lib/stores/order-status-transitions";
import {
  ORDER_STATUS_NAME_KEYS_WITHOUT_FULFILLMENT,
  orderEventMessage,
  orderStageNames,
  orderStagePosition,
  orderStatusName,
  ownerNextAction,
  ownerTransitionConfirmQuestion,
  processFlowStepStates,
  processSteps,
} from "@/lib/stores/store-order-process-model";
import { ownerOpsStatusLabelI18n } from "@/lib/stores/owner-order-ui-labels";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
import { buildStoreOrderChatCardView } from "@/lib/store-order-chat/build-store-order-chat-card-view";
import { buildStoreOrderSummaryTimelineSteps } from "@/lib/store-order-chat/store-order-summary-timeline";
import { messengerDeliveryProgressSteps } from "@/lib/store-order-chat/messenger-delivery-progress";
import { resolveInboxOrderStatusChip } from "@/lib/notifications/inbox-order-status-label";
import { memberOrderStatusUserMessage } from "@/lib/member-orders/member-order-labels";
import { hubStoreOrderStatusLabel } from "@/lib/mypage/mypage-hub-i18n";
import { ADMIN_STORE_ORDER_STATUS_LABEL_KEYS } from "@/lib/admin/store-orders/admin-store-order-status-labels";
import { adminStatusLabelText } from "@/lib/admin/status-labels/admin-status-label-registry";
import { DELIVERY_STORE_ORDER_STATUS_NAMESPACE } from "@/lib/admin/status-labels/r5-delivery-status-labels";
import { OWNER_ORDER_TAB_LABEL_KEYS } from "@/lib/business/owner-mobile-orders-tab";
import { ownerOrderCardStepColumnLabel } from "@/lib/business/owner-order-stepper-transition";
import type { MemberOrderStatus } from "@/lib/member-orders/types";

const ROOT = process.cwd();
const FULFILLMENTS = ["local_delivery", "pickup"] as const;

beforeAll(() => setRuntimeAppLanguage("ko"));

/** §3-1 정본 (한국어) */
const CANON: Record<(typeof FULFILLMENTS)[number], Record<string, string>> = {
  local_delivery: {
    pending: "접수 대기",
    accepted: "주문접수",
    preparing: "조리중",
    ready_for_pickup: "조리중",
    delivering: "배달중",
    arrived: "배달중",
    completed: "배달완료",
    cancel_requested: "취소 요청",
    cancelled: "주문 취소",
    refund_requested: "환불 요청",
    refunded: "환불 완료",
  },
  pickup: {
    pending: "접수 대기",
    accepted: "주문접수",
    preparing: "조리중",
    ready_for_pickup: "픽업대기",
    delivering: "배달중",
    arrived: "배달중",
    completed: "픽업완료",
    cancel_requested: "취소 요청",
    cancelled: "주문 취소",
    refund_requested: "환불 요청",
    refunded: "환불 완료",
  },
};

describe("(a) 사장님 버튼 4번 — 배달·픽업", () => {
  function walk(fulfillment: string): string[] {
    const labels: string[] = [];
    let status = "pending";
    for (let i = 0; i < 10 && status !== "completed"; i += 1) {
      const next = ownerNextAction(status, fulfillment, "ko");
      if (!next) break;
      labels.push(next.label);
      status = next.status;
    }
    return labels;
  }
  it("배달: 주문 접수 → 조리 시작 → 배달 출발 → 배달 완료", () => {
    expect(walk("local_delivery")).toEqual(["주문 접수", "조리 시작", "배달 출발", "배달 완료"]);
  });
  it("픽업: 주문 접수 → 조리 시작 → 준비 완료 → 픽업 완료", () => {
    expect(walk("pickup")).toEqual(["주문 접수", "조리 시작", "준비 완료", "픽업 완료"]);
  });
  it("배달 preparing 다음은 delivering (포장 완료 단계 없음) · 예전 ready_for_pickup·arrived 도 이어서 진행", () => {
    expect(allowedOrderTransitions("preparing", "local_delivery")).toEqual(["delivering"]);
    expect(allowedOrderTransitions("ready_for_pickup", "local_delivery")).toEqual(["delivering"]);
    expect(allowedOrderTransitions("delivering", "local_delivery")).toEqual(["completed"]);
    expect(allowedOrderTransitions("arrived", "local_delivery")).toEqual(["completed"]);
  });
  it("확인창 질문", () => {
    expect(ownerTransitionConfirmQuestion("preparing", "local_delivery", "x", "ko")).toBe("조리를 시작할까요?");
    expect(ownerTransitionConfirmQuestion("delivering", "local_delivery", "x", "ko")).toBe("배달을 출발할까요?");
    expect(ownerTransitionConfirmQuestion("completed", "local_delivery", "x", "ko")).toBe("배달 완료로 바꿀까요?");
    expect(ownerTransitionConfirmQuestion("completed", "pickup", "x", "ko")).toBe("픽업 완료로 바꿀까요?");
  });
});

describe("(c) 전 화면 대조표 — 같은 상태 = 같은 이름", () => {
  it("4칸 이름 · 칸 상태", () => {
    expect(orderStageNames("local_delivery", "ko")).toEqual(["주문접수", "조리중", "배달중", "배달완료"]);
    expect(orderStageNames("pickup", "ko")).toEqual(["주문접수", "조리중", "픽업대기", "픽업완료"]);
    expect(processSteps("local_delivery")).toHaveLength(4);
    expect(processFlowStepStates("local_delivery", "preparing")).toEqual(["done", "current", "upcoming", "upcoming"]);
    expect(processFlowStepStates("local_delivery", "completed")).toEqual(["done", "done", "done", "done"]);
    expect(processFlowStepStates("local_delivery", "pending")).toEqual(["upcoming", "upcoming", "upcoming", "upcoming"]);
  });

  for (const f of FULFILLMENTS) {
    for (const status of STORE_ORDER_STATUS_LIST) {
      it(`${f} · ${status} → ${CANON[f][status]}`, () => {
        const want = CANON[f][status];
        expect(orderStatusName(status, f, "ko")).toBe(want);
        // 사장님 배지
        expect(ownerOpsStatusLabelI18n("ko", status, f)).toBe(want);
        // 손님 화면·채팅 위·채팅 시트
        expect(buyerOrderStatusLabel(status, "ko", f)).toBe(want);
        // 채팅 요약 카드
        expect(buildStoreOrderChatCardView({ order: { order_status: status, fulfillment_type: f } }).statusLabel).toBe(want);
        // 알림함 칩
        expect(resolveInboxOrderStatusChip(status, "ko", { fulfillment_type: f })).toBe(want);
        // 내 주문
        expect(memberOrderStatusUserMessage(status as MemberOrderStatus, "ko", f)).toBe(want);
        expect(hubStoreOrderStatusLabel(status, () => "", f)).toBe(want);
      });
    }
  }

  it("요약 카드 4칸 이름 = 채팅 위 진행 표시 = 사장님 카드 칸 이름", () => {
    for (const f of FULFILLMENTS) {
      const names = orderStageNames(f, "ko");
      expect(
        buildStoreOrderSummaryTimelineSteps({ fulfillmentType: f, orderStatus: "accepted", lang: "ko" }).map((s) => s.label)
      ).toEqual(names);
      expect([...messengerDeliveryProgressSteps(f, "ko")]).toEqual(names);
      expect([0, 1, 2, 3].map((i) => ownerOrderCardStepColumnLabel(i, "accepted", f, 1, "ko"))).toEqual(names);
    }
  });

  it("관리자 — 주문 방식 없이 쓰는 이름도 정본 키 (완료 = 「완료」)", () => {
    for (const status of STORE_ORDER_STATUS_LIST) {
      const key = ADMIN_STORE_ORDER_STATUS_LABEL_KEYS[status];
      expect(key).toBe(ORDER_STATUS_NAME_KEYS_WITHOUT_FULFILLMENT[status]);
      expect(adminStatusLabelText(DELIVERY_STORE_ORDER_STATUS_NAMESPACE, status, true)).toBe(translate("ko", key));
    }
  });

  it("거절 = 「주문 거절」 (모든 화면)", () => {
    expect(orderStatusName("cancelled", "local_delivery", "ko", "rejected")).toBe("주문 거절");
    expect(buyerOrderStatusLabel("cancelled", "ko", "local_delivery", "rejected")).toBe("주문 거절");
    expect(ownerOpsStatusLabelI18n("ko", "cancelled", "pickup", "rejected")).toBe("주문 거절");
    expect(resolveInboxOrderStatusChip("cancelled", "ko", { cancel_kind: "rejected" })).toBe("주문 거절");
  });

  it("사장님 탭 이름", () => {
    expect(Object.values(OWNER_ORDER_TAB_LABEL_KEYS).map((k) => translate("ko", k))).toEqual([
      "전체",
      "접수 대기",
      "주문접수",
      "조리중",
      "배달중·픽업대기",
      "완료",
      "취소·환불",
      "환불 요청",
    ]);
  });

  it("사건 문장 — 말투 「~했어요/되었어요」 하나 · 거절·취소 사유", () => {
    const t = (s: string, f: string, o?: Parameters<typeof orderEventMessage>[2]) => {
      const m = orderEventMessage(s, f, o);
      return m ? translate("ko", m.key, m.params) : null;
    };
    expect(t("accepted", "local_delivery", { prepMinutes: 25 })).toBe("매장이 주문을 접수했어요. 예상 조리 시간 약 25분");
    expect(t("preparing", "local_delivery")).toBe("조리를 시작했어요.");
    expect(t("delivering", "local_delivery")).toBe("배달을 출발했어요.");
    expect(t("completed", "local_delivery")).toBe("배달이 완료되었어요.");
    expect(t("ready_for_pickup", "pickup")).toBe("준비가 끝났어요. 매장에서 픽업해 주세요.");
    expect(t("completed", "pickup")).toBe("픽업이 완료되었어요.");
    expect(t("cancelled", "local_delivery", { cancelKind: "rejected", reason: "재료 소진" })).toBe(
      "매장이 주문을 거절했어요. 사유: 재료 소진"
    );
    expect(t("cancelled", "local_delivery", { cancelKind: "store", reason: "기사 없음" })).toBe(
      "매장이 주문을 취소했어요. 사유: 기사 없음"
    );
    expect(t("ready_for_pickup", "local_delivery")).toBeNull();
    expect(t("arrived", "local_delivery")).toBeNull();
  });

  it("단계 위치 — 예전 배달 ready_for_pickup = 조리중 · arrived = 배달중", () => {
    expect(orderStagePosition("ready_for_pickup", "local_delivery")).toBe(2);
    expect(orderStagePosition("arrived", "local_delivery")).toBe(3);
    expect(orderStagePosition("ready_for_pickup", "pickup")).toBe(3);
  });
});

describe("(b) 단일 원천 · 옛 이름 0건", () => {
  const SCAN_DIRS = ["app", "components", "lib"];
  const ALLOWED = new Set([
    "lib/stores/store-order-process-model.ts",
    // 배달 기사 배정 행(`store_order_deliveries.delivery_status`) 이름표 — 주문 상태가 아님
    "components/admin/delivery-orders/AdminStoreOrderHistoryPanel.tsx",
    "lib/admin/status-labels/delivery-status-labels.ts",
  ]);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(path.join(ROOT, dir))) {
      const rel = path.join(dir, name);
      const st = statSync(path.join(ROOT, rel));
      if (st.isDirectory()) {
        if (name === "node_modules" || name === "__tests__" || rel.startsWith(path.join("lib", "i18n", "catalog"))) continue;
        walk(rel);
      } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
        files.push(rel);
      }
    }
  };
  beforeAll(() => {
    for (const d of SCAN_DIRS) walk(d);
  });

  it("주문 상태 키(ready_for_pickup 등)에 한글 이름을 직접 적은 표가 없다", () => {
    const offenders: string[] = [];
    const mapEntry = /\b(ready_for_pickup|preparing|delivering|arrived)\s*:\s*(\{\s*ko\s*:\s*)?["'`][^"'`\n]*[가-힣]/;
    for (const rel of files) {
      if (ALLOWED.has(rel)) continue;
      const src = readFileSync(path.join(ROOT, rel), "utf8");
      if (mapEntry.test(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("옛 주문 상태 이름을 코드 문자열로 쓰지 않는다", () => {
    const OLD = [
      "포장완료",
      "배송중",
      "배송지도착",
      "상품준비",
      "주문확인",
      "접수확인",
      "준비(조리)중",
      "신규주문",
      "배달준비",
      "주소근처",
      "수령완료",
      "배달 출발 준비",
      "배달지 근처",
    ];
    const offenders: string[] = [];
    for (const rel of files) {
      const src = readFileSync(path.join(ROOT, rel), "utf8");
      for (const w of OLD) {
        if (new RegExp(`["'\`]${w.replace(/[()]/g, "\\$&")}["'\`]`).test(src)) offenders.push(`${rel}: ${w}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("주문 단계 문구 카탈로그에 옛 이름 0건", () => {
    const catalogDir = path.join(ROOT, "lib/i18n/catalog");
    const OLD_VALUES =
      /:\s*"(신규|신규주문|주문확인|접수확인|접수됨|상품준비|준비\(조리\)중|포장완료|포장 완료|배달 준비|배달준비|배달 출발 준비|픽업준비|픽업 준비|배송중|배송 중|배달출발|배송지도착|배달지 근처|주소근처|수령완료|취소됨|환불됨)"/;
    const ORDER_KEY =
      /^\s+(order_|store_owner_(status|ops|step|transition|mobile_tab|mobile_kpi|dash_flow)|mypage_comp_order_status|member_order_status|admin_stores_orders_status|notif_order_status|store_messenger_progress|store_delivery_ops|popup_btn_step|popup_q_step)[a-z_]*:/;
    const offenders: string[] = [];
    for (const name of readdirSync(catalogDir)) {
      const lines = readFileSync(path.join(catalogDir, name), "utf8").split("\n");
      for (const line of lines) {
        if (ORDER_KEY.test(line) && OLD_VALUES.test(line)) offenders.push(`${name}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
