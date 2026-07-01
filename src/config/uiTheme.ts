export type AppThemeKey = "default" | "jurisflowCarbonLight";

export const MATTER_THEME_STORAGE_KEY = "associate:matter-theme";

type ScreenThemeConfig = {
  matter: AppThemeKey;
};

export const screenThemeConfig: ScreenThemeConfig = {
  matter: "jurisflowCarbonLight",
};

export const matterThemeOptions: Array<{
  key: AppThemeKey;
  label: string;
}> = [
  { key: "jurisflowCarbonLight", label: "Carbon Light" },
  { key: "default", label: "Legacy" },
];

export const readStoredTheme = (
  storageKey: string,
  fallback: AppThemeKey,
): AppThemeKey => {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(storageKey);
  return matterThemeOptions.some((option) => option.key === stored)
    ? (stored as AppThemeKey)
    : fallback;
};

export const getScreenThemeClass = (theme: AppThemeKey) => {
  switch (theme) {
    case "jurisflowCarbonLight":
      return "uiTheme-carbonLight";
    case "default":
    default:
      return "";
  }
};
