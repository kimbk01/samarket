export const NATIVE_OAUTH_LAUNCH_PATH = "/auth/oauth/native-launch";

export type NativeOAuthLaunchProvider = "google" | "kakao" | "apple";

export function isNativeOAuthLaunchProvider(
  value: string | null | undefined,
): value is NativeOAuthLaunchProvider {
  return value === "google" || value === "kakao" || value === "apple";
}
