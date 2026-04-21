import Link from "next/link";
import type { ReactNode } from "react";
import type { MyServiceRow } from "@/lib/my/types";

export type DashboardAction = {
  href: string;
  title: string;
  description: string;
  badge?: string | null;
  tone?: "default" | "accent" | "dark";
};

export function serviceDescription(service: MyServiceRow): string {
  switch (service.code) {
    case "products":
      return "올린 상품을 다시 정리하고 판매 상태를 확인해요.";
    case "ads":
      return "광고 신청과 노출 확장을 관리해요.";
    case "points":
      return "포인트 내역과 혜택을 관리해요.";
    case "benefits":
      return "회원 전용 혜택과 이벤트를 확인해요.";
    case "reviews":
      return "받은 후기와 신뢰도를 점검해요.";
    case "regions":
      return "동네와 활동 지역을 조정해요.";
    case "blocked":
      return "차단한 사용자와 숨김 대상을 관리해요.";
    default:
      return "내정보에서 자주 찾는 관리 도구로 바로 이동해요.";
  }
}

export function ActionSection({
  title,
  description,
  children,
  collapsible = false,
  isExpanded = true,
  onToggle,
  itemCount,
}: {
  title: string;
  description: string;
  children: ReactNode;
  collapsible?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
  itemCount?: number;
}) {
  const contentId = `section-${title.replace(/\s+/g, "-")}`;

  return (
    <section className="space-y-2">
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={contentId}
          className="flex w-full items-start justify-between gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-4 text-left shadow-[0_6px_24px_rgba(15,23,42,0.05)] active:bg-sam-primary-soft"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="sam-text-body-lg font-semibold text-foreground md:sam-text-section-title">{title}</h2>
              {itemCount != null ? (
                <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 sam-text-xxs font-medium text-[#4B5563]">
                  {itemCount}
                </span>
              ) : null}
            </div>
            <p className="mt-1 sam-text-helper leading-relaxed text-muted">{description}</p>
            <p className="mt-2 sam-text-helper font-medium text-signature">{isExpanded ? "접기" : "펼쳐서 보기"}</p>
          </div>
          <ExpandChevronIcon expanded={isExpanded} />
        </button>
      ) : (
        <div className="px-1">
          <h2 className="sam-text-body-lg font-semibold text-foreground md:sam-text-section-title">{title}</h2>
          <p className="mt-1 sam-text-helper leading-relaxed text-muted">{description}</p>
        </div>
      )}
      {(!collapsible || isExpanded) && (
        <div id={contentId} className="space-y-2">
          {children}
        </div>
      )}
    </section>
  );
}

export function FeatureActionList({ actions }: { actions: DashboardAction[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {actions.map((action) => (
        <ActionTile key={action.href + action.title} action={action} featured />
      ))}
    </div>
  );
}

export function ActionGrid({ actions }: { actions: DashboardAction[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {actions.map((action) => (
        <ActionTile key={action.href + action.title} action={action} />
      ))}
    </div>
  );
}

function ActionTile({
  action,
  featured = false,
}: {
  action: DashboardAction;
  featured?: boolean;
}) {
  const toneClass =
    action.tone === "accent"
      ? "border-signature/20 bg-signature/5"
      : action.tone === "dark"
        ? "border-[#111827] bg-[#111827] text-white"
        : "border-sam-border bg-sam-surface";
  const titleClass = action.tone === "dark" ? "text-white" : "text-foreground";
  const descClass = action.tone === "dark" ? "text-white/70" : "text-muted";
  const badgeClass =
    action.tone === "dark" ? "bg-sam-surface/15 text-white" : "bg-[#F3F4F6] text-foreground";
  const paddingClass = featured ? "min-h-[88px] py-4 md:min-h-0 md:py-5" : "py-3.5 md:py-4";

  return (
    <Link
      href={action.href}
      className={`flex h-full items-start justify-between gap-3 rounded-ui-rect border px-4 ${paddingClass} ${toneClass} active:translate-y-[1px]`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`sam-text-body font-semibold ${titleClass}`}>{action.title}</p>
          {action.badge ? (
            <span className={`rounded-full px-2 py-0.5 sam-text-xxs font-semibold ${badgeClass}`}>
              {action.badge}
            </span>
          ) : null}
        </div>
        <p className={`mt-1 sam-text-helper leading-relaxed ${descClass}`}>{action.description}</p>
      </div>
      <ChevronIcon className={action.tone === "dark" ? "text-white/70" : "text-muted"} />
    </Link>
  );
}

export function HighlightLink({
  href,
  label,
  sublabel,
}: {
  href: string;
  label: string;
  sublabel: string;
}) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1 text-center">
      <span className="flex h-[64px] w-[64px] items-center justify-center rounded-full border border-sam-border bg-[linear-gradient(180deg,#ffffff_0%,#f6f7f9_100%)] sam-text-body font-semibold text-foreground shadow-[0_4px_12px_rgba(15,23,42,0.06)] md:h-[72px] md:w-[72px]">
        {label.slice(0, 2)}
      </span>
      <span className="sam-text-helper font-medium text-foreground">{label}</span>
      <span className="sam-text-xxs text-muted">{sublabel}</span>
    </Link>
  );
}

export function InfoShortcutCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3.5 active:bg-sam-primary-soft"
    >
      <div className="min-w-0 flex-1 pr-3">
        <p className="sam-text-body font-medium text-foreground">{title}</p>
        <p className="mt-1 sam-text-helper leading-relaxed text-muted">{description}</p>
      </div>
      <ChevronIcon className="text-muted" />
    </Link>
  );
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`shrink-0 ${className}`.trim()}
      aria-hidden
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ExpandChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`mt-1 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
