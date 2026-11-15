import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "../lib/errorReport";

/** If a screen crashes while drawing: a way back instead of a blank page (and a report). */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    const where = (info.componentStack ?? "").trim().split("\n")[0]?.trim().replace(/^at\s+/, "") || "render";
    reportError(error, where);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="page crash-screen" role="alert">
        <h1 className="page-title">Something went wrong</h1>
        <p>Sorry — this screen ran into a problem. Your recipes are safe. The problem has been reported so it can be fixed.</p>
        <div className="button-row">
          <button className="btn primary" onClick={() => location.reload()}>
            Reload
          </button>
          <button
            className="btn"
            onClick={() => {
              location.hash = "#/";
              location.reload();
            }}
          >
            Go to my recipes
          </button>
        </div>
      </main>
    );
  }
}
