import { WebPlugin } from "@capacitor/core";
import type { NativeKakaoAuthPlugin } from "@/lib/auth/native/native-kakao-auth-plugin";

export class NativeKakaoAuthWeb extends WebPlugin implements NativeKakaoAuthPlugin {
  async signIn(): Promise<never> {
    throw { code: "kakao_native_unavailable", message: "Native Kakao login requires Android/iOS app shell" };
  }

  async signOut(): Promise<void> {
    /* web noop */
  }
}
