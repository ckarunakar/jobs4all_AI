import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile in a parent directory makes Next infer the wrong
  // workspace root. Pin it to this project.
  turbopack: {
    root: __dirname,
  },
  // Resume text extraction (server-only). Keep these native/pdfjs-heavy
  // packages out of the bundler so they load as normal Node modules.
  // mssql too: bundling it per layer (pages vs route handlers) makes two driver instances share the one globalThis pool → "type.validate is not a function".
  serverExternalPackages: ["pdf-parse", "mammoth", "pdfjs-dist", "mssql"],
};

export default nextConfig;
