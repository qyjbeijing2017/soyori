import { CliError } from "./protocol.js";

export type Assignment = readonly [string, string | number | boolean | null];

/** Parse scalar overrides only; object and array input stays in JSON files/stdin. */
export function parseAssignment(text: string, forceString = false): Assignment {
  const separator = text.indexOf("=");
  if (separator < 1)
    throw new CliError("INVALID_ARGUMENT", "Expected a nonempty field name followed by =value.");
  const key = text.slice(0, separator);
  const value = text.slice(separator + 1);
  if (forceString) return [key, value];
  if (value === "true" || value === "false") return [key, value === "true"];
  if (value === "null") return [key, null];
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(value)) {
    const number = Number(value);
    if (!Number.isFinite(number) || (Number.isInteger(number) && !Number.isSafeInteger(number))) {
      throw new CliError(
        "INVALID_ARGUMENT",
        `Numeric value for ${key} is out of range; use --set-string to keep it as text.`,
      );
    }
    return [key, number];
  }
  return [key, value];
}
