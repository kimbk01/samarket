import { describe, expect, it } from "vitest";
import {
  mergeUserSettingsPreferredLanguage,
  reconcilePreferredLanguageOnRemoteSync,
} from "@/lib/settings/reconcile-user-settings-language";

describe("reconcilePreferredLanguageOnRemoteSync", () => {
  it("matches when remote and local agree", () => {
    expect(
      reconcilePreferredLanguageOnRemoteSync({
        remotePreferredLanguage: "en",
        localPreferredLanguage: "en",
      })
    ).toEqual({ preferredLanguage: "en", shouldUploadToServer: null });
  });

  it("prefers local explicit when remote differs (same-device user choice)", () => {
    expect(
      reconcilePreferredLanguageOnRemoteSync({
        remotePreferredLanguage: "ko",
        localPreferredLanguage: "en",
      })
    ).toEqual({ preferredLanguage: "en", shouldUploadToServer: "en" });
  });

  it("prefers persistedAppLanguage over stale kasama cache", () => {
    expect(
      reconcilePreferredLanguageOnRemoteSync({
        remotePreferredLanguage: "ko",
        localPreferredLanguage: "ko",
        persistedAppLanguage: "en",
      })
    ).toEqual({ preferredLanguage: "en", shouldUploadToServer: "en" });
  });

  it("keeps local explicit when remote is null", () => {
    expect(
      reconcilePreferredLanguageOnRemoteSync({
        remotePreferredLanguage: null,
        localPreferredLanguage: "ko",
      })
    ).toEqual({ preferredLanguage: "ko", shouldUploadToServer: "ko" });
  });

  it("uses remote when local has no explicit language", () => {
    expect(
      reconcilePreferredLanguageOnRemoteSync({
        remotePreferredLanguage: "en",
        localPreferredLanguage: null,
      })
    ).toEqual({ preferredLanguage: "en", shouldUploadToServer: null });
  });

  it("uploads local explicit when remote is null", () => {
    expect(
      reconcilePreferredLanguageOnRemoteSync({
        remotePreferredLanguage: null,
        localPreferredLanguage: null,
        persistedAppLanguage: "en",
      })
    ).toEqual({ preferredLanguage: "en", shouldUploadToServer: "en" });
  });

  it("returns null when neither side has explicit language", () => {
    expect(
      reconcilePreferredLanguageOnRemoteSync({
        remotePreferredLanguage: "",
        localPreferredLanguage: "system",
      })
    ).toEqual({ preferredLanguage: null, shouldUploadToServer: null });
  });
});

describe("mergeUserSettingsPreferredLanguage", () => {
  it("merges remote fields but preserves local language until server confirms", () => {
    const { settings, shouldUploadToServer } = mergeUserSettingsPreferredLanguage(
      "user-1",
      { push_enabled: false, preferred_language: null },
      { push_enabled: true, preferred_language: "en" }
    );
    expect(settings.user_id).toBe("user-1");
    expect(settings.push_enabled).toBe(false);
    expect(settings.preferred_language).toBe("en");
    expect(shouldUploadToServer).toBe("en");
  });

  it("local explicit wins over stale remote on conflict", () => {
    const { settings, shouldUploadToServer } = mergeUserSettingsPreferredLanguage(
      "user-1",
      { preferred_language: "ko" },
      { preferred_language: "en" }
    );
    expect(settings.preferred_language).toBe("en");
    expect(shouldUploadToServer).toBe("en");
  });
});
