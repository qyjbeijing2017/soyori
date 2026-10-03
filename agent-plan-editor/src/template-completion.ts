// Cursor-only lexer for suggestions; Core remains responsible for validating templates.
export function templateCompletion(text: string, cursor: number) {
  let start = -1;
  let quoted = false;
  for (let i = 0; i < cursor; i++) {
    const char = text[i];
    if (start < 0) {
      if (char !== "$") continue;
      if (text[i + 1] === "$") {
        i++;
        continue;
      }
      start = i;
    } else {
      if (quoted && char === "\\") {
        i++;
        continue;
      }
      if (char === '"') quoted = !quoted;
      if (char === "$" && !quoted) start = -1;
    }
  }
  if (start < 0) return null;
  const query = text.slice(start + 1, cursor);
  if (!/^[\p{L}\p{N}_.[\]"\\]*$/u.test(query)) return null;
  let end = cursor;
  for (; end < text.length; end++) {
    const char = text[end];
    if (quoted && char === "\\") {
      end++;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (!quoted && char === "$") {
      end++;
      break;
    }
    if (!/^[\p{L}\p{N}_.[\]"\\]$/u.test(char)) break;
  }
  return { start, end, query };
}
