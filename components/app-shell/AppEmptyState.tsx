import type { ReactNode } from "react";

export type AppEmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function AppEmptyState({ title, description, action, className }: AppEmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-sam-md border border-dashed border-sam-border bg-sam-surface-muted px-6 py-12 text-center ${className ?? ""}`.trim()}
    >
      <p className="sam-text-body-lg text-sam-fg">{title}</p>
      {description != null ? <p className="max-w-sm sam-text-body-secondary">{description}</p> : null}
      {action != null ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
