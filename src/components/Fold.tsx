import type { ReactNode } from "react";

/**
 * A tap-to-open section, closed by default — keeps long screens short.
 * `summary` is a short hint shown next to the title while closed (e.g. "≈ $4.76").
 */
export default function Fold({ title, summary, children, className = "", open }: { title: string; summary?: ReactNode; children: ReactNode; className?: string; open?: boolean }) {
  return (
    <details className={`fold ${className}`.trim()} open={open}>
      <summary>
        <span className="fold-title">{title}</span>
        {summary && <span className="fold-summary muted small">{summary}</span>}
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}
