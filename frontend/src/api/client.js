import { supabase } from "../supabase/client";

const API_BASE_URL = "http://127.0.0.1:8000/api";
const DEFAULT_TIMEOUT_MS = 30_000;
const ANALYSIS_TIMEOUT_MS = 120_000;
const REPORT_TIMEOUT_MS = 180_000;

function getRequestTimeout(endpoint, method) {
  if (endpoint.includes("/report/")) return REPORT_TIMEOUT_MS;

  const isLongAnalysis =
    endpoint.includes("/analyze-image") ||
    endpoint.includes("/extract-document") ||
    (method === "POST" &&
      (endpoint.includes("/graph/") ||
        endpoint.includes("/timeline/") ||
        endpoint.includes("/contradiction/") ||
        endpoint.includes("/witness/")));

  return isLongAnalysis ? ANALYSIS_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}

export async function apiClient(endpoint, options = {}) {
  const {
    timeoutMs: requestedTimeout,
    signal: callerSignal,
    responseType = "json",
    ...fetchOptions
  } = options;
  const method = (fetchOptions.method || "GET").toUpperCase();
  const timeoutMs = requestedTimeout ?? getRequestTimeout(endpoint, method);
  const controller = new AbortController();
  let timeoutId;
  let callerAbortHandler;

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort(callerSignal.reason);
    } else {
      callerAbortHandler = () => controller.abort(callerSignal.reason);
      callerSignal.addEventListener("abort", callerAbortHandler, { once: true });
    }
  }

  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        controller.abort();
        reject(
          new Error(
            `Request timed out after ${Math.ceil(timeoutMs / 1000)} seconds. ` +
              "The server may still be processing; check the item status before retrying.",
          ),
        );
      }, timeoutMs);
    });

    const requestPromise = (async () => {
      const isFormData = fetchOptions.body instanceof FormData;
      const { data: { session } = {} } = await supabase.auth.getSession();
      if (controller.signal.aborted) {
        throw new DOMException("The request was aborted.", "AbortError");
      }

      const headers = {
        ...(!isFormData ? { "Content-Type": "application/json" } : {}),
        ...(fetchOptions.headers || {}),
      };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorDetail = `API Error: ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson && errJson.detail) {
            errorDetail =
              typeof errJson.detail === "string"
                ? errJson.detail
                : JSON.stringify(errJson.detail);
          }
        } catch {
          // Ignore a non-JSON error body and keep the HTTP status message.
        }
        throw new Error(errorDetail);
      }

      return responseType === "blob" ? response.blob() : response.json();
    })();

    return await Promise.race([requestPromise, timeoutPromise]);
  } catch (err) {
    if (controller.signal.aborted && !callerSignal?.aborted && err.name === "AbortError") {
      throw new Error(
        `Request timed out after ${Math.ceil(timeoutMs / 1000)} seconds. ` +
          "The server may still be processing; check the item status before retrying.",
        { cause: err },
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
    if (callerSignal && callerAbortHandler) {
      callerSignal.removeEventListener("abort", callerAbortHandler);
    }
  }
}

export async function apiBlob(endpoint, options = {}) {
  return apiClient(endpoint, { ...options, responseType: "blob" });
}

export async function apiPatch(endpoint, body, options = {}) {
  return apiClient(endpoint, {
    method: "PATCH",
    body: JSON.stringify(body),
    ...options,
  });
}

export async function apiGet(endpoint, options = {}) {
  return apiClient(endpoint, {
    method: "GET",
    ...options,
  });
}

