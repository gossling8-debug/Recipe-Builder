import type { ReactNode } from "react";

export default function Header({ title, back, actions }: { title: string; back?: string; actions?: ReactNode }) {
  return (
    <header className="topbar">
      {back ? (
        <a className="icon-btn" href={back} aria-label="Back">
          ‹
        </a>
      ) : (
        <span className="icon-btn placeholder" aria-hidden />
      )}
      <h1>{title}</h1>
      <div className="topbar-actions">{actions}</div>
    </header>
  );
}
