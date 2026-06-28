import { resolve } from "node:path";
import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const repositoryRoot = resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  reactStrictMode: true,
  productionBrowserSourceMaps: true,
  output: "standalone",
  outputFileTracingRoot: repositoryRoot,
  outputFileTracingIncludes: {
    "/**": ["./public/locales/**/*"],
  },
  turbopack: {
    root: repositoryRoot,
  },
  serverExternalPackages: ["@napi-rs/canvas", "@napi-rs/webcodecs"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "api.iconify.design",
      },
      {
        protocol: "https",
        hostname: "api.simplesvg.com",
      },
      {
        protocol: "https",
        hostname: "api.unisvg.com",
      },
    ],
  },
};

export default withBotId(nextConfig);
