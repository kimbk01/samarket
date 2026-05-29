import { describe, expect, it, vi } from "vitest";
import {
  FALLBACK_APP_LANGUAGE,
  getBrowserLanguage,
  normalizeLanguagePreferenceForStorage,
  parseExplicitAppLanguage,
  preferredLanguageFromDbColumn,
  preferredLanguageToDbColumn,
  resolveLanguageFromCandidates,
} from "@/lib/i18n/config";
import {
  APP_LANGUAGE_DEVICE_SEEDED_KEY,
  APP_LANGUAGE_STORAGE_KEY,
} from "@/lib/i18n/config";
import {
  detectAcceptLanguageAppLanguage,
  readClientExplicitAppLanguage,
  readGuestExplicitAppLanguage,
  readLoggedInExplicitAppLanguage,
  resolveGuestAppLanguageCode,
  resolveImplicitAppLanguage,
} from "@/lib/i18n/language-preference";

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

describe("resolveGuestAppLanguageCode", () => {
  it("prefers explicit cookie over browser fallback", () => {
    expect(
      resolveGuestAppLanguageCode({
        cookieValue: "en",
        browserDetect: () => "ko",
      })
    ).toBe("en");
  });
});

describe("parseExplicitAppLanguage", () => {
  it("rejects unsupported codes", () => {
    expect(parseExplicitAppLanguage("ja")).toBeNull();
    expect(parseExplicitAppLanguage("zh")).toBeNull();
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

describe("readLoggedInExplicitAppLanguage", () => {
  it("prefers user_settings (cached) over localStorage", () => {
    const storage = { [APP_LANGUAGE_STORAGE_KEY]: "ko" };
    const getItem = (key: string) => storage[key as keyof typeof storage] ?? null;
    vi.stubGlobal("window", { localStorage: { getItem } });
    vi.stubGlobal("document", { cookie: "" });

    expect(readLoggedInExplicitAppLanguage("en")).toBe("en");
    vi.unstubAllGlobals();
  });
});

describe("readClientExplicitAppLanguage (compat)", () => {
  it("delegates to logged-in reader when cached preference is passed", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null } });
    vi.stubGlobal("document", { cookie: "" });
    expect(
      readClientExplicitAppLanguage({
        cachedPreferredLanguage: "en",
      })
    ).toBe("en");
    vi.unstubAllGlobals();
  });
});

describe("readGuestExplicitAppLanguage", () => {
  it("prefers localStorage over cookie", () => {
    const storage = { [APP_LANGUAGE_STORAGE_KEY]: "ko" };
    vi.stubGlobal("window", {
      localStorage: { getItem: (key: string) => storage[key as keyof typeof storage] ?? null },
    });
    vi.stubGlobal("document", { cookie: "samarket_signup_locale=en" });

    expect(readGuestExplicitAppLanguage()).toBe("ko");
    vi.unstubAllGlobals();
  });
});

describe("resolveImplicitAppLanguage", () => {
  it("seeds device language once then returns en fallback", () => {
    const storage: Record<string, string> = {};
    vi.stubGlobal("navigator", { language: "ko-KR", languages: ["ko-KR", "en-US"] });
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => {
          storage[key] = value;
        },
      },
    });
    vi.stubGlobal("document", { cookie: "" });

    expect(resolveImplicitAppLanguage()).toBe("ko");
    expect(storage[APP_LANGUAGE_DEVICE_SEEDED_KEY]).toBe("1");
    expect(storage[APP_LANGUAGE_STORAGE_KEY]).toBe("ko");
    expect(resolveImplicitAppLanguage()).toBe("en");

    vi.unstubAllGlobals();
  });
});
