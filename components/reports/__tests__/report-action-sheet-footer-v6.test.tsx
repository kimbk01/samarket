// @vitest-environment jsdom
/**
 * 실기 v6 FAIL 5 (Owner 「설계안대로 진행」 2026-11-07 · docs/audit/ads-v6-device-fail-design-2026-11-07.md):
 * 신고 시트가 최대 높이(min(82dvh,560px))보다 길면 본문이 스크롤된다. 그때 「취소·신고하기」가 스크롤 맨 끝에 있어
 * Android 3버튼 내비 바 아래에서 시작했다 → 버튼은 공용 시트의 스크롤 밖 고정 하단(`footer`)에 둔다.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/AppLanguageProvider", () => {
  const value = { language: "ko", t: (k: string) => k, safeT: (k: string) => k, tt: (s: string) => s };
  return { useI18n: () => value };
});
vi.mock("@/lib/auth/get-current-user", () => ({ getCurrentUser: () => ({ id: "u1" }) }));
const submit = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("@/lib/reports/submitReportDaangn", () => ({ submitReportDaangn: submit }));

import { ReportActionSheet } from "@/components/reports/ReportActionSheet";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("v6 FAIL 5 신고 시트 버튼 = 고정 하단", () => {
  it("버튼은 스크롤 본문 밖 footer 에 있고, 제출 버튼은 form 속성으로 본문 form 을 가리킨다", async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    await act(async () => {
      root.render(
        <ReportActionSheet targetType="feed_ad" targetId="c1" targetUserId="" onClose={onClose} onSuccess={onSuccess} />
      );
    });
    const footer = document.querySelector('[data-report-sheet-footer="1"]') as HTMLElement | null;
    expect(footer).not.toBeNull();
    const form = document.querySelector("form") as HTMLFormElement;
    expect(form).not.toBeNull();
    // 버튼이 form(스크롤 본문) 안에 없다
    expect(form.querySelectorAll("button[type=submit]").length).toBe(0);
    const submitBtn = footer!.querySelector("button[type=submit]") as HTMLButtonElement;
    expect(submitBtn).not.toBeNull();
    expect(submitBtn.getAttribute("form")).toBe(form.id);
    expect(form.id).not.toBe("");
    // footer 는 스크롤 본문(overflow-y-auto)의 자손이 아니다
    expect(footer!.closest(".overflow-y-auto")).toBeNull();
    // 사유를 고르기 전에는 제출 비활성
    expect(submitBtn.disabled).toBe(true);
  });
});
