export interface Bookmark {
  id: number;
  title: string;
  summary: string;
  url: string;
  tags?: string[];
}

export interface SystemLog {
  id: number;
  level: "INFO" | "WARN" | "ERROR";
  component: string;
  message: string;
  metadata: string | null;
  createdAt: string;
}

const API_BASE = "/api";

export async function fetchBookmarks(): Promise<Bookmark[]> {
  // In a real implementation we might map specific fields if needed
  // For now using the existing endpoint structure
  const res = await fetch(`${API_BASE}/bookmarks`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch bookmarks");
  const data = await res.json();
  
  // Adapt backend data to frontend model if necessary
  // The backend currently proxies Raindrop items or returns DB items
  // Let's assume the list endpoint returns { items: [...] }
  return (data.items || []).map((item: any) => ({
    id: item._id || item.raindrop_id,
    title: item.title,
    summary: item.excerpt || item.summary || "",
    url: item.link || item.url,
    tags: item.tags || []
  }));
}

export async function fetchLogs(): Promise<SystemLog[]> {
  const res = await fetch(`${API_BASE}/logs`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch logs");
  const data = await res.json();
  return data.logs || [];
}

export async function triggerSync(): Promise<void> {
  const res = await fetch(`${API_BASE}/bookmarks/sync`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to trigger sync");
}

export async function ingestUrl(url: string): Promise<void> {
  const res = await fetch(`${API_BASE}/bookmarks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls: url }),
    credentials: "include"
  });
  if (!res.ok) throw new Error("Failed to ingest URL");
}

export interface AuthStatus {
  authenticated: boolean;
  systemConfigured: boolean;
  method: "oauth" | "system" | "none";
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await fetch("/auth/status", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch auth status");
  return res.json();
}
