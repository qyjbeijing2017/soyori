import { BASE_URLS } from "./definitions.js";
import type { Connection, Provider } from "./index.js";

export type AutoProvider = "auto" | "local" | Provider;
export function selectProvider(
  raw: Record<string, unknown>,
  environment: Readonly<Record<string, string>> = {},
  connections: Partial<Record<Provider, Connection>> = {},
  preference: AutoProvider = "auto",
): "local" | Provider {
  const configured = environment.LLM_PROVIDER?.trim() || preference;
  if (!["auto", "local", "openai", "anthropic"].includes(configured))
    throw Error("AI_CONFIG: LLM_PROVIDER must be auto, local, openai or anthropic.");
  if (configured !== "auto") return configured as "local" | Provider;
  for (const provider of ["openai", "anthropic"] as const) {
    const connection = resolveConnection(provider, raw, environment, connections[provider]);
    if (
      typeof connection.apiKey === "string" &&
      connection.apiKey.trim() &&
      typeof connection.model === "string" &&
      connection.model.trim()
    )
      return provider;
  }
  return "local";
}

/** Resolve each connection parameter independently without exposing environment values to the model. */
export function resolveConnection(
  provider: Provider,
  raw: Record<string, unknown>,
  environment: Readonly<Record<string, string>> = {},
  defaults: Connection = {},
) {
  const prefix = provider === "openai" ? "OPENAI" : "ANTHROPIC";
  const names = {
    model: `${prefix}_MODEL`,
    apiKey: `${prefix}_API_KEY`,
    baseURL: `${prefix}_BASE_URL`,
  };
  const resolved = { ...raw };
  for (const key of ["model", "apiKey", "baseURL"] as const) {
    const explicit = raw[key];
    // Invalid types remain explicit so normal input validation reports them.
    if (explicit !== undefined && explicit !== null && typeof explicit !== "string") continue;
    const candidates = [
      explicit,
      environment[names[key]],
      defaults[key],
      key === "baseURL" ? BASE_URLS[provider] : undefined,
    ];
    const value = candidates.find((value) => typeof value === "string" && value.trim());
    if (typeof value === "string") resolved[key] = value.trim();
    else delete resolved[key];
  }
  return resolved;
}
