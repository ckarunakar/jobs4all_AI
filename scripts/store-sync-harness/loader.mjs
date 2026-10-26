// Node resolve hook: bare specifiers (react, react-dom, ...) imported by the
// harness or the transpiled store in ./out resolve from this repo's
// node_modules, wherever the sources were transpiled from.
const REPO_PACKAGE_URL = new URL("../../package.json", import.meta.url).href;

export async function resolve(specifier, context, next) {
  const bare = !/^(\.|\/|file:|node:|data:)/.test(specifier);
  if (bare) return next(specifier, { ...context, parentURL: REPO_PACKAGE_URL });
  return next(specifier, context);
}
