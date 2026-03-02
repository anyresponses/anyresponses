import type { NextConfig } from "next";

const docsContentGlob = "src/app/docs/content/**/*";

const nextConfig: NextConfig = {
	outputFileTracingIncludes: {
		"/docs/**": [docsContentGlob],
	},
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
