import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useGetCompanyInfoQuery } from "@/store/api/companyApiSlice";

export type ThemeColors = {
  bg: string;
  card: string;
  cardAlt: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  primarySoft: string;
  secondary: string;
  danger: string;
  success: string;
  warning: string;
  input: string;
};

const LIGHT_PALETTE: Record<string, string> = {
  violet: "#7c3aed",
  indigo: "#4f46e5",
  blue: "#2563eb",
  emerald: "#059669",
  rose: "#e11d48",
  amber: "#d97706",
  default: "#636ccb",
};

function isHex(value?: string | null): value is string {
  return Boolean(value && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim()));
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
  const num = Number.parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function buildLightTheme(info?: {
  primary_color?: string;
  secondary_color?: string;
  theme_palette?: string;
} | null): ThemeColors {
  const paletteName = (info?.theme_palette || "default").toLowerCase();
  const fromPalette = LIGHT_PALETTE[paletteName] || LIGHT_PALETTE.default;
  const primary = isHex(info?.primary_color) ? info.primary_color.trim() : fromPalette;
  const secondary = isHex(info?.secondary_color) ? info.secondary_color.trim() : primary;
  return {
    bg: "#f8fafc",
    card: "#ffffff",
    cardAlt: "#f1f5f9",
    border: "#e2e8f0",
    text: "#0f172a",
    muted: "#64748b",
    primary,
    primarySoft: hexToRgba(primary, 0.12),
    secondary,
    danger: "#e11d48",
    success: "#059669",
    warning: "#d97706",
    input: "#ffffff",
  };
}

const ThemeContext = createContext<ThemeColors>(buildLightTheme(null));

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data } = useGetCompanyInfoQuery();
  const colors = useMemo(
    () =>
      buildLightTheme({
        primary_color: data?.primary_color,
        secondary_color: data?.secondary_color,
        theme_palette: data?.theme_palette,
      }),
    [data?.primary_color, data?.secondary_color, data?.theme_palette],
  );
  return <ThemeContext.Provider value={colors}>{children}</ThemeContext.Provider>;
}

export function useThemeColors(): ThemeColors {
  return useContext(ThemeContext);
}

export function useStatusColors(): Record<string, string> {
  const colors = useThemeColors();
  return useMemo(
    () => ({
      draft: colors.muted,
      planned: colors.primary,
      submitted: colors.warning,
      approved: colors.success,
      rejected: colors.danger,
      completed: colors.success,
      created: colors.primary,
      pending: colors.warning,
      in_progress: "#ea580c",
      cancelled: colors.danger,
      skipped: colors.muted,
      rescheduled: colors.secondary,
    }),
    [colors],
  );
}
