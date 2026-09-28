/**
 * Local sealed-pack transport. Native serves bytes; WebView must not depend on
 * ambiguous file:// fetch or crypto.subtle for checksums.
 */
export const DIBAY_INTRO_ANDROID_LOCAL_ORIGIN = "https://dibay-intro.local";
export const DIBAY_INTRO_IOS_LOCAL_ORIGIN = "dibay-intro://pack";
export const DIBAY_INTRO_MANIFEST_TRANSPORT = "same-origin-relative-fetch";
export const DIBAY_INTRO_ASSET_TRANSPORT = "same-origin-relative-fetch";
export const DIBAY_INTRO_CHECKSUM_OWNER = "native-or-local-installer-VERIFYING";

export const DIBAY_INTRO_LOCAL_ORIGIN_CONTRACT = {
  MANIFEST_TRANSPORT: DIBAY_INTRO_MANIFEST_TRANSPORT,
  ASSET_TRANSPORT: DIBAY_INTRO_ASSET_TRANSPORT,
  CHECKSUM_EXECUTION_OWNER: DIBAY_INTRO_CHECKSUM_OWNER,
  ANDROID_LOCAL_ORIGIN: DIBAY_INTRO_ANDROID_LOCAL_ORIGIN,
  IOS_LOCAL_ORIGIN: DIBAY_INTRO_IOS_LOCAL_ORIGIN,
  FILE_URL_FETCH: false,
  CRYPTO_SUBTLE: false,
} as const;

/** Local Node/jsdom cannot observe GIF frames in a device WebView. Production/browser E2E owns this. */
export const GIF_PLAYBACK_BROWSER_FRAME = "NOT_PROVEN" as const;
