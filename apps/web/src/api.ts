import type { ListResponse, CrawlRun } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export async function fetchApprenticeships(query: URLSearchParams): Promise<ListResponse> {
  const res = await fetch(`${API_BASE}/api/apprenticeships?${query.toString()}`);
  if (!res.ok) throw new Error("Failed to load apprenticeships");
  return res.json() as Promise<ListResponse>;
}

export async function fetchLatestRun(): Promise<CrawlRun | null> {
  const res = await fetch(`${API_BASE}/api/runs/latest`);
  if (!res.ok) throw new Error("Failed to load crawl status");
  return res.json() as Promise<CrawlRun | null>;
}

export async function triggerCrawl(): Promise<CrawlRun> {
  const res = await fetch(`${API_BASE}/api/crawl/run`, { method: "POST" });
  if (!res.ok) {
    let message = "Failed to run crawl";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  return res.json() as Promise<CrawlRun>;
}
