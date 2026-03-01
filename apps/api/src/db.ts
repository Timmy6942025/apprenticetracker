import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ApprenticeshipRecord, ApprenticeshipQuery, CrawlRun } from "@apprentice/shared";
import { buildCrossSourceDedupeKey } from "./dedupe.js";

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

interface ExistingDedupedRow {
  id: string;
  source: ApprenticeshipRecord["source"];
  source_listing_id: string;
  employer: string | null;
  location: string | null;
  posted_date: string;
  closing_date: string | null;
  description_snippet: string | null;
  salary_text: string | null;
}

function sourceRank(source: ApprenticeshipRecord["source"]): number {
  if (source === "find_apprenticeship_gov_uk") return 2;
  return 1;
}

function completenessScore(record: {
  employer: string | null;
  location: string | null;
  closing_date: string | null;
  description_snippet: string | null;
  salary_text: string | null;
}): number {
  let score = 0;
  if (record.employer) score += 1;
  if (record.location) score += 1;
  if (record.closing_date) score += 1;
  if (record.salary_text) score += 1;
  if (record.description_snippet && record.description_snippet.length > 200) score += 2;
  if (record.description_snippet && record.description_snippet.length > 600) score += 1;
  return score;
}

function shouldReplaceCrossSource(existing: ExistingDedupedRow, incoming: ApprenticeshipRecord): boolean {
  const incomingRank = sourceRank(incoming.source);
  const existingRank = sourceRank(existing.source);
  if (incomingRank > existingRank) return true;

  const incomingCompleteness = completenessScore(incoming);
  const existingCompleteness = completenessScore(existing);
  if (incomingCompleteness > existingCompleteness + 1) return true;

  if (incoming.posted_date > existing.posted_date && incomingCompleteness >= existingCompleteness) return true;

  return false;
}

export type UpsertOutcome = "inserted" | "updated" | "deduped";

export class AppDb {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    ensureParent(dbPath);
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private ensureColumns(table: string, columns: Array<{ name: string; definition: string }>): void {
    const existingRows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    const existing = new Set(existingRows.map((row) => row.name));
    for (const column of columns) {
      if (existing.has(column.name)) continue;
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column.name} ${column.definition}`);
    }
  }

  private backfillDedupeKeys(): void {
    const rows = this.db
      .prepare(
        `
          SELECT id, title, employer, location, posted_date
          FROM apprenticeships
          WHERE dedupe_key IS NULL OR dedupe_key = ''
        `
      )
      .all() as Array<{
      id: string;
      title: string;
      employer: string | null;
      location: string | null;
      posted_date: string;
    }>;

    const stmt = this.db.prepare(`UPDATE apprenticeships SET dedupe_key = @dedupe_key WHERE id = @id`);
    for (const row of rows) {
      stmt.run({
        id: row.id,
        dedupe_key: buildCrossSourceDedupeKey(row)
      });
    }
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
        dedupe_key TEXT,
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
        records_accepted INTEGER NOT NULL DEFAULT 0,
        records_inserted INTEGER NOT NULL,
        records_updated INTEGER NOT NULL,
        records_rejected_category INTEGER NOT NULL DEFAULT 0,
        records_rejected_date INTEGER NOT NULL DEFAULT 0,
        records_rejected_location INTEGER NOT NULL DEFAULT 0,
        records_rejected_schema INTEGER NOT NULL DEFAULT 0,
        records_deduped INTEGER NOT NULL DEFAULT 0,
        records_filtered_old INTEGER NOT NULL,
        errors_count INTEGER NOT NULL,
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_apprenticeships_posted_date ON apprenticeships(posted_date);
      CREATE INDEX IF NOT EXISTS idx_apprenticeships_title ON apprenticeships(title);
      CREATE INDEX IF NOT EXISTS idx_apprenticeships_categories ON apprenticeships(categories);
      CREATE INDEX IF NOT EXISTS idx_apprenticeships_source ON apprenticeships(source);
    `);

    this.ensureColumns("apprenticeships", [{ name: "dedupe_key", definition: "TEXT" }]);

    this.ensureColumns("crawl_runs", [
      { name: "records_accepted", definition: "INTEGER NOT NULL DEFAULT 0" },
      { name: "records_rejected_category", definition: "INTEGER NOT NULL DEFAULT 0" },
      { name: "records_rejected_date", definition: "INTEGER NOT NULL DEFAULT 0" },
      { name: "records_rejected_location", definition: "INTEGER NOT NULL DEFAULT 0" },
      { name: "records_rejected_schema", definition: "INTEGER NOT NULL DEFAULT 0" },
      { name: "records_deduped", definition: "INTEGER NOT NULL DEFAULT 0" }
    ]);

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_apprenticeships_dedupe_key ON apprenticeships(dedupe_key);`);

    this.backfillDedupeKeys();
  }

  close(): void {
    this.db.close();
  }

  startRun(run: CrawlRun): void {
    this.db
      .prepare(
        `
          INSERT INTO crawl_runs (
            id, started_at, finished_at, status, pages_crawled, records_seen, records_accepted,
            records_inserted, records_updated, records_rejected_category, records_rejected_date,
            records_rejected_location, records_rejected_schema, records_deduped,
            records_filtered_old, errors_count, error_message
          ) VALUES (
            @id, @started_at, @finished_at, @status, @pages_crawled, @records_seen, @records_accepted,
            @records_inserted, @records_updated, @records_rejected_category, @records_rejected_date,
            @records_rejected_location, @records_rejected_schema, @records_deduped,
            @records_filtered_old, @errors_count, @error_message
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
            records_accepted = @records_accepted,
            records_inserted = @records_inserted,
            records_updated = @records_updated,
            records_rejected_category = @records_rejected_category,
            records_rejected_date = @records_rejected_date,
            records_rejected_location = @records_rejected_location,
            records_rejected_schema = @records_rejected_schema,
            records_deduped = @records_deduped,
            records_filtered_old = @records_filtered_old,
            errors_count = @errors_count,
            error_message = @error_message
          WHERE id = @id
        `
      )
      .run(run);
  }

  upsertApprenticeship(record: ApprenticeshipRecord): UpsertOutcome {
    const dedupeKey = buildCrossSourceDedupeKey(record);

    const existing = this.db
      .prepare(`SELECT id FROM apprenticeships WHERE source = ? AND source_listing_id = ? LIMIT 1`)
      .get(record.source, record.source_listing_id) as { id: string } | undefined;

    if (existing) {
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
              dedupe_key = @dedupe_key,
              updated_at = @updated_at
            WHERE source = @source AND source_listing_id = @source_listing_id
          `
        )
        .run({
          ...record,
          dedupe_key: dedupeKey,
          categories: JSON.stringify(record.categories)
        });
      return "updated";
    }

    const crossSourceExisting = this.db
      .prepare(
        `
          SELECT
            id,
            source,
            source_listing_id,
            employer,
            location,
            posted_date,
            closing_date,
            description_snippet,
            salary_text
          FROM apprenticeships
          WHERE dedupe_key = ?
          ORDER BY
            CASE source WHEN 'find_apprenticeship_gov_uk' THEN 2 ELSE 1 END DESC,
            LENGTH(COALESCE(description_snippet, '')) DESC,
            updated_at DESC
          LIMIT 1
        `
      )
      .get(dedupeKey) as ExistingDedupedRow | undefined;

    if (crossSourceExisting) {
      if (!shouldReplaceCrossSource(crossSourceExisting, record)) {
        return "deduped";
      }

      this.db
        .prepare(
          `
            UPDATE apprenticeships
            SET
              source = @source,
              source_listing_id = @source_listing_id,
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
              dedupe_key = @dedupe_key,
              updated_at = @updated_at
            WHERE id = @id
          `
        )
        .run({
          ...record,
          id: crossSourceExisting.id,
          dedupe_key: dedupeKey,
          categories: JSON.stringify(record.categories)
        });

      return "updated";
    }

    this.db
      .prepare(
        `
          INSERT INTO apprenticeships (
            id, source, source_listing_id, title, employer, location,
            posted_date, closing_date, url, description_snippet,
            categories, salary_text, listing_hash, dedupe_key, created_at, updated_at
          ) VALUES (
            @id, @source, @source_listing_id, @title, @employer, @location,
            @posted_date, @closing_date, @url, @description_snippet,
            @categories, @salary_text, @listing_hash, @dedupe_key, @created_at, @updated_at
          )
        `
      )
      .run({
        ...record,
        dedupe_key: dedupeKey,
        categories: JSON.stringify(record.categories)
      });

    return "inserted";
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
      .prepare(
        `
          WITH filtered AS (
            SELECT COALESCE(NULLIF(dedupe_key, ''), source || ':' || source_listing_id) AS dedupe_group
            FROM apprenticeships
            ${where}
          )
          SELECT COUNT(*) AS count
          FROM (
            SELECT dedupe_group
            FROM filtered
            GROUP BY dedupe_group
          )
        `
      )
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(
        `
          WITH filtered AS (
            SELECT
              *,
              COALESCE(NULLIF(dedupe_key, ''), source || ':' || source_listing_id) AS dedupe_group
            FROM apprenticeships
            ${where}
          ),
          ranked AS (
            SELECT
              id,
              source,
              source_listing_id,
              title,
              employer,
              location,
              posted_date,
              closing_date,
              url,
              description_snippet,
              categories,
              salary_text,
              listing_hash,
              created_at,
              updated_at,
              ROW_NUMBER() OVER (
                PARTITION BY dedupe_group
                ORDER BY
                  CASE source WHEN 'find_apprenticeship_gov_uk' THEN 2 ELSE 1 END DESC,
                  LENGTH(COALESCE(description_snippet, '')) DESC,
                  updated_at DESC
              ) AS rn
            FROM filtered
          )
          SELECT
            id,
            source,
            source_listing_id,
            title,
            employer,
            location,
            posted_date,
            closing_date,
            url,
            description_snippet,
            categories,
            salary_text,
            listing_hash,
            created_at,
            updated_at
          FROM ranked
          WHERE rn = 1
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
