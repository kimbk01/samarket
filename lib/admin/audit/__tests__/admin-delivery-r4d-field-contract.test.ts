import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adminDeliveryR4DMessages } from "@/lib/i18n/catalog/admin-delivery-r4-field-monitoring";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const CONSOLE = "components/admin/ops-console/AdminOpsConsolePage.tsx";
const STATS = "components/admin/delivery-operations/DeliveryOperationsDashboardPage.tsx";
const RIDERS = "components/admin/delivery-riders/AdminDeliveryRidersPage.tsx";
const ALERTS = "components/admin/delivery-alerts/AdminDeliveryAlertsPage.tsx";
const AUTO = "components/admin/delivery-alerts/AdminDeliveryAutoActionsPage.tsx";

describe("R4-D 배달 현장 — DUP-2 화면 역할 분리", () => {
  it("상황판: 자동 조치 승인/거절/재실행·경고 처리 API 를 직접 부르지 않고 링크만 둔다", () => {
    const src = read(CONSOLE);
    expect(src).not.toMatch(/delivery-auto-actions\/\$\{[^}]+\}\/\$\{/);
    expect(src).not.toContain("/approve");
    expect(src).not.toContain("delivery-operation-alerts/events/");
    expect(src).toContain('href="/admin/delivery-auto-actions"');
    expect(src).toContain("admin_r4d_console_alert_link");
    expect(src).not.toContain('"bulk_retry_failed_auto_actions"');
  });

  it("통계: 읽기 전용 — 복구 실행 없음, 상황판으로 연결", () => {
    const src = read(STATS);
    expect(src).not.toContain("/api/admin/delivery-operations/recovery");
    expect(src).not.toContain("confirmAdminAction");
    expect(src).toContain('href="/admin/ops-console"');
  });

  it("자동 조치 일괄 작업은 자동 조치 승인 화면에서 L3", () => {
    const src = read(AUTO);
    expect(src).toContain('"bulk_retry_failed_auto_actions"');
    expect(src).toMatch(/level: "L3"/);
  });
});

describe("DEF-21 메모 누적 · 재배정 기록 분리", () => {
  it("배달 서비스: append_admin_note 는 기존 메모 뒤에 덧붙이고 updated_at CAS", () => {
    const svc = read("lib/stores/store-order-delivery-service.ts");
    expect(svc).toContain("appendAdminNote");
    expect(svc).toContain('updateQ.eq("updated_at", seenUpdatedAt)');
    expect(svc).toContain('error: "rider_changed"');
    expect(svc).toContain('error: "stale_version"');
  });

  it("배달 PATCH: 덮어쓰기 admin_note 를 받지 않고, 재배정은 별도 감사 기록", () => {
    const route = read("app/api/admin/store-orders/[orderId]/delivery/route.ts");
    expect(route).not.toContain("adminNote: body.admin_note");
    expect(route).toContain("store_order.delivery.admin_reassign");
    expect(route).toContain('requireAdminPermission("business")');
    expect(route).toContain('error: "reason_required"');
  });

  it("상황판 재배정: expected_rider_id + append_admin_note + L2 사유", () => {
    const src = read(CONSOLE);
    expect(src).toContain("expected_rider_id: modal.currentRiderId");
    expect(src).toContain("append_admin_note");
    expect(src).not.toMatch(/admin_note: appendAdminNote/);
  });
});

describe("DEF-22 확인 등급", () => {
  it("일괄 복구 = L3 (UI) + 서버 사유 필수", () => {
    expect(read(CONSOLE)).toMatch(/level: "L3",[\s\S]*retypeValue: label/);
    expect(read("app/api/admin/delivery-operations/recovery/route.ts")).toContain('error: "reason_required"');
  });

  it("자동 조치 on/off = L1 + CAS(expected_enabled)", () => {
    const src = read(AUTO);
    expect(src).toMatch(/const toggleKill[\s\S]*?level: "L1"/);
    expect(src).toContain("expected_enabled: killOn");
    expect(read("app/api/admin/delivery-auto-actions/settings/route.ts")).toContain(
      '.eq("delivery_auto_actions_enabled", body.expected_enabled)'
    );
  });
});

describe("DEF-41 명시적 저장 · DEF-40 감사", () => {
  it("배달 경고 화면: 입력 이탈 저장(onBlur) 없음, 규칙 저장은 CAS", () => {
    const src = read(ALERTS);
    expect(src).not.toContain("onBlur");
    expect(src).toContain("patch.expected_updated_at");
    expect(read(RIDERS)).not.toContain("onBlur");
  });

  it("규칙 PATCH: 즉시 실행 전환·활성 변경은 사유 필수 + updated_at CAS + 감사", () => {
    const src = read("app/api/admin/delivery-operation-alerts/rules/[ruleId]/route.ts");
    expect(src).toContain("becomesInstant");
    expect(src).toContain('.eq("updated_at", expectedUpdatedAt)');
    expect(src).toContain("delivery_alert_rule.update");
  });

  it("자동 조치 승인/거절/재실행: business 권한 + 감사, 승인·거절은 사유 필수", () => {
    for (const verb of ["approve", "reject", "retry"]) {
      const src = read(`app/api/admin/delivery-auto-actions/[actionId]/${verb}/route.ts`);
      expect(src, verb).toContain('requireAdminPermission("business")');
      expect(src, verb).toContain(`delivery_auto_action.${verb}`);
    }
    for (const verb of ["approve", "reject"]) {
      expect(read(`app/api/admin/delivery-auto-actions/[actionId]/${verb}/route.ts`)).toContain('"reason_required"');
    }
  });

  it("경고 이벤트 PATCH: business 권한 + 상태 CAS", () => {
    const src = read("app/api/admin/delivery-operation-alerts/events/[eventId]/route.ts");
    expect(src).toContain('requireAdminPermission("business")');
    expect(src).toContain('.eq("event_status", st)');
  });
});

describe("DEF-42 자동 조치 권위 스위치", () => {
  it("러너가 읽는 테이블 = delivery_auto_actions_runtime_settings (platform_runtime_settings 아님)", () => {
    const mig = read("supabase/migrations/20260514150000_delivery_auto_actions_safety.sql");
    expect(mig).toMatch(/run_delivery_operation_alert_auto_actions[\s\S]*from public\.delivery_auto_actions_runtime_settings/);
    expect(read(AUTO)).toContain('data-auto-actions-authority="delivery_auto_actions_runtime_settings"');
  });
});

describe("DEF-43 · DEF-49 · 원시 값 제거", () => {
  it("휴리스틱 % 없음", () => {
    expect(read(AUTO)).not.toContain("stabilityPercent");
    expect(read(STATS)).not.toContain("deliveryOpsStabilityPercent");
    expect(read(RIDERS)).not.toMatch(/휴리스틱\)|stabilityPercent/);
  });

  it("주문 링크 = /admin/stores/orders/{id}", () => {
    for (const f of [CONSOLE, RIDERS, ALERTS]) {
      expect(read(f), f).toContain("/admin/stores/orders/${encodeURIComponent(");
    }
  });

  it("상태 라벨: 실제 배달·경고·자동 조치 상태값이 한국어로", () => {
    expect(adminStatusLabel("rider_delivery", "rider_assigned", true).label).toBe("라이더 배정됨");
    expect(adminStatusLabel("rider_delivery", "delivery_failed", true).label).toBe("배달 실패");
    expect(adminStatusLabel("alert_event", "acknowledged", true).label).toBe("확인함");
    expect(adminStatusLabel("alert_severity", "critical", true).label).toBe("긴급");
    expect(adminStatusLabel("auto_action", "pending_approval", true).label).toBe("승인 대기");
    expect(adminStatusLabel("store_order", "refund_requested", true).label).toBe("환불 요청");
    expect(adminStatusLabel("rider_admin", "paused", true).known).toBe(true);
  });

  it("시간 표시 = 마닐라 (UTC slice 금지)", () => {
    for (const f of [CONSOLE, STATS, RIDERS, AUTO]) {
      expect(read(f), f).not.toMatch(/\.slice\(0, 19\)\.replace\("T", " "\)/);
    }
  });
});

describe("i18n — ko/en 동일 키", () => {
  it("R4-D 카탈로그 키 일치", () => {
    expect(Object.keys(adminDeliveryR4DMessages.ko).sort()).toEqual(Object.keys(adminDeliveryR4DMessages.en).sort());
  });
});
