import type { NativeOAuthLaunchProvider } from "@/lib/auth/oauth/native-oauth-launch.constants";

const PROVIDER_BUTTON_LABEL: Record<NativeOAuthLaunchProvider, string> = {
  google: "Google로 계속하기",
  kakao: "카카오톡으로 계속하기",
  apple: "Apple로 계속하기",
};

export function buildNativeOAuthLaunchHtml(input: {
  authorizeUrl: string;
  provider: NativeOAuthLaunchProvider;
}): string {
  const { authorizeUrl, provider } = input;
  const buttonLabel = PROVIDER_BUTTON_LABEL[provider];
  const authorizeJson = JSON.stringify(authorizeUrl);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex,nofollow" />
  <title>로그인</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #FFFCFC;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif;
      color: #1e3932;
    }
    .wrap { width: min(100%, 22rem); padding: 1.5rem; text-align: center; }
    .logo {
      width: 3.5rem; height: 3.5rem; margin: 0 auto 1rem; border-radius: 0.75rem;
      display: grid; place-items: center; font-weight: 700; color: #0B421A;
      border: 2px solid #0B421A; background: #fff;
    }
    h1 { margin: 0; font-size: 1rem; font-weight: 600; }
    p { margin: 0.5rem 0 0; font-size: 0.875rem; color: #604C4C; line-height: 1.5; }
    button {
      margin-top: 1.5rem; width: 100%; border: 0; border-radius: 0.75rem;
      padding: 0.9rem 1rem; font-size: 0.95rem; font-weight: 600;
      background: #0B421A; color: #FFFCFC; cursor: pointer;
    }
    button:disabled { opacity: 0.6; cursor: wait; }
    .err { margin-top: 0.75rem; color: #b42318; min-height: 1.25rem; font-size: 0.875rem; }
    .retry {
      margin-top: 0.75rem; background: transparent; color: #0B421A; text-decoration: underline;
      padding: 0.25rem; font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo" aria-hidden="true">D</div>
    <h1>로그인을 계속해 주세요</h1>
    <p>아래 버튼을 눌러 로그인 창을 열어 주세요.</p>
    <button id="oauth-open" type="button">${buttonLabel}</button>
    <div id="oauth-err" class="err" role="alert"></div>
    <button id="oauth-retry" type="button" class="retry" hidden>다시 시도</button>
  </div>
  <script>
    (function () {
      var authorizeUrl = ${authorizeJson};
      var openBtn = document.getElementById("oauth-open");
      var retryBtn = document.getElementById("oauth-retry");
      var errEl = document.getElementById("oauth-err");
      var opening = false;

      function setError(message) {
        errEl.textContent = message || "";
        retryBtn.hidden = !message;
      }

      function openFallback() {
        var popup = null;
        try { popup = window.open(authorizeUrl, "_blank", "noopener,noreferrer"); } catch (e) {}
        if (popup) return true;
        try {
          var a = document.createElement("a");
          a.href = authorizeUrl;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.style.display = "none";
          document.body.appendChild(a);
          a.click();
          a.remove();
          return true;
        } catch (e2) {}
        return false;
      }

      function waitForBackground() {
        return new Promise(function (resolve) {
          var attempts = 0;
          var timer = window.setInterval(function () {
            attempts += 1;
            if (document.visibilityState === "hidden") {
              window.clearInterval(timer);
              resolve(true);
              return;
            }
            if (attempts >= 30) {
              window.clearInterval(timer);
              resolve(false);
            }
          }, 100);
        });
      }

      function getBrowserPlugin() {
        var cap = window.Capacitor;
        if (!cap) return null;
        if (cap.Plugins && cap.Plugins.Browser) return cap.Plugins.Browser;
        if (typeof cap.registerPlugin === "function") {
          try {
            return cap.registerPlugin("Browser");
          } catch (e) {
            return null;
          }
        }
        return null;
      }

      async function openOAuthBrowser() {
        if (opening) return;
        opening = true;
        openBtn.disabled = true;
        setError("");
        try {
          var browser = getBrowserPlugin();
          if (browser && typeof browser.open === "function") {
            await browser.open({ url: authorizeUrl });
            if (await waitForBackground()) return;
          }
          if (openFallback()) {
            if (await waitForBackground()) return;
          }
          setError("로그인 창을 열지 못했습니다. 앱을 재시작한 뒤 다시 시도해 주세요.");
        } catch (e) {
          if (openFallback() && (await waitForBackground())) return;
          setError("로그인 창을 열지 못했습니다. 다시 시도해 주세요.");
        } finally {
          opening = false;
          openBtn.disabled = false;
        }
      }

      openBtn.addEventListener("click", function () { void openOAuthBrowser(); });
      retryBtn.addEventListener("click", function () { void openOAuthBrowser(); });
    })();
  </script>
</body>
</html>`;
}
