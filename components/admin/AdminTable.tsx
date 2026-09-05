"use client";

/**
 * Legacy thin table wrapper. Management lists should use
 * `AdminManagementTableViewport` (ARO-OPS-UX-001-W1) as the X-overflow owner.
 */
export function AdminTable({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto" data-admin-table-legacy="1">
      <table className="w-full min-w-[600px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            {headers.map((h) => (
              <th
                key={h}
                className="px-3 py-2.5 text-left font-medium text-sam-fg"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export { AdminManagementTableViewport } from "@/components/admin/management/AdminManagementTableViewport";
