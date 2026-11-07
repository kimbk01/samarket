import { describe, expect, it, vi } from "vitest";
import {
  APP_LANGUAGE_DEVICE_SEEDED_KEY,
  APP_LANGUAGE_STORAGE_KEY,
  FALLBACK_APP_LANGUAGE,
  getBrowserLanguage,
  normalizeLanguagePreferenceForStorage,
  parseExplicitAppLanguage,
  preferredLanguageFromDbColumn,
  preferredLanguageToDbColumn,
  resolveLanguageFromCandidates,
} from "@/lib/i18n/config";
import {
  detectAcceptLanguageAppLanguage,
  peekExplicitDisplayLanguage,
  readDeviceLanguageChoice,
  readExplicitLanguageCookie,
  readPendingAccountLanguage,
  resolveServerInitialLanguage,
  writeDeviceLanguageChoice,
  writeDisplayLanguageCookie,
  writePendingAccountLanguage,
  clearPendingAccountLanguage,
} from "@/lib/i18n/language-preference";

function stubStorage(initial: Record<string, string> = {}, cookie = "") {
  const storage: Record<string, string> = { ...initial };
  const doc = { cookie };
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
    },
  });
  vi.stubGlobal("document", doc);
  return { storage, doc };
}

describe("resolveLanguageFromCandidates", () => {
  it("returns ko when Korean appears in preference list", () => {
    expect(resolveLanguageFromCandidates(["en-US", "ko-KR"])).toBe("ko");
    expect(resolveLanguageFromCandidates(["ko"])).toBe("ko");
  });

  it("returns en when only English tags are present", () => {
    expect(resolveLanguageFromCandidates(["en-US", "en-GB"])).toBe("en");
  });

  it("falls back to en for unsupported locales", () => {
    expect(resolveLanguageFromCandidates(["fr-FR", "de"])).toBe(FALLBACK_APP_LANGUAGE);
    expect(resolveLanguageFromCandidates([])).toBe(FALLBACK_APP_LANGUAGE);
  });
});

describe("detectAcceptLanguageAppLanguage", () => {
  it("maps Accept-Language ko to ko and others to en", () => {
    expect(detectAcceptLanguageAppLanguage("ko-KR,ko;q=0.9")).toBe("ko");
    expect(detectAcceptLanguageAppLanguage("en-US,en;q=0.9")).toBe("en");
    expect(detectAcceptLanguageAppLanguage("fr-FR,fr;q=0.9")).toBe("en");
  });
});

describe("parseExplicitAppLanguage", () => {
  it("rejects unsupported codes", () => {
    expect(parseExplicitAppLanguage("ja")).toBeNull();
    expect(parseExplicitAppLanguage("zh")).toBeNull();
  });

  it("rejects oversized input", () => {
    expect(parseExplicitAppLanguage("en")).toBe("en");
    expect(parseExplicitAppLanguage("x".repeat(33))).toBeNull();
  });

  it("rejects unsupported language codes", () => {
    expect(parseExplicitAppLanguage("fr")).toBeNull();
    expect(parseExplicitAppLanguage("javascript:alert(1)")).toBeNull();
  });
});

describe("stored preferred language (null = device)", () => {
  it("maps system and invalid to null", () => {
    expect(normalizeLanguagePreferenceForStorage("system")).toBeNull();
    expect(normalizeLanguagePreferenceForStorage("ja")).toBeNull();
    expect(normalizeLanguagePreferenceForStorage(null)).toBeNull();
  });

  it("keeps explicit ko/en", () => {
    expect(normalizeLanguagePreferenceForStorage("ko")).toBe("ko");
    expect(normalizeLanguagePreferenceForStorage("en")).toBe("en");
  });

  it("round-trips DB empty string as null", () => {
    expect(preferredLanguageFromDbColumn("")).toBeNull();
    expect(preferredLanguageFromDbColumn("system")).toBeNull();
    expect(preferredLanguageToDbColumn(null)).toBe("");
    expect(preferredLanguageToDbColumn("en")).toBe("en");
  });
});

describe("getBrowserLanguage", () => {
  it("is exported and returns ko or en", () => {
    const lang = getBrowserLanguage();
    expect(lang === "ko" || lang === "en").toBe(true);
  });
});

describe("readExplicitLanguageCookie", () => {
  it("ignores malformed cookie values", () => {
    stubStorage({}, "samarket_signup_locale=%E0%A4%A");
    expect(readExplicitLanguageCookie()).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("언어 저장소 (docs/i18n-ssot.md §2)", () => {
  it("기기 선택은 토글 값만 저장하고 레거시 seed 표시는 읽지 않는다", () => {
    const { storage } = stubStorage({ [APP_LANGUAGE_DEVICE_SEEDED_KEY]: "1" });
    expect(readDeviceLanguageChoice()).toBeNull();
    writeDeviceLanguageChoice("en");
    expect(storage[APP_LANGUAGE_STORAGE_KEY]).toBe("en");
    expect(readDeviceLanguageChoice()).toBe("en");
    vi.unstubAllGlobals();
  });

  it("미전송 계정 값은 계정별로 저장·삭제된다", () => {
    stubStorage();
    writePendingAccountLanguage("u1", "ko");
    expect(readPendingAccountLanguage("u1")).toBe("ko");
    expect(readPendingAccountLanguage("u2")).toBeNull();
    clearPendingAccountLanguage("u1");
    expect(readPendingAccountLanguage("u1")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("화면 언어 쿠키는 명시일 때만 두고 기기 언어를 따르면 지운다", () => {
    const { doc } = stubStorage();
    writeDisplayLanguageCookie("en");
    expect(doc.cookie).toContain("samarket_signup_locale=en");
    doc.cookie = "samarket_signup_locale=en";
    writeDisplayLanguageCookie(null);
    expect(doc.cookie).toContain("max-age=0");
    vi.unstubAllGlobals();
  });

  it("Provider 전 추정은 화면 쿠키가 기기 선택보다 먼저다", () => {
    stubStorage({ [APP_LANGUAGE_STORAGE_KEY]: "ko" }, "samarket_signup_locale=en");
    expect(peekExplicitDisplayLanguage()).toBe("en");
    vi.unstubAllGlobals();
    stubStorage({ [APP_LANGUAGE_STORAGE_KEY]: "ko" }, "");
    expect(peekExplicitDisplayLanguage()).toBe("ko");
    vi.unstubAllGlobals();
  });

  it("SSR 첫 화면은 쿠키 → Accept-Language → en", () => {
    expect(resolveServerInitialLanguage({ cookieValue: "en", acceptLanguage: "ko-KR" })).toBe("en");
    expect(resolveServerInitialLanguage({ cookieValue: null, acceptLanguage: "ko-KR,ko;q=0.9" })).toBe("ko");
    expect(resolveServerInitialLanguage({ cookieValue: null, acceptLanguage: null })).toBe("en");
  });
});
