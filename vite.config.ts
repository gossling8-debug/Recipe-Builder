import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Which build this is (UTC date and time): shown in error reports, and
// written to version.json so an app left open can tell a newer one is out.
const BUILD = new Date().toISOString().slice(0, 19);

const versionFile = (): Plugin => ({
  name: "version-file",
  apply: "build",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD }) });
  },
});

// base "./" keeps every asset path relative, so the same build works at
// https://<user>.github.io/<repo>/ (GitHub Pages) or at the root of any host.
export default defineConfig({
  base: "./",
  plugins: [react(), versionFile()],
  define: { __APP_BUILD__: JSON.stringify(BUILD) },
});
