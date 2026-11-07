import type { ReactNode } from "react";
import Icon from "./Icon";

export default function Header({ title, back, actions }: { title: string; back?: string; actions?: ReactNode }) {
  return (
    <header className="topbar">
      {back ? (
        <a className="icon-btn" href={back} aria-label="Back">
          <Icon name="back" />
        </a>
      ) : (
        <span className="icon-btn placeholder" aria-hidden />
      )}
      <h1>{title}</h1>
      <div className="topbar-actions">{actions}</div>
    </header>
  );
}
