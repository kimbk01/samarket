import { beforeEach, describe, expect, it, vi } from "vitest";

const prompts: Array<Record<string, unknown>> = [];
const answers: Array<string | null> = [];

vi.mock("@/components/ui/dibay-overlay/DibayAppDialogProvider", () => ({
  dibayConfirm: vi.fn(async () => true),
  dibayPrompt: vi.fn(async (req: Record<string, unknown>) => {
    prompts.push(req);
    return answers.shift() ?? null;
  }),
}));

import { ADMIN_REASON_MIN_LENGTH, confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";

describe("confirmAdminAction — 사유·재입력 규칙을 대화상자에서 막는다", () => {
  beforeEach(() => {
    prompts.length = 0;
    answers.length = 0;
  });

  it("L2: 사유 입력창에 최소 글자 수와 안내가 전달된다", async () => {
    answers.push("확인 완료");
    const out = await confirmAdminAction({ level: "L2", ko: true, title: "승인", confirmLabel: "승인" });
    expect(out).toEqual({ ok: true, reason: "확인 완료" });
    expect(prompts[0]).toMatchObject({ required: true, minLength: ADMIN_REASON_MIN_LENGTH });
    expect(String(prompts[0]?.invalidHint)).toContain(String(ADMIN_REASON_MIN_LENGTH));
  });

  it("L3: 재입력 창은 대상 값과 일치해야만 확인된다", async () => {
    answers.push("사유 입력", "ORD-12");
    const out = await confirmAdminAction({
      level: "L3",
      ko: true,
      title: "강제 취소",
      confirmLabel: "취소 처리",
      destructive: true,
      retypeValue: "ORD-12",
    });
    expect(out).toEqual({ ok: true, reason: "사유 입력" });
    expect(prompts[1]).toMatchObject({ mustEqual: "ORD-12", required: true });
    expect(prompts[1]?.invalidHint).toBeTruthy();
  });
});
