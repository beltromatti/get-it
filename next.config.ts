import type { NextConfig } from "next";
import path from "node:path";
import { createRequire } from "node:module";

// Bake the current package.json version into the client bundle as
// NEXT_PUBLIC_APP_VERSION. In CI the release workflow updates
// package.json from the pushed git tag *before* `next build` runs,
// so this env value is the same one electron-builder uses for the
// app's CFBundleShortVersionString / exe properties — single source
// of truth for the whole release pipeline.
const pkg = createRequire(import.meta.url)("./package.json") as {
  version: string;
};

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  // Self-contained server output. `next build` writes a runnable
  // .next/standalone/server.js with a trimmed node_modules tree — exactly
  // what we ship inside the Electron app. The Electron main process
  // launches it as a child node process on a free port; in pure-Next dev
  // (`next dev`) this setting is a no-op.
  output: "standalone",
  // pdfjs-dist dynamically imports its worker via `import(this.workerSrc)`
  // with `webpackIgnore: true`. Next's standalone tracer can't see that,
  // so we tell it explicitly to include the worker file in the bundle.
  // Same for the codex platform binary, which lives in optionalDeps.
  outputFileTracingIncludes: {
    "**/*": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      "./node_modules/@openai/codex/bin/codex.js",
      "./node_modules/@earendil-works/pi-coding-agent/**/*",
      // pdfkit (Markdown→PDF importer) reads its standard-font metrics from
      // `__dirname + '/data/*.afm'` at runtime. Previously pdfkit was only
      // used by build-time scripts, so those data files were never traced
      // into the standalone bundle — now the upload route renders Markdown,
      // so they must ship or rendering throws ENOENT in the packaged app.
      "./node_modules/pdfkit/js/data/*.afm",
    ],
  },
  // Keep the tracer out of paths the Next.js server never needs at
  // runtime. The default tracer is intentionally over-inclusive (it
  // copies any file under `outputFileTracingRoot` that could plausibly
  // be referenced), so leaving these in turns the standalone bundle
  // from ~500 MB into ~4 GB — and on Windows that's enough to push the
  // NSIS installer past the macroline-level `failed creating mmap`
  // failure. `dist-electron/**` is the worst offender (a recursive
  // self-include of previous build outputs); `electron/**` ships the
  // ~200 MB platform Codex binary that the Electron shell wires up
  // separately and that the Next server doesn't import.
  outputFileTracingExcludes: {
    "**/*": [
      "dist-electron/**",
      "electron/**",
      "scripts/**",
      ".next/cache/**",
      "README.md",
      "AGENTS.md",
      "CLAUDE.md",
      "LICENSE",
      "hero.gif",
      "technical-writeup.md",
      "technical-writeup.pdf",
      "eslint.config.mjs",
      "postcss.config.mjs",
      "tsconfig.json",
      "tsconfig.tsbuildinfo",
      "next.config.ts",
    ],
  },
  // Allow longer payloads for PDF uploads (default body limit is 1 MB).
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  // Pin pdfjs and the Codex SDK as external packages so their native /
  // platform-specific assets (pdfjs workers, codex binary in vendor/)
  // resolve from node_modules at runtime instead of being inlined by
  // webpack.
  //
  // pdfkit (Markdown→PDF importer) MUST be external too: it loads its
  // standard-font metrics with `fs.readFileSync(__dirname + '/data/*.afm')`.
  // If webpack inlines it, `__dirname` becomes the server-chunk directory and
  // the AFM read misses the data files entirely. Keeping it external means
  // `__dirname` stays node_modules/pdfkit/js, right next to the traced data.
  serverExternalPackages: [
    "pdfjs-dist",
    "@openai/codex-sdk",
    "@openai/codex",
    "pdfkit",
    // MathJax (LaTeX in imported Markdown) is a large CJS tree; resolve it
    // from node_modules like pdfkit instead of inlining it into the bundle.
    "mathjax-full",
    "svg-to-pdfkit",
  ],
};

export default nextConfig;
