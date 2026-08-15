import path from "node:path";
import { defineConfig, type PluginOption, type UserConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

/**
 * OPTIQ build configuration.
 *
 * - TanStack Start (SSR + server functions) with the custom `src/server.ts` entry
 *   so every HTML response passes through the security-header wrapper.
 * - Nitro targets Cloudflare Workers ("cloudflare-module") for production builds;
 *   `wrangler deploy` picks up `dist/`.
 * - Tailwind v4 via the Vite plugin, path aliases from tsconfig.
 */
export default defineConfig(async ({ command }): Promise<UserConfig> => {
  const plugins: PluginOption[] = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
  ];

  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    plugins.push(
      nitro({
        preset: "cloudflare-module",
        output: { dir: "dist", serverDir: "dist/server", publicDir: "dist/client" },
        cloudflare: { nodeCompat: true, deployConfig: true },
      }),
    );
  }

  plugins.push(viteReact());

  return {
    plugins,
    css: { transformer: "lightningcss" },
    resolve: {
      alias: [
        { find: "@", replacement: path.resolve(__dirname, "src") },
        // alasql ships a "node" export that pulls in react-native via its fs build.
        // Force the browser bundle everywhere so SSR/Worker bundling doesn't choke.
        {
          find: /^alasql$/,
          replacement: path.resolve(__dirname, "node_modules/alasql/dist/alasql.min.js"),
        },
        { find: /^react-native$/, replacement: path.resolve(__dirname, "src/shims/empty.ts") },
      ],
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    server: { host: "::", port: 8080 },
  };
});
