import { buildApiUrl } from "./apiBase";

type CreditPayload = {
  email?: string;
  balance?: number;
  available?: number;
};

const LEGACY_CREDIT_CACHE_KEY = "associate.creditBalance";
const CREDIT_CACHE_KEY = "associate.creditBalance.v2";
const CREDIT_CACHE_PREFIX = "associate.creditBalance.v2:";
const ACTIVE_CREDIT_EMAIL_KEY = "associate.activeCreditEmail.v2";
const CREDIT_UPDATED_EVENT = "associate:credit-balance-updated";

let activeCreditEmail = "";

const normalizeEmail = (value?: string | null) =>
  String(value || "").trim().toLowerCase();

const scopedCreditCacheKey = (email?: string | null) => {
  const normalized = normalizeEmail(email) || activeCreditEmail;
  return normalized ? `${CREDIT_CACHE_PREFIX}${normalized}` : CREDIT_CACHE_KEY;
};

const readCachedCreditBalance = (email?: string | null) => {
  if (typeof window === "undefined") return null;
  const rawValue = window.localStorage.getItem(scopedCreditCacheKey(email));
  if (!rawValue) return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
};

const emitCreditBalance = (value: number | null, email = activeCreditEmail) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CREDIT_UPDATED_EVENT, { detail: { value, email } }),
  );
};

const writeCachedCreditBalance = (value: number, email?: string | null) => {
  if (typeof window === "undefined" || !Number.isFinite(value)) return;
  const normalized = normalizeEmail(email) || activeCreditEmail;
  window.localStorage.setItem(scopedCreditCacheKey(normalized), String(value));
  if (normalized && normalized === activeCreditEmail) {
    window.localStorage.setItem(CREDIT_CACHE_KEY, String(value));
  }
  emitCreditBalance(value, normalized);
};

export const getCachedCreditBalance = readCachedCreditBalance;

export const setActiveCreditUser = (email?: string | null) => {
  activeCreditEmail = normalizeEmail(email);
  if (typeof window === "undefined") return;
  if (activeCreditEmail) {
    window.localStorage.setItem(ACTIVE_CREDIT_EMAIL_KEY, activeCreditEmail);
    window.localStorage.removeItem(LEGACY_CREDIT_CACHE_KEY);
    const scopedValue = readCachedCreditBalance(activeCreditEmail);
    if (scopedValue !== null) {
      window.localStorage.setItem(CREDIT_CACHE_KEY, String(scopedValue));
    } else {
      window.localStorage.removeItem(CREDIT_CACHE_KEY);
    }
    emitCreditBalance(scopedValue, activeCreditEmail);
  } else {
    window.localStorage.removeItem(ACTIVE_CREDIT_EMAIL_KEY);
    window.localStorage.removeItem(CREDIT_CACHE_KEY);
    window.localStorage.removeItem(LEGACY_CREDIT_CACHE_KEY);
    emitCreditBalance(null, "");
  }
};

export const clearActiveCreditCache = () => {
  if (typeof window === "undefined") return;
  if (activeCreditEmail) {
    window.localStorage.removeItem(scopedCreditCacheKey(activeCreditEmail));
  }
  window.localStorage.removeItem(CREDIT_CACHE_KEY);
  window.localStorage.removeItem(LEGACY_CREDIT_CACHE_KEY);
  emitCreditBalance(null, activeCreditEmail);
};

export const setCachedCreditBalance = (value: number, email?: string | null) => {
  writeCachedCreditBalance(value, email);
};

export const extractCreditBalance = (payload: unknown) => {
  const source =
    payload && typeof payload === "object"
      ? ((payload as { credits?: CreditPayload }).credits ?? payload)
      : null;
  if (!source || typeof source !== "object") return null;
  const creditSource = source as CreditPayload;
  const value = Number(
    creditSource.available ?? creditSource.balance ?? Number.NaN,
  );
  return Number.isFinite(value) ? value : null;
};

const extractCreditEmail = (payload: unknown) => {
  const source =
    payload && typeof payload === "object"
      ? ((payload as { credits?: CreditPayload }).credits ?? payload)
      : null;
  if (!source || typeof source !== "object") return "";
  return normalizeEmail((source as CreditPayload).email);
};

export const updateCreditCacheFromPayload = (
  payload: unknown,
  options: { force?: boolean; email?: string | null } = {},
) => {
  const value = extractCreditBalance(payload);
  if (value === null) return null;
  const payloadEmail = extractCreditEmail(payload);
  const targetEmail = normalizeEmail(options.email) || payloadEmail || activeCreditEmail;
  if (
    !options.force &&
    payloadEmail &&
    activeCreditEmail &&
    payloadEmail !== activeCreditEmail
  ) {
    return null;
  }
  writeCachedCreditBalance(value, targetEmail);
  return value;
};

export const fetchCreditBalance = async () => {
  const response = await fetch(buildApiUrl("/api/credits/me"), {
    credentials: "include",
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return updateCreditCacheFromPayload(payload, { force: true });
};

export const subscribeToCreditBalance = (callback: (value: number | null) => void) => {
  if (typeof window === "undefined") return () => {};
  const handleStorage = (event: StorageEvent) => {
    if (
      event.key !== CREDIT_CACHE_KEY &&
      event.key !== scopedCreditCacheKey(activeCreditEmail)
    ) {
      return;
    }
    if (event.newValue === null) {
      callback(null);
      return;
    }
    const value = Number(event.newValue);
    if (Number.isFinite(value)) callback(value);
  };
  const handleLocalUpdate = (event: Event) => {
    const detail = (event as CustomEvent<{ value?: number | null; email?: string }>).detail;
    const eventEmail = normalizeEmail(detail?.email);
    if (eventEmail && activeCreditEmail && eventEmail !== activeCreditEmail) return;
    if (detail?.value === null) {
      callback(null);
      return;
    }
    const value = Number(detail?.value);
    if (Number.isFinite(value)) callback(value);
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(CREDIT_UPDATED_EVENT, handleLocalUpdate);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CREDIT_UPDATED_EVENT, handleLocalUpdate);
  };
};

declare global {
  interface Window {
    __associateCreditFetchPatched?: boolean;
  }
}

export const installCreditCacheFetchInterceptor = () => {
  if (typeof window === "undefined" || window.__associateCreditFetchPatched) {
    return;
  }
  activeCreditEmail =
    normalizeEmail(window.localStorage.getItem(ACTIVE_CREDIT_EMAIL_KEY)) || "";
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await nativeFetch(input, init);
    const originalJson = response.json.bind(response);
    response.json = async () => {
      const payload = await originalJson();
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      updateCreditCacheFromPayload(payload, {
        force: String(url || "").includes("/api/credits/me"),
      });
      return payload;
    };
    return response;
  };
  window.__associateCreditFetchPatched = true;
};
