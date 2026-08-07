"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminWorkspaceDescriptor } from "@/lib/admin/admin-workspace-routing";

export function AdminWorkspaceNav({
  workspaces,
  activeId,
  onNavigate,
}: {
  workspaces: AdminWorkspaceDescriptor[];
  activeId: string;
  onNavigate?: (path: string) => void;
}) {
  const { t } = useI18n();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const overflow = useMemo(() => workspaces.length > 8, [workspaces.length]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [activeId, workspaces.length]);

  return (
    <div className="admin-workspace-nav relative flex min-w-0 flex-1 items-center gap-1">
      <div
        ref={scrollerRef}
        className="admin-workspace-nav__scroll flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={t("admin_shell_workspace_nav")}
      >
        {workspaces.map((ws) => {
          const active = ws.id === activeId;
          return (
            <Link
              key={ws.key}
              href={ws.rootPath}
              prefetch={false}
              role="tab"
              aria-selected={active}
              className={[
                "admin-workspace-nav__tab shrink-0 whitespace-nowrap rounded-sm px-3 py-2 text-[13px] font-semibold leading-5 tracking-wide transition-colors min-h-9 inline-flex items-center",
                active
                  ? "admin-workspace-nav__tab--active"
                  : "admin-workspace-nav__tab--idle",
              ].join(" ")}
              onClick={() => onNavigate?.(ws.rootPath)}
            >
              {t(ws.titleKey)}
            </Link>
          );
        })}
      </div>
      {overflow ? (
        <div className="relative shrink-0 xl:hidden">
          <button
            type="button"
            className="admin-workspace-nav__more inline-flex h-8 items-center rounded-sm border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2 text-xs font-semibold text-[var(--admin-console-fg)]"
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {t("admin_shell_workspace_more")}
          </button>
          {menuOpen ? (
            <ul
              className="absolute right-0 top-full z-40 mt-1 max-h-72 w-56 overflow-y-auto rounded-sm border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] py-1 shadow-md"
              role="listbox"
            >
              {workspaces.map((ws) => (
                <li key={`more-${ws.key}`}>
                  <Link
                    href={ws.rootPath}
                    prefetch={false}
                    className={[
                      "block truncate px-3 py-2 text-sm",
                      ws.id === activeId
                        ? "bg-[var(--admin-console-active-bg)] font-semibold text-[var(--admin-console-accent)]"
                        : "text-[var(--admin-console-fg)] hover:bg-[var(--admin-console-hover)]",
                    ].join(" ")}
                    onClick={() => {
                      onNavigate?.(ws.rootPath);
                      setMenuOpen(false);
                    }}
                  >
                    {t(ws.titleKey)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
