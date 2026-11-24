import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";

// Fully static build. Dynamic status is injected by the Worker (src/worker) via HTMLRewriter.
// Preact (with the React compat layer, for Vaul) runs one island only: src/components/Sheets.tsx.
export default defineConfig({
  site: "https://isthereaburnban.com",
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [preact({ compat: true })],
});
