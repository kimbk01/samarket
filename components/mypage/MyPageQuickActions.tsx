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
          className="rounded-ui-rect border border-gray-200 bg-white px-3 py-3 transition-colors hover:bg-gray-50"
        >
          <p className="text-[14px] font-semibold text-gray-900">{item.label}</p>
          <p className="mt-1 text-[12px] text-gray-500">{item.caption ?? "바로 이동"}</p>
        </Link>
      ))}
    </div>
  );
}
