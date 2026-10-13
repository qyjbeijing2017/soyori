import { createBrowserStorage } from "agent-plan-storage/browser";
import { type Environment, readEnvironment, saveEnvironment } from "agent-plan-storage/environment";
export const environmentStorage = createBrowserStorage("agent-plan-environment");
let writes: Promise<unknown> = Promise.resolve();
export function persistEnvironment(values: Environment, threadId?: string, fileId?: string) {
  const snapshot = readEnvironment(values);
  const task = writes
    .catch(() => {})
    .then(() => saveEnvironment(environmentStorage, snapshot, threadId, fileId));
  writes = task;
  return task;
}
export async function flushEnvironmentWrites() {
  await writes;
}
