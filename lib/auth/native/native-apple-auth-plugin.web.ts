import { WebPlugin } from "@capacitor/core";
import type {
  NativeAppleAuthPlugin,
  NativeAppleAuthPluginSignInResult,
} from "@/lib/auth/native/native-apple-auth-plugin";

/** Web / Android — Apple Native SDK는 iOS 전용. Web OAuth fallback 사용. */
export class NativeAppleAuthWeb extends WebPlugin implements NativeAppleAuthPlugin {
  async signIn(): Promise<NativeAppleAuthPluginSignInResult> {
    throw this.unavailable("apple_native_unavailable");
  }
}
