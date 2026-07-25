import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile in a parent directory makes Next infer the wrong
  // workspace root. Pin it to this project.
  turbopack: {
    root: __dirname,
  },
  // Resume text extraction (server-only). Keep these native/pdfjs-heavy
  // packages out of the bundler so they load as normal Node modules.
  serverExternalPackages: ["pdf-parse", "mammoth", "pdfjs-dist"],
};

export default nextConfig;
