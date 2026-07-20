const normalizeBaseUrl = (value: string) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

const LOCAL_HOSTNAME_PATTERN = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i;

const isLocalHostname = (value: string) =>
  LOCAL_HOSTNAME_PATTERN.test(String(value || "").trim());

const shouldUseDevProxy = (explicitApiBaseUrl: string) => {
  if (!import.meta.env.DEV || !explicitApiBaseUrl || typeof window === "undefined") {
    return false;
  }
  try {
    const configuredUrl = new URL(explicitApiBaseUrl);
    const currentUrl = new URL(window.location.origin);
    return isLocalHostname(configuredUrl.hostname) && isLocalHostname(currentUrl.hostname);
  } catch {
    return false;
  }
};

const frontendEnv = import.meta.env as Record<string, string | undefined>;

const DEFAULT_DEV_API_BASE_URL = "";
const DEFAULT_PROD_API_BASE_URL =
  "https://associatebackend-production.up.railway.app";
const EXPLICIT_API_BASE_URL = normalizeBaseUrl(
  frontendEnv.VITE_API_BASE_URL || frontendEnv.API_BASE_URL || "",
);
const SESSION_TOKEN_STORAGE_KEY = "associate.sessionToken";

export const setApiSessionToken = (token: string) => {
  const normalized = String(token || "").trim();
  if (!normalized) return;
  window.sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, normalized);
};

export const clearApiSessionToken = () => {
  window.sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
};

const getApiSessionToken = () =>
  window.sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY) || "";

export const apiBaseUrl = normalizeBaseUrl(
  (shouldUseDevProxy(EXPLICIT_API_BASE_URL) ? "" : EXPLICIT_API_BASE_URL) ||
    (import.meta.env.DEV
      ? DEFAULT_DEV_API_BASE_URL
      : DEFAULT_PROD_API_BASE_URL),
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
      const headers = new Headers(
        init?.headers || (input instanceof Request ? input.headers : undefined),
      );
      const sessionToken = getApiSessionToken();
      if (sessionToken && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${sessionToken}`);
      }
      return nativeFetch(input, {
        ...init,
        headers,
        credentials: init?.credentials || "include",
      });
    }
    return nativeFetch(input, init);
  };
  window.__associateApiFetchPatched = true;
}
