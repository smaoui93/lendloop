import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // All data is live via Convex on the client, so Cache Components are not used.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
