/** Import specifiers are URL paths, including escaped filename characters. */
export function relativeModulePath(source: string, target: string) {
  const base = source.split("/").slice(0, -1);
  const parts = target.split("/");
  while (base.length && parts.length && base[0] === parts[0]) {
    base.shift();
    parts.shift();
  }
  const relative =
    "../".repeat(base.length) +
    parts.map((part) => encodeURIComponent(part).replaceAll("'", "%27")).join("/");
  return relative.startsWith("../") ? relative : `./${relative}`;
}
