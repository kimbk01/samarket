"use client";

import { useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

interface AdminAuditJsonViewerProps {
  label: string;
  data: unknown;
}

function formatJson(data: unknown): string {
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
    <div className="rounded border border-sam-border-soft bg-sam-app">
      <AdminActionButton
        variant="quiet"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full justify-between text-left text-sam-fg hover:no-underline"
      >
        {label}
        <span className="text-sam-muted">{open ? "▲" : "▼"}</span>
      </AdminActionButton>
      {open && (
        <pre className="max-h-48 overflow-auto border-t border-sam-border-soft px-3 py-2 sam-text-helper text-sam-muted whitespace-pre-wrap break-all">
          {text}
        </pre>
      )}
    </div>
  );
}
