"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ManagedMyCtaLink } from "@/lib/my/managed-my-section-ctas";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import { resolveManagedMyCtaActive } from "@/lib/my/resolve-managed-my-cta-active";
import {
  DIBAY_CHROME_SECONDARY_HOST_CLASS,
  DIBAY_SECONDARY_TABS_CLASS,
  dibaySecondaryTabClass,
} from "@/lib/ui/dibay-secondary-tabs";

type Props = {
  links: ManagedMyCtaLink[];
  /** 비우면 라벨 행 없음(기본 없음) */
  label?: string | null;
};

/**
 * MyPage section navigation strip — TRUE PAGE NAV (href section switch).
 * Visual authority: dibay-secondary-tabs + domain surface host.
 * Menu labels / hrefs remain caller responsibility (`getManagedSectionCtas`).
 */
export function MyManagedCtaStrip({ links, label }: Props) {
  const pathname = usePathname() ?? "";

  if (links.length === 0) return null;

  const labelText = typeof label === "string" ? label.trim() : "";

  return (
    <div className={`${DIBAY_CHROME_SECONDARY_HOST_CLASS} w-full`}>
      <div className={`${APP_MAIN_HEADER_INNER_CLASS} min-w-0`}>
        {labelText ? (
          <p className="mb-1.5 px-1 sam-text-xxs font-semibold uppercase tracking-wide text-sam-muted">
            {labelText}
          </p>
        ) : null}
        <div className={DIBAY_SECONDARY_TABS_CLASS} role="tablist" data-mypage-managed-section-nav="1">
          {links.map((item) => {
            const active = resolveManagedMyCtaActive(pathname, item.href);
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                prefetch={false}
                role="tab"
                aria-selected={active}
                aria-current={active ? "page" : undefined}
                className={dibaySecondaryTabClass(active)}
              >
                <span className="max-w-[min(10rem,40vw)] truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
