import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildServer } from "./server.js";
import { AppDb } from "./db.js";

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apprentice-api-"));
  return path.join(dir, "test.db");
}

describe("GET /api/apprenticeships", () => {
  it("filters by category", async () => {
    const dbPath = tempDbPath();
    const db = new AppDb(dbPath);

    db.upsertApprenticeship({
      id: "00000000-0000-0000-0000-000000000011",
      source: "find_apprenticeship_gov_uk",
      source_listing_id: "a1",
      title: "Software Apprentice",
      employer: "Acme",
      location: "London",
      posted_date: "2099-01-01",
      closing_date: null,
      url: "https://example.com/apprenticeship/a1",
      description_snippet: "coding",
      categories: ["tech"],
      salary_text: null,
      listing_hash: "h11",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z"
    });

    db.upsertApprenticeship({
      id: "00000000-0000-0000-0000-000000000022",
      source: "linkedin_jobs",
      source_listing_id: "a2",
      title: "Business Apprentice",
      employer: "Beta",
      location: "Leeds",
      posted_date: "2099-01-01",
      closing_date: null,
      url: "https://example.com/apprenticeship/a2",
      description_snippet: "operations",
      categories: ["business"],
      salary_text: null,
      listing_hash: "h22",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z"
    });

    db.upsertApprenticeship({
      id: "00000000-0000-0000-0000-000000000033",
      source: "find_apprenticeship_gov_uk",
      source_listing_id: "a3",
      title: "Old Software Apprentice",
      employer: "Gamma",
      location: "London",
      posted_date: "2020-01-01",
      closing_date: null,
      url: "https://example.com/apprenticeship/a3",
      description_snippet: "legacy",
      categories: ["tech"],
      salary_text: null,
      listing_hash: "h33",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z"
    });

    db.close();

    const app = buildServer(dbPath);
    const res = await app.inject({ method: "GET", url: "/api/apprenticeships?category=tech&posted_after=2000-01-01" });
    expect(res.statusCode).toBe(200);

    const body = res.json() as { total: number; items: Array<{ title: string }> };
    expect(body.total).toBe(1);
    expect(body.items[0]?.title).toContain("Software");

    const sourceRes = await app.inject({
      method: "GET",
      url: "/api/apprenticeships?source=linkedin_jobs&posted_after=2000-01-01"
    });
    expect(sourceRes.statusCode).toBe(200);
    const sourceBody = sourceRes.json() as { total: number; items: Array<{ source: string }> };
    expect(sourceBody.total).toBe(1);
    expect(sourceBody.items[0]?.source).toBe("linkedin_jobs");

    const strictCutoffRes = await app.inject({
      method: "GET",
      url: "/api/apprenticeships?category=tech&posted_after=1900-01-01"
    });
    expect(strictCutoffRes.statusCode).toBe(200);
    const strictCutoffBody = strictCutoffRes.json() as { total: number; items: Array<{ title: string }> };
    expect(strictCutoffBody.total).toBe(1);
    expect(strictCutoffBody.items[0]?.title).toContain("Software Apprentice");

    await app.close();
  });
});
