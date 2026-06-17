import type { CommunityPostShareKakaoFeed } from "./community-share-payload";
import { copyTextToClipboard } from "./community-share-copy";

type KakaoShareSdk = {
  isInitialized: () => boolean;
  init: (key: string) => void;
  Share: {
    sendDefault: (opts: { objectType: string; content: unknown; buttons?: unknown }) => void;
  };
};

declare global {
  interface Window {
    Kakao?: KakaoShareSdk;
  }
}

const KAKAO_SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";

let kakaoLoadPromise: Promise<KakaoShareSdk | null> | null = null;

export function getKakaoJavascriptKey(): string | null {
  const key = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY?.trim();
  return key || null;
}

export function isKakaoShareAvailable(): boolean {
  return Boolean(getKakaoJavascriptKey());
}

async function loadKakaoSdk(): Promise<KakaoShareSdk | null> {
  if (typeof window === "undefined") return null;
  const key = getKakaoJavascriptKey();
  if (!key) return null;

  if (window.Kakao?.isInitialized?.()) return window.Kakao;

  if (!kakaoLoadPromise) {
    kakaoLoadPromise = new Promise((resolve) => {
      const existing = document.querySelector(`script[src="${KAKAO_SDK_URL}"]`);
      const onReady = () => {
        const kakao = window.Kakao;
        if (!kakao) {
          resolve(null);
          return;
        }
        if (!kakao.isInitialized()) {
          try {
            kakao.init(key);
          } catch {
            resolve(null);
            return;
          }
        }
        resolve(kakao);
      };
      if (existing) {
        onReady();
        return;
      }
      const script = document.createElement("script");
      script.src = KAKAO_SDK_URL;
      script.async = true;
      script.onload = onReady;
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  }

  return kakaoLoadPromise;
}

export type KakaoShareOutcome = "opened" | "failed";

export async function shareCommunityPostViaKakao(
  feed: CommunityPostShareKakaoFeed,
  fallbackUrl: string
): Promise<KakaoShareOutcome> {
  const kakao = await loadKakaoSdk();
  if (!kakao) {
    await copyTextToClipboard(fallbackUrl);
    return "failed";
  }
  try {
    kakao.Share.sendDefault({
      objectType: feed.objectType,
      content: feed.content,
      buttons: feed.buttons,
    });
    return "opened";
  } catch {
    await copyTextToClipboard(fallbackUrl);
    return "failed";
  }
}
