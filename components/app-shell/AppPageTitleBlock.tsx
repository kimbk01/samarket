import type { ReactNode } from "react";

export type AppPageTitleBlockProps = {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
};

export function AppPageTitleBlock({ title, description, className }: AppPageTitleBlockProps) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`.trim()}>
      <h1 className="sam-text-page-title">{title}</h1>
      {description != null ? <p className="sam-text-body-secondary">{description}</p> : null}
    </div>
  );
}
