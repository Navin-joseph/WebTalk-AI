const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(message: string, public status?: number, public kind?: "network" | "server" | "auth" | "validation") {
    super(message);
    this.name = "ApiError";
  }
}

function friendlyMessage(err: unknown, status?: number): string {
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return "Connection lost — please check your network and try again.";
  }
  if (status === 401 || status === 403) return "Your session expired. Please sign in again.";
  if (status === 404) return "We couldn't find what you asked for.";
  if (status === 429) return "Too many requests — please wait a moment.";
  if (status && status >= 500) return "Our servers are busy. Trying again in a moment will usually fix this.";
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  { retries = 1 }: { retries?: number } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${API_URL}/api/v1${path}`, { ...options, headers });
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const body = await res.json();
          detail = body.detail ?? detail;
        } catch { /* ignore */ }
        const kind = res.status === 401 || res.status === 403 ? "auth"
          : res.status === 422 ? "validation"
          : res.status >= 500 ? "server" : "server";
        // Retry on 5xx
        if (res.status >= 500 && attempt < retries) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          lastErr = new ApiError(friendlyMessage(detail, res.status), res.status, kind);
          continue;
        }
        throw new ApiError(friendlyMessage(detail, res.status), res.status, kind);
      }
      return res.json();
    } catch (err) {
      // Network error (Failed to fetch) — retry once
      if (err instanceof TypeError && attempt < retries) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        lastErr = err;
        continue;
      }
      if (err instanceof ApiError) throw err;
      throw new ApiError(friendlyMessage(err), undefined, "network");
    }
  }
  throw lastErr instanceof Error ? lastErr : new ApiError("Request failed");
}

export const api = {
  get: <T>(path: string, token?: string) => request<T>(path, { method: "GET" }, token),
  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }, token),
  put: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }, token),
  delete: <T>(path: string, token?: string) => request<T>(path, { method: "DELETE" }, token),

  /**
   * Stream Server-Sent Events from a POST endpoint.
   * Calls onEvent for each parsed `data:` line.
   */
  stream: async (
    path: string,
    body: unknown,
    token: string,
    onEvent: (event: { type: string; [k: string]: unknown }) => void,
  ): Promise<void> => {
    const res = await fetch(`${API_URL}/api/v1${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      throw new ApiError(friendlyMessage(null, res.status), res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        try {
          onEvent(JSON.parse(data));
        } catch { /* ignore malformed chunks */ }
      }
    }
  },
};
