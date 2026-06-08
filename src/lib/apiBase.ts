const normalizeBaseUrl = (value: string) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

const frontendEnv = import.meta.env as Record<string, string | undefined>;

const DEFAULT_DEV_API_BASE_URL = "http://localhost:4000";
const DEFAULT_PROD_API_BASE_URL =
  "https://associatebackend-production.up.railway.app";

export const apiBaseUrl = normalizeBaseUrl(
  import.meta.env.DEV
    ? DEFAULT_DEV_API_BASE_URL
    : DEFAULT_PROD_API_BASE_URL,
);

export const contextCoreDomain = normalizeBaseUrl(
  frontendEnv.CONTEXTCORE_DOMAIN || "",
);

export const buildApiUrl = (path: string) => {
  const normalizedPath = String(path || "").startsWith("/")
    ? String(path)
    : `/${String(path || "")}`;
  return apiBaseUrl ? `${apiBaseUrl}${normalizedPath}` : normalizedPath;
};

declare global {
  interface Window {
    __associateApiFetchPatched?: boolean;
  }
}

if (typeof window !== "undefined" && !window.__associateApiFetchPatched) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const isRelativeAppRequest = /^\/(api|auth)(\/|$)/.test(String(requestUrl || ""));
    const isAbsoluteApiRequest = apiBaseUrl
      ? String(requestUrl || "").startsWith(apiBaseUrl)
      : false;
    if (isRelativeAppRequest || isAbsoluteApiRequest) {
      return nativeFetch(input, {
        ...init,
        credentials: init?.credentials || "include",
      });
    }
    return nativeFetch(input, init);
  };
  window.__associateApiFetchPatched = true;
}
