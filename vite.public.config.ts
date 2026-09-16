import vinext from "vinext";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig(async () => {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED = "false";
  process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
  process.env.WRANGLER_SEND_METRICS = "false";
  process.env.WRANGLER_WRITE_LOGS = "false";
  process.env.WRANGLER_LOG_PATH = ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH = ".wrangler/public-dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH = ".wrangler/public-registry";
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    envDir: fileURLToPath(new URL("./cloudflare", import.meta.url)),
    build: { outDir: "dist-public" },
    environments: { client: { build: { outDir: "dist-public/client" } } },
    plugins: [
      vinext({ rscOutDir: "dist-public/server", ssrOutDir: "dist-public/server/ssr" }),
      cloudflare({
        configPath: "cloudflare/wrangler.jsonc",
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        remoteBindings: false,
      }),
    ],
  };
});
