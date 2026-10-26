// Transpiles lib/swipe/swipeStore.tsx and everything it value-imports into
// ./out next to this file (ESM .js), rewriting "@/" and relative specifiers.
// Bare specifiers (react, ...) are resolved from the repo by loader.mjs.
//
// Usage: node scripts/store-sync-harness/build.mjs [sourceRoot]
//   sourceRoot defaults to this repo's working tree. Pass another checkout
//   (e.g. a `git archive` of an older commit) to run the harness against it.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, "../..");
const SRC = path.resolve(process.argv[2] ?? REPO);
const OUT = path.join(HERE, "out");

function findSource(p) {
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (fs.existsSync(p + ext)) return p + ext;
  }
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  throw new Error("cannot resolve " + p);
}
const outPathOf = (src) =>
  path.join(OUT, path.relative(SRC, src)).replace(/\.tsx?$/, ".js");

fs.rmSync(OUT, { recursive: true, force: true });
const queue = [path.join(SRC, "lib/swipe/swipeStore.tsx")];
const done = new Set();
while (queue.length) {
  const src = queue.pop();
  if (done.has(src)) continue;
  done.add(src);
  const { outputText } = ts.transpileModule(fs.readFileSync(src, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      verbatimModuleSyntax: false,
      isolatedModules: true,
    },
    fileName: src,
  });
  const outFile = outPathOf(src);
  const rewritten = outputText.replace(
    /(from\s+|import\s+)(["'])([^"']+)\2/g,
    (m, kw, q, spec) => {
      let target;
      if (spec.startsWith("@/")) target = findSource(path.join(SRC, spec.slice(2)));
      else if (spec.startsWith(".")) target = findSource(path.resolve(path.dirname(src), spec));
      else return m;
      queue.push(target);
      let rel = path.relative(path.dirname(outFile), outPathOf(target));
      if (!rel.startsWith(".")) rel = "./" + rel;
      return `${kw}${q}${rel}${q}`;
    },
  );
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, rewritten);
}
fs.writeFileSync(path.join(OUT, "package.json"), JSON.stringify({ type: "module" }));
console.log(`transpiled ${done.size} files from ${path.relative(REPO, SRC) || "the repo"}`);
