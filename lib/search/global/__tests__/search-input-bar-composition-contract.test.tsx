// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchInputBar } from "@/components/search/SearchInputBar";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    safeT: (_key: string, opts?: { fallbackKo?: string; fallbackEn?: string }) =>
      opts?.fallbackKo ?? opts?.fallbackEn ?? _key,
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setNativeInputValue(input: HTMLInputElement, value: string, isComposing?: boolean) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  proto?.set?.call(input, value);
  const event = new InputEvent("input", { bubbles: true, data: value });
  if (typeof isComposing === "boolean") {
    Object.defineProperty(event, "isComposing", { value: isComposing });
  }
  input.dispatchEvent(event);
}

function ControlledBar({
  onSubmit,
  onComposingChange,
  onCompositionCommit,
}: {
  onSubmit: (keyword: string) => void;
  onComposingChange?: (composing: boolean) => void;
  onCompositionCommit?: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <SearchInputBar
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      onComposingChange={onComposingChange}
      onCompositionCommit={onCompositionCommit}
    />
  );
}

describe("SearchInputBar composition contract", () => {
  let container: HTMLDivElement;
  let root: Root;

  async function flush() {
    await act(async () => {
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("T1 — composition display updates the visible value", async () => {
    const onSubmit = vi.fn();
    act(() => {
      root.render(<ControlledBar onSubmit={onSubmit} />);
    });
    await flush();
    const input = container.querySelector<HTMLInputElement>('input[type="search"]');
    expect(input).toBeTruthy();
    act(() => {
      input!.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      setNativeInputValue(input!, "ㄷ", true);
    });
    await flush();
    expect(container.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("ㄷ");
    act(() => {
      setNativeInputValue(container.querySelector<HTMLInputElement>('input[type="search"]')!, "디", true);
    });
    await flush();
    expect(container.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("디");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("T3 — submit during composition is blocked", async () => {
    const onSubmit = vi.fn();
    act(() => {
      root.render(<ControlledBar onSubmit={onSubmit} />);
    });
    await flush();
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      setNativeInputValue(input, "디", true);
    });
    await flush();
    act(() => {
      const current = container.querySelector<HTMLInputElement>('input[type="search"]')!;
      current.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    await flush();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("T10 — input identity, focus, and value stay during composition", async () => {
    const onSubmit = vi.fn();
    act(() => {
      root.render(<ControlledBar onSubmit={onSubmit} />);
    });
    await flush();
    const before = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      before.focus();
    });
    expect(document.activeElement).toBe(before);
    act(() => {
      before.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      setNativeInputValue(before, "ㄷ", true);
      setNativeInputValue(before, "디", true);
    });
    await flush();
    const after = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(after).toBe(before);
    expect(after.isConnected).toBe(true);
    expect(after.value).toBe("디");
    expect(document.activeElement).toBe(after);
  });
});
