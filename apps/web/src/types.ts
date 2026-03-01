import type { ApprenticeshipRecord, CrawlRun } from "@apprentice/shared";

export interface ListResponse {
  items: ApprenticeshipRecord[];
  total: number;
  page: number;
  page_size: number;
}

export type { ApprenticeshipRecord, CrawlRun };
