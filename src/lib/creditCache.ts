import { buildApiUrl } from "./apiBase";

type CreditPayload = {
  balance?: number;
  available?: number;
};

const CREDIT_CACHE_KEY = "associate.creditBalance";
const CREDIT_UPDATED_EVENT = "associate:credit-balance-updated";

const readCachedCreditBalance = () => {
  if (typeof window === "undefined") return null;
  const rawValue = window.localStorage.getItem(CREDIT_CACHE_KEY);
  if (!rawValue) return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
};

const writeCachedCreditBalance = (value: number) => {
  if (typeof window === "undefined" || !Number.isFinite(value)) return;
  window.localStorage.setItem(CREDIT_CACHE_KEY, String(value));
  window.dispatchEvent(
    new CustomEvent(CREDIT_UPDATED_EVENT, { detail: { value } }),
  );
};

export const getCachedCreditBalance = readCachedCreditBalance;

export const setCachedCreditBalance = (value: number) => {
  writeCachedCreditBalance(value);
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

export const updateCreditCacheFromPayload = (payload: unknown) => {
  const value = extractCreditBalance(payload);
  if (value === null) return null;
  writeCachedCreditBalance(value);
  return value;
};

export const fetchCreditBalance = async () => {
  const response = await fetch(buildApiUrl("/api/credits/me"), {
    credentials: "include",
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return updateCreditCacheFromPayload(payload);
};

export const subscribeToCreditBalance = (callback: (value: number) => void) => {
  if (typeof window === "undefined") return () => {};
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== CREDIT_CACHE_KEY || event.newValue === null) return;
    const value = Number(event.newValue);
    if (Number.isFinite(value)) callback(value);
  };
  const handleLocalUpdate = (event: Event) => {
    const value = Number((event as CustomEvent<{ value?: number }>).detail?.value);
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
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await nativeFetch(input, init);
    const originalJson = response.json.bind(response);
    response.json = async () => {
      const payload = await originalJson();
      updateCreditCacheFromPayload(payload);
      return payload;
    };
    return response;
  };
  window.__associateCreditFetchPatched = true;
};
