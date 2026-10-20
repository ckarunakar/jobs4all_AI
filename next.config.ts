import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile in a parent directory makes Next infer the wrong
  // workspace root. Pin it to this project.
  turbopack: {
    root: __dirname,
  },
  // Resume text extraction (server-only). Keep these native/pdfjs-heavy
  // packages out of the bundler so they load as normal Node modules.
  // mssql too: bundled per server layer (pages vs route handlers) it yields two
  // driver instances sharing one globalThis pool → "parameter.type.validate is
  // not a function". Externals load via one Node require cache, so every layer
  // gets the same instance. Deploy: externals resolve through .next/node_modules
  // symlinks, so build on the server (or keep them); to roll back, remove "mssql".
  serverExternalPackages: ["pdf-parse", "mammoth", "pdfjs-dist", "mssql"],
};

export default nextConfig;
