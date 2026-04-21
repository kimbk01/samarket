import Link from "next/link";

type QuickActionItem = {
  label: string;
  href: string;
  caption?: string;
};

export function MyPageQuickActions({ items }: { items: QuickActionItem[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Link
          key={`${item.label}:${item.href}`}
          href={item.href}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 transition-colors hover:bg-sam-app"
        >
          <p className="sam-text-body font-semibold text-sam-fg">{item.label}</p>
          <p className="mt-1 sam-text-helper text-sam-muted">{item.caption ?? "바로 이동"}</p>
        </Link>
      ))}
    </div>
  );
}
