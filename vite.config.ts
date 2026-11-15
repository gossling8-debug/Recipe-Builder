import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps every asset path relative, so the same build works at
// https://<user>.github.io/<repo>/ (GitHub Pages) or at the root of any host.
export default defineConfig({
  base: "./",
  plugins: [react()],
  // Which build an error report came from (UTC date and time of the build).
  define: { __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16)) },
});
