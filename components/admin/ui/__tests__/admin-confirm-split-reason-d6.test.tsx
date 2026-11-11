// @vitest-environment jsdom
/**
 * D-6 (2026-11-04) — 관리자 확인창 사유 두 칸: 「공개 사유(회원·사장님에게 보임 · 120자)」 + 「내부 메모(운영자만)」.
 * 확인창 공용 컴포넌트를 실제로 렌더하고, confirmAdminAction 이 두 값을 돌려주는지 본다.
 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 검사한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/dibay-overlay", () => ({
  DibayDialog: ({ open, title, children }: { open: boolean; title: string; children?: ReactNode }) =>
    open ? (
      <div data-testid="dialog">
        <p>{title}</p>
        {children}
      </div>
    ) : null,
  DibayOverlayButton: ({
    children,
    onClick,
    disabled,
    ...rest
  }: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  } & Record<string, unknown>) => (
    <button type="button" onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/ui/dibay-overlay/DibayAppDialogProvider", () => ({
  dibayConfirm: vi.fn(async () => true),
  dibayPrompt: vi.fn(async () => "대체 경로 사유"),
}));

import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
import { translate } from "@/lib/i18n/messages";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { registerAdminConfirmHost, type AdminConfirmHostRequest } from "@/lib/admin/operator-ux/admin-confirm-host";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

function typeInto(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("AdminActionConfirmDialog — D-6 두 칸", () => {
  it("splitReason 이면 공개 사유(120자 제한) + 내부 메모 두 칸, 확인 시 둘 다 넘긴다", () => {
    const onConfirm = vi.fn();
    root = createRoot(host);
    act(() =>
      root!.render(
        <AdminActionConfirmDialog
          open
          title="정지"
          description=""
          confirmLabel="일시중지"
          cancelLabel="취소"
          reasonRequired
          reasonMinLength={2}
          reasonLabel="공개 사유 (회원·사장님에게 보임 · 120자)"
          splitReason
          onCancel={() => undefined}
          onConfirm={onConfirm}
        />
      )
    );
    const reason = host.querySelector<HTMLTextAreaElement>("[data-admin-action-confirm-reason]")!;
    const memo = host.querySelector<HTMLTextAreaElement>("[data-admin-action-confirm-internal-memo]")!;
    expect(reason).toBeTruthy();
    expect(memo).toBeTruthy();
    expect(host.textContent).toContain("공개 사유");
    /** 문구는 카탈로그 키 — 공급자 없는 렌더는 기본 언어(en). 한국어 문구는 그대로 「내부 메모 …」 */
    expect(host.textContent).toContain(translate("en", "admin_ui_confirm_internal_memo_label"));
    expect(translate("ko", "admin_ui_confirm_internal_memo_label")).toContain("내부 메모");
    expect(reason.maxLength).toBe(120);

    typeInto(reason, "가".repeat(130));
    expect(reason.value).toHaveLength(120);
    expect(host.querySelector("[data-admin-action-confirm-reason-count]")!.textContent).toBe("120/120");
    typeInto(memo, "신고 3건 확인");
    act(() => host.querySelector<HTMLButtonElement>("[data-admin-action-confirm-submit]")!.click());
    expect(onConfirm).toHaveBeenCalledWith("가".repeat(120), "신고 3건 확인");
  });

  it("splitReason 이 없으면 기존 한 칸 그대로 (내부 메모 칸 없음)", () => {
    root = createRoot(host);
    act(() =>
      root!.render(
        <AdminActionConfirmDialog
          open
          title="승인"
          description=""
          confirmLabel="승인"
          cancelLabel="취소"
          reasonRequired
          onCancel={() => undefined}
          onConfirm={() => undefined}
        />
      )
    );
    expect(host.querySelector("[data-admin-action-confirm-internal-memo]")).toBeNull();
  });
});

describe("confirmAdminAction — splitReason", () => {
  let unregister: (() => void) | null = null;
  afterEach(() => {
    unregister?.();
    unregister = null;
  });

  it("호스트에 splitReason 을 넘기고 공개 사유·내부 메모를 따로 돌려준다", async () => {
    const seen: AdminConfirmHostRequest[] = [];
    unregister = registerAdminConfirmHost(async (req) => {
      seen.push(req);
      return { ok: true, reason: " 점검 ", internalMemo: " 내부용 " };
    });
    const out = await confirmAdminAction({ level: "L2", ko: true, title: "정지", confirmLabel: "일시중지", splitReason: true });
    expect(out).toEqual({ ok: true, reason: "점검", internalMemo: "내부용" });
    expect(seen[0]).toMatchObject({ splitReason: true, reasonRequired: true });
    expect(seen[0]!.reasonLabel).toContain("공개 사유");
  });

  it("splitReason 없이 부르면 결과 모양이 예전 그대로", async () => {
    unregister = registerAdminConfirmHost(async () => ({ ok: true, reason: "확인함" }));
    expect(await confirmAdminAction({ level: "L2", ko: true, title: "승인", confirmLabel: "승인" })).toEqual({
      ok: true,
      reason: "확인함",
    });
  });
});
