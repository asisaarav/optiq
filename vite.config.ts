// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import path from "node:path";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: [
        // alasql ships a "node" export that pulls in react-native via its fs build.
        // Force the browser bundle everywhere so SSR/Worker bundling doesn't choke.
        { find: /^alasql$/, replacement: "alasql/dist/alasql.min.js" },
        // Belt-and-braces: if anything still references react-native, shim to empty.
        { find: /^react-native$/, replacement: path.resolve(__dirname, "src/shims/empty.ts") },
      ],
    },
  },
});
