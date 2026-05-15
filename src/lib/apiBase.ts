const DEFAULT_API_BASE_URL = "http://localhost:4000";

const normalizeBaseUrl = (value: string) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

export const apiBaseUrl = normalizeBaseUrl(
  (import.meta.env.VITE_API_BASE_URL as string) || DEFAULT_API_BASE_URL,
);

export const buildApiUrl = (path: string) => {
  const normalizedPath = String(path || "").startsWith("/")
    ? String(path)
    : `/${String(path || "")}`;
  return `${apiBaseUrl}${normalizedPath}`;
};
