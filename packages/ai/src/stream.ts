export type ModelEvent =
  | { type: "start" }
  | { type: "text"; text: string }
  | { type: "metrics"; values: Record<string, number> };

/** A bounded, disposable preview; never alters the model's final result. */
export function createPreview(emit?: (event: ModelEvent) => void) {
  let pending = "";
  let text = "";
  let closing = "";
  const tags = ["<tool_call>", "<think>", "<|im_end|>", "<|endoftext|>"];
  emit?.({ type: "start" });
  return (chunk: string) => {
    if (!emit) return;
    pending += chunk;
    const before = text;
    while (pending) {
      if (closing) {
        const end = pending.indexOf(closing);
        if (end < 0) {
          pending = pending.slice(-(closing.length - 1));
          break;
        }
        pending = pending.slice(end + closing.length);
        closing = "";
        continue;
      }
      const tag = tags.find((t) => pending.startsWith(t));
      if (tag) {
        pending = pending.slice(tag.length);
        if (tag === "<tool_call>") closing = "</tool_call>";
        if (tag === "<think>") closing = "</think>";
      } else {
        if (tags.some((t) => t.startsWith(pending))) break;
        if (text.length < 131072) text += pending[0];
        pending = pending.slice(1);
      }
    }
    if (text !== before) emit({ type: "text", text });
  };
}
