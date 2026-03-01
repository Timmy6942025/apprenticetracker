import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { AppDb } from "./db.js";

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apprentice-db-"));
  return path.join(dir, "test.db");
}

describe("AppDb upsert", () => {
  it("inserts then updates same source_listing_id", () => {
    const db = new AppDb(tempDbPath());
    const base = {
      id: "00000000-0000-0000-0000-000000000001",
      source: "find_apprenticeship_gov_uk" as const,
      source_listing_id: "abc",
      title: "Software Apprentice",
      employer: "Acme",
      location: "London",
      posted_date: "2026-02-01",
      closing_date: null,
      url: "https://example.com/apprenticeship/abc",
      description_snippet: "IT and software",
      categories: ["tech"] as const,
      salary_text: null,
      listing_hash: "h1",
      created_at: "2026-02-01T00:00:00.000Z",
      updated_at: "2026-02-01T00:00:00.000Z"
    };

    expect(db.upsertApprenticeship({ ...base, categories: ["tech"] })).toBe("inserted");
    expect(db.upsertApprenticeship({ ...base, title: "Software Engineer Apprentice", listing_hash: "h2", updated_at: "2026-02-02T00:00:00.000Z", categories: ["tech"] })).toBe("updated");

    const list = db.listApprenticeships({ page: 1, page_size: 10 });
    expect(list.total).toBe(1);
    expect(list.items[0]?.title).toBe("Software Engineer Apprentice");

    db.close();
  });
});
