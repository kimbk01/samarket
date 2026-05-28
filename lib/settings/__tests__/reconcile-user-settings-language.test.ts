import { describe, expect, it } from "vitest";
import {
  mergeUserSettingsPreferredLanguage,
  reconcilePreferredLanguageOnRemoteSync,
} from "@/lib/settings/reconcile-user-settings-language";

describe("reconcilePreferredLanguageOnRemoteSync", () => {
  it("keeps remote explicit ko/en", () => {
    expect(
      reconcilePreferredLanguageOnRemoteSync({
        remotePreferredLanguage: "en",
        localPreferredLanguage: "ko",
      })
    ).toEqual({ preferredLanguage: "en", shouldUploadToServer: null });
  });

  it("keeps local explicit when remote is null", () => {
    expect(
      reconcilePreferredLanguageOnRemoteSync({
        remotePreferredLanguage: null,
        localPreferredLanguage: "ko",
      })
    ).toEqual({ preferredLanguage: "ko", shouldUploadToServer: "ko" });
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

  it("remote explicit wins over stale local", () => {
    const { settings, shouldUploadToServer } = mergeUserSettingsPreferredLanguage(
      "user-1",
      { preferred_language: "ko" },
      { preferred_language: "en" }
    );
    expect(settings.preferred_language).toBe("ko");
    expect(shouldUploadToServer).toBeNull();
  });
});
