"use client";

import { useState } from "react";

interface AdminAuditJsonViewerProps {
  label: string;
  data: string | Record<string, unknown> | undefined;
}

function formatJson(data: string | Record<string, unknown> | undefined): string {
  if (data === undefined || data === null) return "-";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export function AdminAuditJsonViewer({ label, data }: AdminAuditJsonViewerProps) {
  const [open, setOpen] = useState(false);
  const text = formatJson(data);

  if (text === "-") return null;

  return (
    <div className="rounded border border-gray-100 bg-gray-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] font-medium text-gray-700 hover:bg-gray-100"
      >
        {label}
        <span className="text-gray-500">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <pre className="max-h-48 overflow-auto border-t border-gray-100 px-3 py-2 text-[12px] text-gray-600 whitespace-pre-wrap break-all">
          {text}
        </pre>
      )}
    </div>
  );
}
