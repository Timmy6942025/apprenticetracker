import type { Category } from "@apprentice/shared";

const categoryPatterns: Record<Category, RegExp[]> = {
  tech: [
    /software/i,
    /developer/i,
    /it\b/i,
    /cyber/i,
    /cloud/i,
    /devops/i,
    /engineering\b/i,
    /digital/i,
    /web\b/i,
    /data engineer/i
  ],
  business: [
    /business/i,
    /operations/i,
    /project\s*management/i,
    /administrator/i,
    /administration/i,
    /hr\b/i,
    /human resources/i,
    /commercial/i,
    /sales/i,
    /marketing/i
  ],
  data_analyst: [
    /data\s*analyst/i,
    /data analysis/i,
    /analytics/i,
    /business intelligence/i,
    /bi\b/i,
    /reporting/i,
    /sql/i
  ]
};

export function classifyCategories(
  title: string,
  description: string | null,
  allowedCategories?: readonly Category[]
): Category[] {
  const text = `${title} ${description ?? ""}`.trim();
  const activeCategories =
    allowedCategories && allowedCategories.length > 0
      ? Array.from(new Set(allowedCategories))
      : (Object.keys(categoryPatterns) as Category[]);

  const matches = activeCategories.filter((category) =>
    categoryPatterns[category].some((pattern) => pattern.test(text))
  );
  return matches;
}
