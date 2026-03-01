import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchApprenticeships, fetchLatestRun, triggerCrawl } from "./api";
import { formatDate } from "./date";
import type { ApprenticeshipRecord, CrawlRun } from "./types";

const CATEGORIES = [
  { label: "All", value: "" },
  { label: "Tech", value: "tech" },
  { label: "Business", value: "business" },
  { label: "Data Analyst", value: "data_analyst" },
  { label: "Finance", value: "finance" }
] as const;

const SOURCES = [
  { label: "All Sources", value: "" },
  { label: "Gov Apprenticeships", value: "find_apprenticeship_gov_uk" },
  { label: "LinkedIn Jobs", value: "linkedin_jobs" }
] as const;

function defaultPostedAfter(): string {
  const d = new Date();
  d.setDate(d.getDate() - 45);
  return d.toISOString().slice(0, 10);
}

function toCsv(rows: ApprenticeshipRecord[]): string {
  const header = ["source", "title", "employer", "location", "posted_date", "categories", "url"];
  const lines = rows.map((r) =>
    [r.source, r.title, r.employer ?? "", r.location ?? "", r.posted_date, r.categories.join("|"), r.url]
      .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const [items, setItems] = useState<ApprenticeshipRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [postedAfter, setPostedAfter] = useState(defaultPostedAfter());
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<CrawlRun | null>(null);
  const lastRunClickAtRef = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        sort: "posted_desc",
        posted_after: postedAfter
      });
      if (q.trim()) query.set("q", q.trim());
      if (category) query.set("category", category);
      if (sourceFilter) query.set("source", sourceFilter);

      const [list, latestRun] = await Promise.all([
        fetchApprenticeships(query),
        fetchLatestRun().catch(() => null)
      ]);

      setItems(list.items);
      setTotal(list.total);
      setRun(latestRun);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, postedAfter, q, category, sourceFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  async function onRunCrawl() {
    const now = Date.now();
    if (runLoading || now - lastRunClickAtRef.current < 3000) return;
    lastRunClickAtRef.current = now;

    setRunLoading(true);
    setError(null);
    try {
      const latest = await triggerCrawl();
      setRun(latest);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run crawl");
    } finally {
      setRunLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>England Apprenticeship Tracker</h1>
          <p>Aggregates Gov + LinkedIn apprenticeship roles from the last 45 days in tech, business, data analyst, and finance.</p>
        </div>
        <button type="button" onClick={() => void onRunCrawl()} disabled={runLoading}>
          {runLoading ? "Running crawl..." : "Run crawl now"}
        </button>
      </header>

      <section className="status-grid">
        <article className="status-card">
          <h2>Last Crawl</h2>
          {run ? (
            <ul>
              <li>Status: {run.status}</li>
              <li>Started: {formatDate(run.started_at)}</li>
              <li>Inserted: {run.records_inserted}</li>
              <li>Updated: {run.records_updated}</li>
              <li>Filtered old: {run.records_filtered_old}</li>
            </ul>
          ) : (
            <p>No crawl run yet.</p>
          )}
        </article>
        <article className="status-card">
          <h2>Current Results</h2>
          <p>{total} listings</p>
          <button
            type="button"
            onClick={() => downloadCsv(`apprenticeships-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(items))}
          >
            Export CSV
          </button>
        </article>
      </section>

      <section className="filters">
        <input
          aria-label="Keyword search"
          placeholder="Search title/employer/description"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Source"
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value);
            setPage(1);
          }}
        >
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          aria-label="Posted after"
          type="date"
          value={postedAfter}
          onChange={(e) => {
            setPostedAfter(e.target.value);
            setPage(1);
          }}
        />
        <button type="button" onClick={() => void load()} disabled={loading}>
          Apply Filters
        </button>
      </section>

      {error ? <p className="error">{error}</p> : null}

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Employer</th>
              <th>Location</th>
              <th>Posted</th>
              <th>Source</th>
              <th>Categories</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.title}</td>
                <td>{item.employer ?? "-"}</td>
                <td>{item.location ?? "-"}</td>
                <td>{formatDate(item.posted_date)}</td>
                <td>{item.source === "linkedin_jobs" ? "LinkedIn" : "Gov"}</td>
                <td>{item.categories.join(", ")}</td>
                <td>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={7}>No apprenticeships found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <footer className="pagination">
        <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || loading}
        >
          Next
        </button>
      </footer>
    </div>
  );
}
