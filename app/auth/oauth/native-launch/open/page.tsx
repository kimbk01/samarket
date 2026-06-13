import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NativeOAuthLaunchClient } from "@/app/auth/oauth/native-launch/NativeOAuthLaunchClient";
import { NATIVE_OAUTH_LAUNCH_URL_COOKIE } from "@/lib/auth/oauth/native-oauth-launch.constants";
import { isNativeOAuthProvider } from "@/lib/auth/oauth/open-native-oauth-browser";

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

export default async function NativeOAuthLaunchOpenPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const providerRaw = readParam(params, "provider");
  const cookieStore = await cookies();
  const authorizeUrl = cookieStore.get(NATIVE_OAUTH_LAUNCH_URL_COOKIE)?.value?.trim();

  if (!authorizeUrl) {
    redirect("/login?error=missing_authorize_url");
  }

  if (!isNativeOAuthProvider(providerRaw)) {
    redirect("/login?error=invalid_provider");
  }

  return <NativeOAuthLaunchClient authorizeUrl={authorizeUrl} provider={providerRaw} />;
}
