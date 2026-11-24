import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// Fully static build. Dynamic status is injected by the Worker (src/worker) via HTMLRewriter.
// React is used for one island only (src/components/Sheets.tsx, the Vaul sheets).
export default defineConfig({
  site: "https://isthereaburnban.com",
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [react()],
});
