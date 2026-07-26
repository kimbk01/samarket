/**
 * Local Runtime React entry — Option A product shell.
 * Bundled by scripts/build-local-runtime-react.mjs into capacitor-www/local-runtime/assets/.
 *
 * CONTRACT:
 * - Single React root (#dibay-local-runtime-root)
 * - Single Intro (DIBAY_STARTUP_INTRO_DOM_ID)
 * - Single AppShell + BottomNav from SSOT nav config / icons
 * - No location.replace remote document handoff
 * - Remote = API origin only
 */

import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BUNDLED_STARTUP_CONFIG, isStartupIntroActive } from "@/lib/startup/startup-config";
import { DIBAY_STARTUP_INTRO_DOM_ID } from "@/lib/startup/startup-constants";
import {
  LocalRuntimeStateMachine,
  resolveLocalRuntimeAppReady,
  type LocalRuntimeState,
} from "@/lib/startup/local-runtime-state";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";
import { MAIN_BOTTOM_NAV_TAB_ICONS, MainBottomNavHomeIcon } from "@/components/main-menu/MainBottomNavTabIcons";
import type { BottomNavIconKey } from "@/lib/main-menu/bottom-nav-config";
import { createLocalRuntimeSupabaseClient } from "@/lib/startup/local-runtime-supabase";

declare global {
  interface Window {
    __DIBAY_LOCAL_RUNTIME__?: boolean;
    __DIBAY_REMOTE_API_ORIGIN__?: string;
    __DIBAY_SUPABASE_URL__?: string;
    __DIBAY_SUPABASE_ANON_KEY__?: string;
    DibayBootBridge?: { dismissSplash?: () => void };
  }
}

const sm = new LocalRuntimeStateMachine();

function advance(next: LocalRuntimeState): void {
  const r = sm.transition(next);
  if (r.ok && r.advanced) {
    try {
      window.dispatchEvent(new CustomEvent("dibay:local-runtime-state", { detail: { state: next } }));
      console.info(`[dibay-local-runtime] state=${next}`);
    } catch {
      /* ignore */
    }
  }
}

function dismissNativeSplash(): void {
  try {
    window.DibayBootBridge?.dismissSplash?.();
  } catch {
    /* ignore */
  }
}

function NavIcon({ icon }: { icon: BottomNavIconKey }) {
  if (icon === "home" || icon === "trade") return <MainBottomNavHomeIcon className="h-6 w-6" />;
  const Cmp = MAIN_BOTTOM_NAV_TAB_ICONS[icon];
  if (!Cmp) return <MainBottomNavHomeIcon className="h-6 w-6" />;
  return <Cmp className="h-6 w-6" />;
}

function LocalRuntimeIntro({ visible, logoSrc }: { visible: boolean; logoSrc: string }) {
  const cfg = BUNDLED_STARTUP_CONFIG;
  if (!isStartupIntroActive(cfg)) return null;
  return (
    <div
      id={DIBAY_STARTUP_INTRO_DOM_ID}
      data-dibay-startup-intro="1"
      data-local-runtime-intro="1"
      hidden={!visible}
      aria-hidden={visible ? "false" : "true"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        display: visible ? "flex" : "none",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        background: cfg.backgroundColor || "#FFFCFC",
        pointerEvents: "none",
      }}
    >
      {/* Local Runtime Cap WebView — next/image unavailable in offline bundle */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="dibay-startup-logo"
        src={logoSrc}
        width={72}
        height={72}
        alt=""
        style={{ width: 72, height: 72, objectFit: "contain" }}
      />
      {cfg.showWordmark ? (
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", color: "#0B421A" }}>
          {cfg.wordmark || "DIBAY"}
        </p>
      ) : null}
      {cfg.showSpinner ? (
        <div
          aria-hidden
          style={{
            width: 22,
            height: 22,
            borderRadius: 9999,
            border: "2px solid rgba(11,66,26,0.22)",
            borderTopColor: "#0B421A",
            animation: "dibay-spin 0.8s linear infinite",
          }}
        />
      ) : null}
      <style>{`@keyframes dibay-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function LocalRuntimeAppShell({
  path,
  onNavigate,
  sessionLabel,
  bodyStatus,
}: {
  path: string;
  onNavigate: (href: string) => void;
  sessionLabel: string;
  bodyStatus: string;
}) {
  const active = useMemo(() => {
    const hit = BOTTOM_NAV_ITEMS.find((t) => path === t.href || path.startsWith(t.href.split("?")[0]!));
    return hit?.id ?? BOTTOM_NAV_ITEMS[0]?.id;
  }, [path]);

  const title =
    BOTTOM_NAV_ITEMS.find((t) => t.id === active)?.label ??
    BOTTOM_NAV_ITEMS[0]?.label ??
    "DIBAY";

  return (
    <div
      id="dibay-local-runtime-appshell"
      data-local-runtime-appshell="1"
      data-app-shell="1"
      className="app-shell"
      style={{
        minHeight: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--sam-bg-app, #FFFCFC)",
        color: "var(--sam-fg, #0B421A)",
      }}
    >
      <header
        data-local-runtime-header="1"
        className="chat-header"
        style={{
          flex: "0 0 auto",
          padding: "calc(12px + env(safe-area-inset-top,0px)) 16px 12px",
          borderBottom: "1px solid var(--sam-border, #E6EBE8)",
          background: "var(--sam-surface, #fff)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          minHeight: 52,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "var(--sam-muted, #5C6B63)" }}>{sessionLabel}</div>
      </header>
      <main
        data-local-runtime-main="1"
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          padding: 16,
          overflow: "auto",
        }}
      >
        <p style={{ margin: 0, fontSize: 14, color: "var(--sam-muted, #5C6B63)" }}>{bodyStatus}</p>
      </main>
      <nav
        id="dibay-startup-nav"
        data-local-runtime-bottom-nav="1"
        aria-label="Main"
        className="app-bottom-nav-shell"
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "stretch",
          justifyContent: "space-around",
          gap: 2,
          padding: "6px 4px calc(6px + env(safe-area-inset-bottom,0px))",
          borderTop: "1px solid var(--sam-border, #E6EBE8)",
          background: "var(--sam-surface, #fff)",
          minHeight: "calc(56px + env(safe-area-inset-bottom,0px))",
        }}
      >
        {BOTTOM_NAV_ITEMS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              data-href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className="app-bottom-nav-item"
              onClick={() => onNavigate(tab.href)}
              style={{
                appearance: "none",
                border: 0,
                background: "transparent",
                color: isActive ? "var(--sam-primary, #0B421A)" : "var(--sam-muted, #5C6B63)",
                flex: "1 1 0",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                padding: "4px 2px",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <NavIcon icon={tab.icon} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function LocalRuntimeApp({ logoSrc }: { logoSrc: string }) {
  const [introVisible, setIntroVisible] = useState(true);
  const [path, setPath] = useState(() => {
    try {
      return localStorage.getItem("dibay:startup:route") || BOTTOM_NAV_ITEMS[0]?.href || "/philife";
    } catch {
      return BOTTOM_NAV_ITEMS[0]?.href || "/philife";
    }
  });
  const [sessionLabel, setSessionLabel] = useState("");
  const [bodyStatus, setBodyStatus] = useState("Starting…");
  const [fatal, setFatal] = useState(false);
  const [shellReady, setShellReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    window.__DIBAY_LOCAL_RUNTIME__ = true;
    advance("LOCAL_RUNTIME_LOADING");
    advance("LOCAL_RUNTIME_PAINTED");
    advance("INTRO_VISIBLE");
    setShellReady(true);
    advance("LOCAL_SHELL_READY");
    dismissNativeSplash();
  }, []);

  useEffect(() => {
    if (!shellReady) return;
    advance("SESSION_RESTORING");
    let cancelled = false;
    void (async () => {
      try {
        const sb = createLocalRuntimeSupabaseClient();
        if (!sb) {
          if (!cancelled) {
            setSessionLabel("Guest");
            setBodyStatus("Local Runtime ready · session unavailable (offline or missing keys)");
          }
        } else {
          const { data } = await sb.auth.getSession();
          if (cancelled) return;
          const email = data.session?.user?.email;
          setSessionLabel(email ? email.split("@")[0]! : data.session ? "Signed in" : "Guest");
          setBodyStatus(
            data.session
              ? "Local Runtime ready · session restored"
              : "Local Runtime ready · sign in when online"
          );
        }
      } catch (e) {
        if (!cancelled) {
          setSessionLabel("Guest");
          setBodyStatus(`Local Runtime ready · session error: ${String(e)}`);
        }
      }

      if (cancelled) return;
      if (
        resolveLocalRuntimeAppReady({
          localRootMounted: true,
          localAppShellPaintReady: true,
          fatalStartupError: fatal,
        })
      ) {
        advance("APP_READY");
        setIntroVisible(false);
        advance("INTRO_REMOVED");
        advance("REMOTE_DATA_SYNC");
        const origin = window.__DIBAY_REMOTE_API_ORIGIN__ || "";
        if (origin) {
          try {
            void fetch(`${origin}/api/app/startup-config`, {
              method: "GET",
              credentials: "omit",
              cache: "no-store",
            });
          } catch {
            /* offline ok */
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shellReady, fatal]);

  const onNavigate = useCallback((href: string) => {
    setPath(href);
    try {
      localStorage.setItem("dibay:startup:route", href);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("dibay:local-runtime-route", { detail: { path: href } }));
  }, []);

  useEffect(() => {
    const onErr = () => setFatal(true);
    window.addEventListener("error", onErr);
    return () => window.removeEventListener("error", onErr);
  }, []);

  return (
    <>
      <LocalRuntimeAppShell
        path={path}
        onNavigate={onNavigate}
        sessionLabel={sessionLabel}
        bodyStatus={mounted ? bodyStatus : "…"}
      />
      <LocalRuntimeIntro visible={introVisible} logoSrc={logoSrc} />
    </>
  );
}

export function mountLocalRuntimeApp(opts: { logoSrc: string; mountEl: HTMLElement }): void {
  // Ban remote document replace for this session.
  try {
    const origin = window.__DIBAY_REMOTE_API_ORIGIN__ || "";
    const orig = location.replace.bind(location);
    location.replace = (url: string | URL) => {
      const s = String(url);
      if (/^https?:\/\//i.test(s) && origin && s.startsWith(origin)) {
        console.error("[dibay-local-runtime] blocked remote document replace", s);
        return;
      }
      return orig(url);
    };
  } catch {
    /* ignore */
  }

  const root = createRoot(opts.mountEl);
  root.render(
    <StrictMode>
      <LocalRuntimeApp logoSrc={opts.logoSrc} />
    </StrictMode>
  );
}

const el = document.getElementById("dibay-local-runtime-react-root");
if (el) {
  const logo =
    (document.querySelector("meta[name='dibay-local-logo']") as HTMLMetaElement | null)?.content ||
    BUNDLED_STARTUP_CONFIG.logoUrl;
  mountLocalRuntimeApp({ logoSrc: logo, mountEl: el });
}
