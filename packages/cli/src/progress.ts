import { clearLine, cursorTo } from "node:readline";

/** Only the parent knows whether the user's stderr is an interactive terminal. */
export function createProgress(output: NodeJS.WriteStream) {
  let active = false;
  let lastUpdate = 0;
  function finish() {
    if (active) output.write("\n");
    active = false;
  }
  return {
    update(message: string) {
      const percentage = /：\d+%$/.test(message);
      if (!output.isTTY) {
        if (!percentage) output.write(`[AI] ${message}\n`);
        return;
      }
      const now = Date.now();
      if (percentage && active && now - lastUpdate < 100) return;
      lastUpdate = now;
      cursorTo(output, 0);
      clearLine(output, 0);
      // Keep wide characters within one terminal line, even in narrow windows.
      const width = Math.max(1, Math.floor(((output.columns || 80) - 1) / 2));
      output.write(Array.from(`[AI] ${message}`).slice(0, width).join(""));
      active = true;
      if (!percentage) finish();
    },
    log(chunk: Buffer) {
      finish();
      output.write(chunk);
    },
    finish,
  };
}
