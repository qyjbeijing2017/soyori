import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json" with { type: "json" };
import zh from "./locales/zh-CN.json" with { type: "json" };

const preferenceKey = "agent-plan.language";
function initialLanguage() {
  try {
    const saved = localStorage.getItem(preferenceKey);
    if (saved === "en" || saved === "zh-CN") return saved;
  } catch {
    /* Storage is optional; use the browser preference. */
  }
  const preferred =
    typeof navigator === "undefined" ? undefined : navigator.languages?.[0] || navigator.language;
  return preferred && /^zh(?:-|$)/i.test(preferred) ? "zh-CN" : "en";
}
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, "zh-CN": { translation: zh } },
  lng: initialLanguage(),
  fallbackLng: "en",
  supportedLngs: ["zh-CN", "en"],
  keySeparator: false,
  nsSeparator: false,
  initAsync: false,
  interpolation: { escapeValue: false },
});
function updateDocumentLanguage(language: string) {
  if (typeof document !== "undefined") document.documentElement.lang = language;
}
updateDocumentLanguage(i18n.language);
i18n.on("languageChanged", (language) => {
  updateDocumentLanguage(language);
  try {
    localStorage.setItem(preferenceKey, language);
  } catch {
    /* Storage is optional. */
  }
});
export function tr(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options ?? {}) as string;
}
export default i18n;
