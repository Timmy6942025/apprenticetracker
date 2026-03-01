import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ApprenticeshipRecord, ApprenticeshipQuery, CrawlRun } from "@apprentice/shared";

function ensureParent(dbPath: string): void {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
}

function toJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export class AppDb {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    ensureParent(dbPath);
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS apprenticeships (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        source_listing_id TEXT NOT NULL,
        title TEXT NOT NULL,
        employer TEXT,
        location TEXT,
        posted_date TEXT NOT NULL,
        closing_date TEXT,
        url TEXT NOT NULL,
        description_snippet TEXT,
        categories TEXT NOT NULL,
        salary_text TEXT,
        listing_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(source, source_listing_id)
      );

      CREATE TABLE IF NOT EXISTS crawl_runs (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        pages_crawled INTEGER NOT NULL,
        records_seen INTEGER NOT NULL,
        records_inserted INTEGER NOT NULL,
        records_updated INTEGER NOT NULL,
        records_filtered_old INTEGER NOT NULL,
        errors_count INTEGER NOT NULL,
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_apprenticeships_posted_date ON apprenticeships(posted_date);
      CREATE INDEX IF NOT EXISTS idx_apprenticeships_title ON apprenticeships(title);
      CREATE INDEX IF NOT EXISTS idx_apprenticeships_categories ON apprenticeships(categories);
      CREATE INDEX IF NOT EXISTS idx_apprenticeships_source ON apprenticeships(source);
    `);
  }

  close(): void {
    this.db.close();
  }

  startRun(run: CrawlRun): void {
    this.db
      .prepare(
        `
          INSERT INTO crawl_runs (
            id, started_at, finished_at, status, pages_crawled, records_seen,
            records_inserted, records_updated, records_filtered_old, errors_count, error_message
          ) VALUES (
            @id, @started_at, @finished_at, @status, @pages_crawled, @records_seen,
            @records_inserted, @records_updated, @records_filtered_old, @errors_count, @error_message
          )
        `
      )
      .run(run);
  }

  finishRun(run: CrawlRun): void {
    this.db
      .prepare(
        `
          UPDATE crawl_runs
          SET
            finished_at = @finished_at,
            status = @status,
            pages_crawled = @pages_crawled,
            records_seen = @records_seen,
            records_inserted = @records_inserted,
            records_updated = @records_updated,
            records_filtered_old = @records_filtered_old,
            errors_count = @errors_count,
            error_message = @error_message
          WHERE id = @id
        `
      )
      .run(run);
  }

  upsertApprenticeship(record: ApprenticeshipRecord): "inserted" | "updated" {
    const existing = this.db
      .prepare(
        `SELECT id, listing_hash FROM apprenticeships WHERE source = ? AND source_listing_id = ? LIMIT 1`
      )
      .get(record.source, record.source_listing_id) as { id: string; listing_hash: string } | undefined;

    if (!existing) {
      this.db
        .prepare(
          `
          INSERT INTO apprenticeships (
            id, source, source_listing_id, title, employer, location,
            posted_date, closing_date, url, description_snippet,
            categories, salary_text, listing_hash, created_at, updated_at
          ) VALUES (
            @id, @source, @source_listing_id, @title, @employer, @location,
            @posted_date, @closing_date, @url, @description_snippet,
            @categories, @salary_text, @listing_hash, @created_at, @updated_at
          )
        `
        )
        .run({
          ...record,
          categories: JSON.stringify(record.categories)
        });
      return "inserted";
    }

    this.db
      .prepare(
        `
          UPDATE apprenticeships
          SET
            title = @title,
            employer = @employer,
            location = @location,
            posted_date = @posted_date,
            closing_date = @closing_date,
            url = @url,
            description_snippet = @description_snippet,
            categories = @categories,
            salary_text = @salary_text,
            listing_hash = @listing_hash,
            updated_at = @updated_at
          WHERE source = @source AND source_listing_id = @source_listing_id
        `
      )
      .run({
        ...record,
        categories: JSON.stringify(record.categories)
      });
    return "updated";
  }

  listApprenticeships(query: ApprenticeshipQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.page_size && query.page_size > 0 ? Math.min(query.page_size, 100) : 25;
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (query.posted_after) {
      whereClauses.push("posted_date >= ?");
      params.push(query.posted_after);
    }

    if (query.category) {
      whereClauses.push("categories LIKE ?");
      params.push(`%\"${query.category}\"%`);
    }

    if (query.source) {
      whereClauses.push("source = ?");
      params.push(query.source);
    }

    if (query.q) {
      whereClauses.push("(title LIKE ? OR employer LIKE ? OR description_snippet LIKE ?)");
      const term = `%${query.q}%`;
      params.push(term, term, term);
    }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const sort = query.sort === "posted_asc" ? "ASC" : "DESC";

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM apprenticeships ${where}`)
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(
        `
          SELECT * FROM apprenticeships
          ${where}
          ORDER BY posted_date ${sort}, updated_at DESC
          LIMIT ? OFFSET ?
        `
      )
      .all(...params, pageSize, offset) as Record<string, unknown>[];

    const items = rows.map((row) => ({
      ...row,
      categories: toJsonArray(String(row.categories ?? "[]"))
    })) as ApprenticeshipRecord[];

    return {
      items,
      total: countRow.count,
      page,
      page_size: pageSize
    };
  }

  getApprenticeship(id: string): ApprenticeshipRecord | null {
    const row = this.db.prepare(`SELECT * FROM apprenticeships WHERE id = ? LIMIT 1`).get(id) as
      | Record<string, unknown>
      | undefined;

    if (!row) return null;

    return {
      ...row,
      categories: toJsonArray(String(row.categories ?? "[]"))
    } as ApprenticeshipRecord;
  }

  latestRun(): CrawlRun | null {
    const row = this.db
      .prepare(`SELECT * FROM crawl_runs ORDER BY started_at DESC LIMIT 1`)
      .get() as CrawlRun | undefined;
    return row ?? null;
  }
}
