import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default Cloudflare preset: no incremental cache needed for a fully static app,
// but OpenNext still gives us the Workers runtime shim so future dynamic routes
// work without re-plumbing the deploy.
export default defineCloudflareConfig();
