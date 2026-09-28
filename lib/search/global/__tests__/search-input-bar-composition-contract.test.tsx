// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SearchInputBar } from "@/components/search/SearchInputBar";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    safeT: (_key: string, opts?: { fallbackKo?: string; fallbackEn?: string }) =>
      opts?.fallbackKo ?? opts?.fallbackEn ?? _key,
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  proto?.set?.call(input, value);
  input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
}

function ControlledBar({
  onSubmit,
  onChangeSpy,
}: {
  onSubmit: (keyword: string) => void;
  onChangeSpy?: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <SearchInputBar
      value={value}
      onChange={(next) => {
        setValue(next);
        onChangeSpy?.(next);
      }}
      onSubmit={onSubmit}
    />
  );
}

describe("SearchInputBar Korean IME rebuild contract", () => {
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

  it("K1 — composition events do not rewrite the input value", async () => {
    const onSubmit = vi.fn();
    const onChangeSpy = vi.fn();
    act(() => {
      root.render(<ControlledBar onSubmit={onSubmit} onChangeSpy={onChangeSpy} />);
    });
    await flush();
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "ㄷ" }));
      input.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: "디" }));
      input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "디" }));
    });
    await flush();
    expect(onChangeSpy).not.toHaveBeenCalled();
    expect(input.value).toBe("");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("K2 — plain onChange is the single owner of the display keyword", async () => {
    const onSubmit = vi.fn();
    const onChangeSpy = vi.fn();
    act(() => {
      root.render(<ControlledBar onSubmit={onSubmit} onChangeSpy={onChangeSpy} />);
    });
    await flush();
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      setNativeInputValue(input, "디바이");
    });
    await flush();
    expect(onChangeSpy).toHaveBeenCalledTimes(1);
    expect(onChangeSpy).toHaveBeenCalledWith("디바이");
    expect(container.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("디바이");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("K3 — Enter during composition does not submit", async () => {
    const onSubmit = vi.fn();
    act(() => {
      root.render(<ControlledBar onSubmit={onSubmit} />);
    });
    await flush();
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      setNativeInputValue(input, "디");
    });
    await flush();
    act(() => {
      const current = container.querySelector<HTMLInputElement>('input[type="search"]')!;
      const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      Object.defineProperty(event, "isComposing", { value: true });
      current.dispatchEvent(event);
    });
    await flush();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("K4 — explicit search after composition ends submits once", async () => {
    const onSubmit = vi.fn();
    act(() => {
      root.render(<ControlledBar onSubmit={onSubmit} />);
    });
    await flush();
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      setNativeInputValue(input, "디바이");
      input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "디바이" }));
    });
    await flush();
    act(() => {
      container.querySelector<HTMLInputElement>('input[type="search"]')?.form?.requestSubmit();
    });
    await flush();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("디바이");
  });

  it("K10 — keyword change does not remount the search input", async () => {
    const onSubmit = vi.fn();
    act(() => {
      root.render(<ControlledBar onSubmit={onSubmit} />);
    });
    await flush();
    const before = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      before.focus();
      setNativeInputValue(before, "ㄷ");
      setNativeInputValue(before, "디");
    });
    await flush();
    const after = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(after).toBe(before);
    expect(after.isConnected).toBe(true);
    expect(after.value).toBe("디");
    expect(document.activeElement).toBe(after);
  });

  it("does not keep a custom IME lifecycle layer", () => {
    const source = readFileSync(resolve(process.cwd(), "components/search/SearchInputBar.tsx"), "utf8");
    expect(source).not.toContain("onCompositionStart");
    expect(source).not.toContain("onCompositionUpdate");
    expect(source).not.toContain("onCompositionEnd");
    expect(source).not.toContain("readNativeComposing");
    expect(source).not.toContain("onComposingChange");
    expect(source).not.toContain("onCompositionCommit");
    expect(source).toContain("onChange={(event) => onChange(event.target.value)}");
    expect(source).toContain("event.nativeEvent.isComposing");
  });
});
