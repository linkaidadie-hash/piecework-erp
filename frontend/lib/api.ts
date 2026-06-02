const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

export type Session = {
  token: string;
  company: string;
  role: string;
};

export type LicenseStatus = {
  machineId: string;
  valid: boolean;
  message: string;
  license?: Record<string, any> | null;
};

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "请求失败");
  }
  return res.json();
}

export function money(value: number | string | undefined) {
  const num = Number(value || 0);
  return num.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
