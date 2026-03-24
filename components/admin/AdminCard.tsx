"use client";

export function AdminCard({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white ${className}`}>
      {title && (
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-[15px] font-medium text-gray-900">{title}</h2>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
