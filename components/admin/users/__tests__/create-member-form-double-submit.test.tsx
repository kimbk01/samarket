// @vitest-environment jsdom
/**
 * 등록 후속 감사 B14 — 회원 생성 폼을 실제로 그려 같은 순간 두 번 제출해도 요청은 1번만 나간다.
 * (state `submitting` 은 다음 렌더에야 바뀌므로 ref 로 막는다.) 오류 문구는 대화상자 한 곳에만 보인다.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/AppLanguageProvider", () => {
  const value = { language: "ko", t: (k: string) => `T:${k}` };
  return { useI18n: () => value };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/admin/users/AdminManualMemberAddressBlock", () => ({
  AdminManualMemberAddressBlock: () => null,
}));
vi.mock("@/components/admin/users/MemberAdminDialog", () => ({
  MemberAdminDialog: ({ children, errorText }: { children: ReactNode; errorText?: string | null }) => (
    <div>
      {errorText ? <p data-dialog-error="1">{errorText}</p> : null}
      {children}
    </div>
  ),
}));
/** 입력 검사는 통과시킨다 — 이 시험은 제출 중복만 본다 */
vi.mock("@/lib/admin-users/admin-create-member-fields", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-users/admin-create-member-fields")>();
  return { ...actual, validateAdminCreateMemberForm: () => ({}) };
});

import { CreateMemberForm } from "@/components/admin/users/CreateMemberForm";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let resolveFetch: (r: Response) => void;
const fetchMock = vi.fn();

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  container.remove();
});

describe("CreateMemberForm 이중 제출", () => {
  it("같은 순간 두 번 제출 → fetch 1번 · 비밀번호 거절은 errorKey 로 번역 · 오류는 한 곳에만", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<CreateMemberForm onClose={() => undefined} onSuccess={() => undefined} />);
    });
    const form = container.querySelector("#member-create-form") as HTMLFormElement;
    expect(form).not.toBeNull();
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch(
        new Response(
          JSON.stringify({
            ok: false,
            field: "password",
            error: "password_weak",
            errorKey: "admin_users_err_password_weak_pwned",
            message: "서버 한국어 문장",
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
      );
    });
    const shown = Array.from(container.querySelectorAll("[role=alert], [data-dialog-error]")).map((n) => n.textContent);
    expect(shown).not.toContain("서버 한국어 문장");
    expect(container.querySelector("[data-dialog-error]")?.textContent).toBe("T:admin_users_err_password_weak_pwned");
    /** 같은 문구가 폼 안에 한 번 더 나오지 않는다 (칸 아래 오류는 별도) */
    const formLevel = Array.from(container.querySelectorAll("p.sam-text-body-secondary.text-sam-danger"));
    expect(formLevel).toHaveLength(0);

    /** 응답이 끝나면 다시 제출할 수 있다 */
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      root.unmount();
    });
  });
});
