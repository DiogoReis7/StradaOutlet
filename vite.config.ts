// Rebuilt to remove the private @lovable.dev/vite-tanstack-config wrapper so this
// project can be installed and built outside the Lovable platform.
// This reproduces, with public packages, what that wrapper used to set up:
//   - tanstackStart (TanStack Start SSR, server entry -> src/server.ts)
//   - nitro (server build target; Vercel/Netlify auto-detect this)
//   - viteReact (React plugin)
//   - tailwindcss (Tailwind v4 plugin)
//   - tsConfigPaths (so the "@/..." import alias from tsconfig.json keeps working)
//   - VitePWA (unchanged from before)
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (SSR error wrapper).
      server: { entry: "server" },
    }),
    nitro(),
    viteReact(),
    tailwindcss(),
    VitePWA({
      strategies: "generateSW",
      registerType: "autoUpdate",
      injectRegister: null,
      filename: "sw.js",
      devOptions: { enabled: false },
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "pds-html",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\.(?:js|css|png|jpg|jpeg|svg|webp|woff2)$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "pds-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
});
