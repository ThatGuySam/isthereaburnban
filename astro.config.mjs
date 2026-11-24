import { defineConfig } from "astro/config";

// Fully static build. Dynamic status is injected by the Worker (src/worker) via HTMLRewriter.
export default defineConfig({
  site: "https://isthereaburnban.com",
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
});
