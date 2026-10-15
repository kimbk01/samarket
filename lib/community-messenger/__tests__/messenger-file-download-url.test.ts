import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/platform/capacitor-native", () => ({ isCapacitorNativePlatform: vi.fn(() => false) }));

import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  buildMessengerFileDownloadUrl,
  openMessengerFileInNativeShellIfNeeded,
} from "@/lib/community-messenger/messenger-file-download";

const PUB = "https://abc.supabase.co/storage/v1/object/public/post-images/u1/community/messenger-file/r1/0b0e.pdf";

describe("buildMessengerFileDownloadUrl", () => {
  it("appends download=<encodeURIComponent(original name)> to Supabase public URLs", () => {
    const out = buildMessengerFileDownloadUrl(PUB, "2026 견적서 (최종).pdf");
    expect(out).toBe(`${PUB}?download=${encodeURIComponent("2026 견적서 (최종).pdf")}`);
    expect(new URL(out).searchParams.get("download")).toBe("2026 견적서 (최종).pdf");
  });

  it("keeps existing query params and replaces an existing download param", () => {
    const out = buildMessengerFileDownloadUrl(`${PUB}?t=1&download=old.pdf`, "새 파일.pdf");
    const u = new URL(out);
    expect(u.searchParams.get("t")).toBe("1");
    expect(u.searchParams.getAll("download")).toEqual(["새 파일.pdf"]);
  });

  it("encodes characters that would break the query (&, #, +)", () => {
    const out = buildMessengerFileDownloadUrl(PUB, "a&b#c+d.txt");
    expect(new URL(out).searchParams.get("download")).toBe("a&b#c+d.txt");
  });

  it("leaves non-Supabase / invalid URLs untouched", () => {
    expect(buildMessengerFileDownloadUrl("https://example.com/x.pdf", "x.pdf")).toBe("https://example.com/x.pdf");
    expect(buildMessengerFileDownloadUrl("not a url", "x.pdf")).toBe("not a url");
    expect(buildMessengerFileDownloadUrl("", "x.pdf")).toBe("");
  });
});

describe("openMessengerFileInNativeShellIfNeeded", () => {
  afterEach(() => vi.mocked(isCapacitorNativePlatform).mockReturnValue(false));

  it("returns false on web so the normal anchor download runs", () => {
    expect(openMessengerFileInNativeShellIfNeeded(PUB)).toBe(false);
  });

  it("returns true in the Capacitor shell (opens via @capacitor/browser)", () => {
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(true);
    expect(openMessengerFileInNativeShellIfNeeded(PUB)).toBe(true);
  });
});
