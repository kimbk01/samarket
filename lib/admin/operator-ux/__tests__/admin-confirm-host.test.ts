import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/dibay-overlay/DibayAppDialogProvider", () => ({
  dibayConfirm: vi.fn(async () => true),
  dibayPrompt: vi.fn(async () => "fallback"),
}));

import { dibayConfirm, dibayPrompt } from "@/components/ui/dibay-overlay/DibayAppDialogProvider";
import { ADMIN_REASON_MIN_LENGTH, confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { registerAdminConfirmHost, type AdminConfirmHostRequest } from "@/lib/admin/operator-ux/admin-confirm-host";

describe("confirmAdminAction — 관리자 셸 확인창(AdminConfirmHost) 하나로 연다", () => {
  let unregister: (() => void) | null = null;
  afterEach(() => {
    unregister?.();
    unregister = null;
    vi.mocked(dibayConfirm).mockClear();
    vi.mocked(dibayPrompt).mockClear();
  });

  function host(answer: { ok: boolean; reason: string }) {
    const seen: AdminConfirmHostRequest[] = [];
    unregister = registerAdminConfirmHost(async (req) => {
      seen.push(req);
      return answer;
    });
    return seen;
  }

  it("L1 = 확인만 (사유 없음)", async () => {
    const seen = host({ ok: true, reason: "" });
    expect(await confirmAdminAction({ level: "L1", ko: true, title: "저장", confirmLabel: "저장" })).toEqual({ ok: true, reason: null });
    expect(seen[0]).toMatchObject({ reasonRequired: false, confirmMatchText: undefined, tone: "primary" });
    expect(dibayConfirm).not.toHaveBeenCalled();
  });

  it("L2 = 사유 필수 (최소 글자 수) 한 화면", async () => {
    const seen = host({ ok: true, reason: " 확인함 " });
    expect(await confirmAdminAction({ level: "L2", ko: true, title: "승인", confirmLabel: "승인" })).toEqual({ ok: true, reason: "확인함" });
    expect(seen[0]).toMatchObject({ reasonRequired: true, reasonMinLength: ADMIN_REASON_MIN_LENGTH });
    expect(dibayPrompt).not.toHaveBeenCalled();
  });

  it("L3 = 사유 + 대상 재입력을 같은 확인창에서, 위험 동작은 danger 톤", async () => {
    const seen = host({ ok: true, reason: "중복 신청" });
    const out = await confirmAdminAction({
      level: "L3",
      ko: true,
      title: "삭제",
      confirmLabel: "삭제",
      destructive: true,
      retypeValue: "ORD-1",
    });
    expect(out).toEqual({ ok: true, reason: "중복 신청" });
    expect(seen[0]).toMatchObject({ reasonRequired: true, confirmMatchText: "ORD-1", tone: "danger" });
  });

  it("취소 = ok false", async () => {
    host({ ok: false, reason: "" });
    expect(await confirmAdminAction({ level: "L2", ko: true, title: "반려", confirmLabel: "반려" })).toEqual({ ok: false });
  });

  it("셸 밖(호스트 없음) = 앱 공용 대화상자로 묻는다", async () => {
    expect(await confirmAdminAction({ level: "L1", ko: true, title: "저장", confirmLabel: "저장" })).toEqual({ ok: true, reason: null });
    expect(dibayConfirm).toHaveBeenCalledTimes(1);
  });
});
