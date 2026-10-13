import { stringify } from "yaml";
import { RuntimeError } from "./errors.js";
import { parseReference } from "./operands.js";
import { copyJson } from "./values.js";

type Part = { text: string } | { reference: string; indent: string };

/** Template syntax is distinct from operands; parse references with the same path rules. */
export function parseTemplate(source: string): Part[] {
  const parts: Part[] = [];
  let text = "";
  for (let i = 0; i < source.length; ) {
    if (source[i] !== "$") {
      text += source[i++];
      continue;
    }
    if (source[i + 1] === "$") {
      text += "$";
      i += 2;
      continue;
    }
    const start = i++;
    let quoted = false;
    for (; i < source.length; i++) {
      if (quoted && source[i] === "\\") {
        i++;
        continue;
      }
      if (source[i] === '"') quoted = !quoted;
      if (!quoted && source[i] === "$") break;
    }
    if (i === source.length)
      throw new RuntimeError(
        "INVALID_TEXT",
        `Unclosed template reference at character ${start + 1}. Use $$ for a literal $.`,
      );
    const reference = source.slice(start, i);
    parseReference(reference);
    const prefix = source.slice(source.lastIndexOf("\n", start - 1) + 1, start);
    const end = source.indexOf("\n", i + 1);
    const suffix = source.slice(i + 1, end < 0 ? source.length : end);
    const indent = /^[ \t]*$/.test(prefix) && /^[ \t\r]*$/.test(suffix) ? prefix : "";
    parts.push({ text }, { reference, indent });
    text = "";
    i++;
  }
  parts.push({ text });
  return parts;
}

export function renderTemplate(source: string, read: (reference: string) => unknown): string {
  return parseTemplate(source)
    .map((part) => {
      if ("text" in part) return part.text;
      const value = read(part.reference);
      if (value === undefined) return "";
      let text: string;
      try {
        text =
          typeof value === "string"
            ? value
            : stringify(copyJson(value), { lineWidth: 0 }).trimEnd();
      } catch {
        throw new RuntimeError(
          "INVALID_TEXT",
          `Template variable ${part.reference} cannot be rendered as text.`,
          undefined,
          part.reference,
        );
      }
      return part.indent ? text.replace(/\r?\n/g, (newline) => newline + part.indent) : text;
    })
    .join("");
}
