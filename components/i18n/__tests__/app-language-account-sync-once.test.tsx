// @vitest-environment jsdom
/**
 * 계정 설정 동기화는 세션 확인 시점 1번 — 앱 시작에 `/api/me/settings` 가 2번 나가지 않는다(요청 예산 계약).
 * 복귀·로그인 전환(phase → authenticated)의 재동기화는 그대로.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const syncUserSettings = vi.fn(async () => ({}));
vi.mock("@/lib/settings/user-settings-store", () => ({
  peekRemoteConfirmedPreferredLanguage: () => undefined,
  peekUserSettingsSnapshot: () => ({}),
  subscribeUserSettings: () => () => undefined,
  syncUserSettings: (...args: unknown[]) => syncUserSettings(...(args as [])),
  updateUserSettings: vi.fn(),
}));
vi.mock("@/lib/auth/get-current-user", () => ({ getCurrentUser: () => ({ id: "u1" }) }));

let phase = "loading";
let listener: ((p: string) => void) | null = null;
vi.mock("@/lib/auth/dibay-session-manager", () => ({
  getSessionPhase: () => phase,
  subscribeSessionPhase: (l: (p: string) => void) => {
    listener = l;
    return () => {
      listener = null;
    };
  },
}));

import { AppLanguageProvider } from "@/components/i18n/AppLanguageProvider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(node: React.ReactElement) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  act(() => {
    createRoot(el).render(node);
  });
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  syncUserSettings.mockClear();
  listener = null;
});

describe("AppLanguageProvider 계정 설정 동기화", () => {
  it("세션 확인 전 마운트 → 확인되는 순간 1번만", async () => {
    phase = "loading";
    render(
      <AppLanguageProvider>
        <div />
      </AppLanguageProvider>,
    );
    await flush();
    expect(syncUserSettings).toHaveBeenCalledTimes(0);
    await act(async () => listener?.("authenticated"));
    expect(syncUserSettings).toHaveBeenCalledTimes(1);
  });
  it("이미 확인된 세션이면 마운트 때 1번", async () => {
    phase = "authenticated";
    render(
      <AppLanguageProvider>
        <div />
      </AppLanguageProvider>,
    );
    await flush();
    expect(syncUserSettings).toHaveBeenCalledTimes(1);
  });
  it("복귀(다시 authenticated)에는 다시 동기화", async () => {
    phase = "loading";
    render(
      <AppLanguageProvider>
        <div />
      </AppLanguageProvider>,
    );
    await flush();
    await act(async () => listener?.("authenticated"));
    await act(async () => listener?.("loading"));
    await act(async () => listener?.("authenticated"));
    expect(syncUserSettings).toHaveBeenCalledTimes(2);
  });
});
