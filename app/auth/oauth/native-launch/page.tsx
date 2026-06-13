import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NativeOAuthLaunchClient } from "@/app/auth/oauth/native-launch/NativeOAuthLaunchClient";
import { cookieSecureFromNextHeaders } from "@/lib/auth/cookie-secure-flag";
import {
  normalizeSupabaseOAuthProvider,
  runSupabaseOAuthStart,
} from "@/lib/auth/oauth/supabase-oauth-start.server";
import {
  DIBAY_APP_MARKER_PARAM,
  DIBAY_APP_MARKER_COOKIE_NAME,
} from "@/lib/platform/capacitor-native";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const value = params[key];
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

function isNativeAppLaunch(params: Record<string, string | string[] | undefined>): boolean {
  const marker = readParam(params, DIBAY_APP_MARKER_PARAM)?.toLowerCase();
  if (marker === "android" || marker === "ios") return true;
  return false;
}

async function hasNativeAppCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  const marker = cookieStore.get(DIBAY_APP_MARKER_COOKIE_NAME)?.value?.trim().toLowerCase();
  return marker === "android" || marker === "ios";
}

export default async function NativeOAuthLaunchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const provider = normalizeSupabaseOAuthProvider(readParam(params, "provider"));
  const next = readParam(params, "next");
  const native = isNativeAppLaunch(params) || (await hasNativeAppCookie());

  if (!provider) {
    redirect("/login?error=invalid_provider");
  }

  if (!native) {
    const query = new URLSearchParams({ provider });
    if (next) query.set("next", next);
    redirect(`/api/auth/oauth/start?${query.toString()}`);
  }

  const cookieStore = await cookies();
  const secureCookies = await cookieSecureFromNextHeaders();
  const result = await runSupabaseOAuthStart({
    provider,
    native: true,
    next,
    secureCookies,
    cookieStore: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });

  if (!result.ok) {
    redirect(`/login?error=${encodeURIComponent(result.errorCode)}`);
  }

  return (
    <NativeOAuthLaunchClient authorizeUrl={result.authorizeUrl} />
  );
}
