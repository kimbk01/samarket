import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NativeOAuthLaunchClient } from "@/app/auth/oauth/native-launch/NativeOAuthLaunchClient";
import { NATIVE_OAUTH_LAUNCH_URL_COOKIE } from "@/lib/auth/oauth/native-oauth-launch.constants";

export const dynamic = "force-dynamic";

export default async function NativeOAuthLaunchOpenPage() {
  const cookieStore = await cookies();
  const authorizeUrl = cookieStore.get(NATIVE_OAUTH_LAUNCH_URL_COOKIE)?.value?.trim();

  if (!authorizeUrl) {
    redirect("/login?error=missing_authorize_url");
  }

  return <NativeOAuthLaunchClient authorizeUrl={authorizeUrl} />;
}
