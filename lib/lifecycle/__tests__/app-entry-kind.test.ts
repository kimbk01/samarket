/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAppEntryDecision,
  resetAppEntryDecisionForTests,
} from "@/lib/lifecycle/app-entry-kind";
import {
  RESTORE_ENVELOPE_KEY,
  discardRestoreEnvelope,
  writeRestoreEnvelope,
} from "@/lib/lifecycle/restore-envelope";

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  } as Storage;
}

function setNative(epoch: string | null, hint: string | null) {
  const w = window as unknown as {
    __DIBAY_LAUNCH_EPOCH__?: string;
    __DIBAY_NATIVE_RESTORE_HINT__?: string;
  };
  if (epoch) {
    Object.defineProperty(w, "__DIBAY_LAUNCH_EPOCH__", {
      value: epoch,
      writable: true,
      configurable: true,
    });
  } else {
    delete w.__DIBAY_LAUNCH_EPOCH__;
  }
  if (hint === null) {
    delete w.__DIBAY_NATIVE_RESTORE_HINT__;
  } else {
    Object.defineProperty(w, "__DIBAY_NATIVE_RESTORE_HINT__", {
      value: hint,
      writable: true,
      configurable: true,
    });
  }
}

const EPOCH_A = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const EPOCH_B = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";

describe("AppEntryKind SSOT §4.3", () => {
  let sessionStore: Storage;
  let localStore: Storage;

  beforeEach(() => {
    sessionStore = createMemoryStorage();
    localStore = createMemoryStorage();
    vi.stubGlobal("sessionStorage", sessionStore);
    vi.stubGlobal("localStorage", localStore);
    Object.defineProperty(window, "sessionStorage", {
      value: sessionStore,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "localStorage", {
      value: localStore,
      configurable: true,
      writable: true,
    });
    resetAppEntryDecisionForTests();
    discardRestoreEnvelope();
    sessionStore.clear();
    localStore.removeItem(RESTORE_ENVELOPE_KEY);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("FRESH → user_cold allowIntro (discards leftover envelope)", () => {
    writeRestoreEnvelope("/market", "guest");
    setNative(EPOCH_A, "fresh");
    const d = getAppEntryDecision();
    expect(d.kind).toBe("user_cold");
    expect(d.allowIntro).toBe(true);
    expect(d.navigateTo).toBeNull();
    expect(localStorage.getItem(RESTORE_ENVELOPE_KEY)).toBeNull();
  });

  it("RESTORE + valid envelope → os_restore navigate, no intro", () => {
    writeRestoreEnvelope("/community-messenger", "guest");
    setNative(EPOCH_A, "restore");
    const d = getAppEntryDecision();
    expect(d.kind).toBe("os_restore");
    expect(d.allowIntro).toBe(false);
    expect(d.navigateTo).toBe("/community-messenger");
  });

  it("RESTORE + invalid envelope → ambiguous Safe Entry, no intro", () => {
    setNative(EPOCH_A, "restore");
    const d = getAppEntryDecision();
    expect(d.kind).toBe("ambiguous");
    expect(d.allowIntro).toBe(false);
    expect(d.navigateTo).toBe("/philife");
  });

  it("legacy Native (epoch only, no hint property) → USER_COLD allowIntro (not Safe Entry)", () => {
    writeRestoreEnvelope("/market", "guest");
    setNative(EPOCH_A, null);
    const d = getAppEntryDecision();
    expect(d.kind).toBe("user_cold");
    expect(d.reason).toBe("legacy_native_no_hint");
    expect(d.allowIntro).toBe(true);
    expect(d.navigateTo).toBeNull();
    expect(localStorage.getItem(RESTORE_ENVELOPE_KEY)).toBeNull();
  });

  it("UNKNOWN + invalid envelope → AMBIGUOUS (not USER_COLD)", () => {
    setNative(EPOCH_A, "unknown");
    const d = getAppEntryDecision();
    expect(d.kind).toBe("ambiguous");
    expect(d.allowIntro).toBe(false);
    expect(d.navigateTo).toBe("/philife");
  });

  it("UNKNOWN + valid envelope → AMBIGUOUS (not OS_RESTORE)", () => {
    writeRestoreEnvelope("/market", "guest");
    setNative(EPOCH_A, "unknown");
    const d = getAppEntryDecision();
    expect(d.kind).toBe("ambiguous");
    expect(d.allowIntro).toBe(false);
    expect(d.navigateTo).toBe("/philife");
  });

  it("DOC_RESET same epoch reload restores path without intro", () => {
    writeRestoreEnvelope("/stores", "guest");
    setNative(EPOCH_A, "fresh");
    sessionStorage.setItem("dibay:lifecycle:boot-epoch", EPOCH_A);
    const d = getAppEntryDecision();
    expect(d.kind).toBe("doc_reset");
    expect(d.allowIntro).toBe(false);
    expect(d.navigateTo).toBe("/stores");
  });

  it("new processEpoch alone never forces os_restore", () => {
    writeRestoreEnvelope("/market", "guest");
    setNative(EPOCH_B, "fresh");
    const d = getAppEntryDecision();
    expect(d.kind).toBe("user_cold");
    expect(d.kind).not.toBe("os_restore");
  });
});
