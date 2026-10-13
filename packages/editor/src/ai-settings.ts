export interface ModelConnection {
  apiKey: string;
  baseURL: string;
  model: string;
}
export interface AiSettings {
  allowLocalDownload: boolean;
  backgroundInitialization: boolean;
  assistantProvider: "auto" | "local" | "openai" | "anthropic";
  openai: ModelConnection;
  anthropic: ModelConnection;
}
export const initialAiSettings: AiSettings = {
  allowLocalDownload: true,
  backgroundInitialization: false,
  assistantProvider: "auto",
  openai: { apiKey: "", baseURL: "https://api.openai.com/v1", model: "" },
  anthropic: { apiKey: "", baseURL: "https://api.anthropic.com", model: "" },
};
const settingsKey = "agent-plan-assistant-settings";
export function loadAiSettings(): AiSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) ?? "{}");
    const connection = (name: "openai" | "anthropic") =>
      Object.fromEntries(
        Object.entries(initialAiSettings[name]).map(([key, value]) => [
          key,
          typeof saved?.[name]?.[key] === "string" ? saved[name][key] : value,
        ]),
      ) as unknown as ModelConnection;
    return {
      ...initialAiSettings,
      backgroundInitialization:
        localStorage.getItem("agent-plan-background-initialization") === "true",
      assistantProvider: ["auto", "local", "openai", "anthropic"].includes(saved?.assistantProvider)
        ? saved.assistantProvider
        : "auto",
      openai: connection("openai"),
      anthropic: connection("anthropic"),
    };
  } catch {
    return initialAiSettings;
  }
}
export function saveAiSettings(settings: AiSettings) {
  localStorage.setItem(
    settingsKey,
    JSON.stringify({
      assistantProvider: settings.assistantProvider,
      openai: settings.openai,
      anthropic: settings.anthropic,
    }),
  );
}
export function assistantProvider(settings: AiSettings): "local" | "openai" | "anthropic" {
  if (settings.assistantProvider === "local") return "local";
  if (settings.assistantProvider !== "auto" && settings[settings.assistantProvider].apiKey.trim())
    return settings.assistantProvider;
  return settings.openai.apiKey.trim()
    ? "openai"
    : settings.anthropic.apiKey.trim()
      ? "anthropic"
      : "local";
}
