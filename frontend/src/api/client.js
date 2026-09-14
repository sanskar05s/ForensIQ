const API_BASE_URL = "http://127.0.0.1:8000/api";

export async function apiClient(endpoint, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(!isFormData ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
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
      // ignore json parse error
    }
    throw new Error(errorDetail);
  }

  return response.json();
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

