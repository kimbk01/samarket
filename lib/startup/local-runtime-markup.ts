/**
 * Option A Local Runtime HTML shell — mounts React AppShell (no location.replace).
 */

import { BUNDLED_STARTUP_CONFIG, type StartupConfig } from "@/lib/startup/startup-config";

export type LocalRuntimeBuildOptions = {
  config?: StartupConfig;
  logoSrc?: string;
  remoteApiOrigin?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  lang?: "ko" | "en";
  /** Relative path to esbuild bundle (under same directory as index.html). */
  reactBundleSrc?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildLocalRuntimeDocumentHtml(opts: LocalRuntimeBuildOptions = {}): string {
  const config = opts.config ?? BUNDLED_STARTUP_CONFIG;
  const lang = opts.lang ?? "ko";
  const logoSrc = opts.logoSrc ?? config.logoUrl;
  const remoteApiOrigin = (opts.remoteApiOrigin ?? "").replace(/\/$/, "");
  const supabaseUrl = opts.supabaseUrl ?? "";
  const supabaseAnonKey = opts.supabaseAnonKey ?? "";
  const bg = escapeHtml(config.backgroundColor || "#FFFCFC");
  const bundleSrc = opts.reactBundleSrc ?? "./assets/local-runtime-app.js";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<meta name="color-scheme" content="light dark"/>
<meta name="theme-color" content="${bg}"/>
<meta name="dibay-local-logo" content="${escapeHtml(logoSrc)}"/>
<title>DIBAY</title>
<style>
:root{--sam-bg-app:${bg};--sam-fg:#0B421A;--sam-muted:#5C6B63;--sam-border:#E6EBE8;--sam-surface:#FFFFFF;--sam-primary:#0B421A}
html,body,#dibay-local-runtime-root{margin:0;padding:0;height:100%;background:var(--sam-bg-app);color:var(--sam-fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans KR",sans-serif}
*{box-sizing:border-box}
#dibay-local-runtime-react-root{height:100%;min-height:100%}
@media (prefers-color-scheme: dark){
  :root{--sam-bg-app:#12161d;--sam-fg:#F2F5F3;--sam-muted:#A7B2AB;--sam-border:#2A323C;--sam-surface:#1A2028;--sam-primary:#8FCB9B}
}
</style>
<script>
window.__DIBAY_LOCAL_RUNTIME__=true;
window.__DIBAY_REMOTE_API_ORIGIN__=${JSON.stringify(remoteApiOrigin)};
window.__DIBAY_SUPABASE_URL__=${JSON.stringify(supabaseUrl)};
window.__DIBAY_SUPABASE_ANON_KEY__=${JSON.stringify(supabaseAnonKey)};
</script>
</head>
<body style="background:${bg}">
<div id="dibay-local-runtime-root" data-local-runtime="1">
  <div id="dibay-local-runtime-react-root"></div>
</div>
<script src="${escapeHtml(bundleSrc)}" defer></script>
</body>
</html>`;
}
