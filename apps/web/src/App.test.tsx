import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("App", () => {
  it("renders listing rows from API", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total: 1,
          page: 1,
          page_size: 25,
          items: [
            {
              id: "1",
              source: "find_apprenticeship_gov_uk",
              source_listing_id: "abc",
              title: "Software Apprentice",
              employer: "Acme",
              location: "London",
              posted_date: "2026-02-10",
              closing_date: null,
              url: "https://example.com/a",
              description_snippet: "IT",
              categories: ["tech"],
              salary_text: null,
              listing_hash: "h",
              created_at: "2026-02-10T00:00:00.000Z",
              updated_at: "2026-02-10T00:00:00.000Z"
            }
          ]
        })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => null });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Software Apprentice")).toBeInTheDocument();
    });
  });
});
