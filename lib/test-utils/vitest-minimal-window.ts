import { vi } from "vitest";

/** Vitest jsdom/happy-dom 없이 coordinator 등 window 의존 코드를 안전하게 stub */
export function stubVitestMinimalWindow(
  overrides: Partial<Window> = {}
): void {
  vi.stubGlobal("window", {
    requestIdleCallback: undefined,
    ...overrides,
  } as unknown as Window & typeof globalThis);
}
