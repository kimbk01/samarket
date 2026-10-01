import { WebPlugin } from "@capacitor/core";
import type {
  NativeKakaoAuthPlugin,
  NativeKakaoSignInOptions,
} from "@/lib/auth/native/native-kakao-auth-plugin";

export class NativeKakaoAuthWeb extends WebPlugin implements NativeKakaoAuthPlugin {
  async signIn(_options?: NativeKakaoSignInOptions): Promise<never> {
    throw { code: "kakao_native_unavailable", message: "Native Kakao login requires Android/iOS app shell" };
  }

  async signOut(): Promise<void> {
    /* web noop */
  }
}
