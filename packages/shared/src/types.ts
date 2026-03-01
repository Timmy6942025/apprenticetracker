export type Category = "tech" | "business" | "data_analyst" | "finance";
export type ApprenticeshipSource = "find_apprenticeship_gov_uk" | "linkedin_jobs";

export interface ApprenticeshipRecord {
  id: string;
  source: ApprenticeshipSource;
  source_listing_id: string;
  title: string;
  employer: string | null;
  location: string | null;
  posted_date: string;
  closing_date: string | null;
  url: string;
  description_snippet: string | null;
  categories: Category[];
  salary_text: string | null;
  listing_hash: string;
  created_at: string;
  updated_at: string;
}

export interface CrawlRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "failed";
  pages_crawled: number;
  records_seen: number;
  records_accepted: number;
  records_inserted: number;
  records_updated: number;
  records_rejected_category: number;
  records_rejected_date: number;
  records_rejected_location: number;
  records_rejected_schema: number;
  records_deduped: number;
  records_filtered_old: number;
  errors_count: number;
  error_message: string | null;
}

export interface ApprenticeshipQuery {
  category?: Category;
  source?: ApprenticeshipSource;
  q?: string;
  posted_after?: string;
  page?: number;
  page_size?: number;
  sort?: "posted_desc" | "posted_asc";
}

export interface ApprenticeshipListResponse {
  items: ApprenticeshipRecord[];
  total: number;
  page: number;
  page_size: number;
}
