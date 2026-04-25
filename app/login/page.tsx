import LoginPageClient from "./LoginPageClient";
import { loadAuthLoginSettings, type AuthLoginSetting } from "@/lib/auth/login-settings";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  let initialSettings: AuthLoginSetting[] = [];
  let initialSettingsError: string | null = null;
  try {
    initialSettings = await loadAuthLoginSettings();
  } catch (error) {
    initialSettingsError = error instanceof Error ? error.message : "로그인 방식을 불러오지 못했습니다.";
  }
  return <LoginPageClient initialSettings={initialSettings} initialSettingsError={initialSettingsError} />;
}
