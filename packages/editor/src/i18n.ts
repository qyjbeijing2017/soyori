import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json" with { type: "json" };
import zh from "./locales/zh-CN.json" with { type: "json" };

const preferenceKey = "agent-plan.language";
function initialLanguage() {
  try {
    return localStorage.getItem(preferenceKey) === "en" ? "en" : "zh-CN";
  } catch {
    return "zh-CN";
  }
}
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, "zh-CN": { translation: zh } },
  lng: initialLanguage(),
  fallbackLng: "zh-CN",
  supportedLngs: ["zh-CN", "en"],
  keySeparator: false,
  nsSeparator: false,
  initAsync: false,
  interpolation: { escapeValue: false },
});
function updateLanguage(language: string) {
  if (typeof document !== "undefined") document.documentElement.lang = language;
  try {
    localStorage.setItem(preferenceKey, language);
  } catch {
    /* Storage is optional. */
  }
}
updateLanguage(i18n.language);
i18n.on("languageChanged", updateLanguage);
export function tr(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options ?? {}) as string;
}
export default i18n;
