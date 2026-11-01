// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { usePhilifeWriteLeaveGuard } from "@/components/philife/use-philife-write-leave-guard";

vi.mock("@/lib/ui/overlay-back-stack", () => ({ useOverlayHardwareBack: () => {} }));

function Probe({ confirm }: { confirm: () => Promise<boolean> }) {
  usePhilifeWriteLeaveGuard({
    active: true,
    consumeBackInternally: () => false,
    shouldConfirm: () => true,
    confirmLeave: confirm,
    onLeave: () => {},
  });
  return null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("글쓰기 이탈 가드 — 화면이 다시 붙어도(StrictMode) 나가기 확인이 저절로 뜨지 않는다 (2026-11-02)", () => {
  it("재마운트 후 가드 1개 유지 · 확인 호출 0 · 실제 뒤로가기에는 확인", async () => {
    const confirm = vi.fn(() => Promise.resolve(false));
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const start = window.history.length;
    await act(async () => {
      root.render(
        <StrictMode>
          <Probe confirm={confirm} />
        </StrictMode>
      );
    });
    await act(async () => {
      await wait(50);
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(window.history.state?.__dibayPhilifeWriteGuard).toBe(true);
    expect(window.history.length).toBe(start + 1);
    await act(async () => {
      window.history.back();
      await wait(50);
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    await act(async () => {
      root.unmount();
      await wait(20);
    });
    host.remove();
  });
});
