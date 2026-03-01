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

  it("dedupes equivalent listings across sources", () => {
    const db = new AppDb(tempDbPath());
    const now = "2026-02-10T00:00:00.000Z";

    const gov = {
      id: "00000000-0000-0000-0000-000000000101",
      source: "find_apprenticeship_gov_uk" as const,
      source_listing_id: "gov-1",
      title: "Software Developer Apprentice",
      employer: "Acme Ltd",
      location: "London",
      posted_date: "2026-02-10",
      closing_date: "2026-03-01",
      url: "https://example.com/apprenticeship/gov-1",
      description_snippet: "Full detail description from gov source",
      categories: ["tech"] as const,
      salary_text: "£20,000",
      listing_hash: "gh1",
      created_at: now,
      updated_at: now
    };

    const linkedin = {
      ...gov,
      id: "00000000-0000-0000-0000-000000000102",
      source: "linkedin_jobs" as const,
      source_listing_id: "li-1",
      url: "https://www.linkedin.com/jobs/view/123",
      description_snippet: "Short linkedin summary",
      listing_hash: "lh1"
    };

    expect(db.upsertApprenticeship(gov)).toBe("inserted");
    expect(db.upsertApprenticeship(linkedin)).toBe("deduped");

    const list = db.listApprenticeships({ page: 1, page_size: 10 });
    expect(list.total).toBe(1);
    expect(list.items[0]?.source).toBe("find_apprenticeship_gov_uk");

    db.close();
  });
});
