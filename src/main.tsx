import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { applyTextSize, getTextSize } from "./lib/textSize";
import { applyTheme, getTheme } from "./lib/theme";
import { keepSheetsAboveKeyboard } from "./lib/keyboard";
import { installErrorReporting } from "./lib/errorReport";
import { captureInstallPrompt } from "./lib/homeScreen";
import ErrorBoundary from "./components/ErrorBoundary";
import { catchSharedLink } from "./lib/shareTarget";

applyTextSize(getTextSize());
applyTheme(getTheme(), false);
keepSheetsAboveKeyboard();
installErrorReporting();
captureInstallPrompt();
catchSharedLink(); // a recipe link shared to Cardamix from another app

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Offline support: cache the app so saved recipes open without a connection.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
