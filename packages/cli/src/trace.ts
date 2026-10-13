import type { FileHandle } from "node:fs/promises";
import { open } from "node:fs/promises";
import { CliError } from "./protocol.js";

export class TraceWriter {
  private sequence = 0;
  private constructor(private readonly file: FileHandle) {}
  static async create(path: string): Promise<TraceWriter> {
    try {
      return new TraceWriter(await open(path, "wx"));
    } catch {
      throw new CliError(
        "TRACE_OPEN_ERROR",
        `Cannot create trace ${path}; choose a new writable file.`,
      );
    }
  }
  async write(record: Record<string, unknown>): Promise<void> {
    try {
      await this.file.writeFile(
        `${JSON.stringify({ version: 1, sequence: this.sequence++, time: new Date().toISOString(), ...record })}\n`,
      );
    } catch {
      throw new CliError("TRACE_WRITE_ERROR", "Cannot write trace.");
    }
  }
  async close(): Promise<void> {
    try {
      await this.file.close();
    } catch {
      throw new CliError("TRACE_WRITE_ERROR", "Cannot close trace.");
    }
  }
}
