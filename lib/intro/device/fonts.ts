/**
 * DIBAY INTRO — Gate E Pretendard static font authority (V2 READY gate).
 * Hashes locked from pretendard@1.3.9 static OTF.
 */

export const INTRO_FONT_AUTHORITY = [
  {
    assetId: "Pretendard-Regular.otf",
    sha256:
      "sha256:3ffbacde6ab8411f1d2db54bb9b1f0b3ee2a738932033722cf0388c06aed1c93",
  },
  {
    assetId: "Pretendard-Medium.otf",
    sha256:
      "sha256:d39e50e4bb52b4993b6a4eeb821a171254745bd824446af01e1f616b89fface0",
  },
  {
    assetId: "Pretendard-SemiBold.otf",
    sha256:
      "sha256:c89bc43027dc7cde5726e96223376f8eec09302b2fc1f8147fd5b57cfc376118",
  },
  {
    assetId: "Pretendard-Bold.otf",
    sha256:
      "sha256:2e91915fab54df71cc9598ebf608b2bdb54c6fe3c066ac61dff0bc44fca71cc7",
  },
] as const;

export type FontAuthorityEntry = (typeof INTRO_FONT_AUTHORITY)[number];

export function requiredFontAssetIds(): readonly string[] {
  return INTRO_FONT_AUTHORITY.map((f) => f.assetId);
}

export function expectedFontIntegrity(assetId: string): string | null {
  const hit = INTRO_FONT_AUTHORITY.find((f) => f.assetId === assetId);
  return hit ? hit.sha256 : null;
}
