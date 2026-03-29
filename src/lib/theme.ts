export const THEME_STORAGE_KEY = "donechain.theme";

export type ThemeMode = "system" | "light" | "dark";

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export function resolveEffectiveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "light" || mode === "dark") {
    return mode;
  }

  if (typeof window === "undefined") {
    return "dark";
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyThemeMode(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const effective = resolveEffectiveTheme(mode);
  document.documentElement.classList.toggle("light", effective === "light");
}
