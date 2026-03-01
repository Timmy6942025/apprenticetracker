import type { Category } from "@apprentice/shared";

interface ScoringConfig {
  threshold: number;
  positive: Array<{ pattern: RegExp; weight: number; titleBonus?: number }>;
  negative: Array<{ pattern: RegExp; weight: number }>;
}

const categoryScoring: Record<Category, ScoringConfig> = {
  tech: {
    threshold: 3,
    positive: [
      { pattern: /\bsoftware\b/i, weight: 3, titleBonus: 2 },
      { pattern: /\bdeveloper\b/i, weight: 3, titleBonus: 2 },
      { pattern: /\bit\b/i, weight: 1 },
      { pattern: /\bcyber\b/i, weight: 2, titleBonus: 1 },
      { pattern: /\bcloud\b/i, weight: 2 },
      { pattern: /\bdevops\b/i, weight: 3 },
      { pattern: /\bengineering\b/i, weight: 2 },
      { pattern: /\bdigital\b/i, weight: 1 },
      { pattern: /\bweb\b/i, weight: 2 },
      { pattern: /\bdata engineer\b/i, weight: 3, titleBonus: 1 }
    ],
    negative: [
      { pattern: /\bcare\b/i, weight: 2 },
      { pattern: /\bnursery\b/i, weight: 2 },
      { pattern: /\bhairdress/i, weight: 2 }
    ]
  },
  business: {
    threshold: 3,
    positive: [
      { pattern: /\bbusiness\b/i, weight: 2, titleBonus: 1 },
      { pattern: /\boperations?\b/i, weight: 2, titleBonus: 1 },
      { pattern: /\bproject\s*management\b/i, weight: 3 },
      { pattern: /\badministrator\b/i, weight: 2 },
      { pattern: /\badministration\b/i, weight: 2 },
      { pattern: /\bhr\b/i, weight: 2 },
      { pattern: /\bhuman resources\b/i, weight: 3 },
      { pattern: /\bcommercial\b/i, weight: 2 },
      { pattern: /\bsales\b/i, weight: 2 },
      { pattern: /\bmarketing\b/i, weight: 2 }
    ],
    negative: [
      { pattern: /\bbusiness intelligence\b/i, weight: 3 },
      { pattern: /\bbi dashboards?\b/i, weight: 2 },
      { pattern: /\bdata analyst\b/i, weight: 2 }
    ]
  },
  data_analyst: {
    threshold: 3,
    positive: [
      { pattern: /\bdata\s*analyst\b/i, weight: 4, titleBonus: 2 },
      { pattern: /\bdata analysis\b/i, weight: 3 },
      { pattern: /\banalytics\b/i, weight: 2 },
      { pattern: /\bbusiness intelligence\b/i, weight: 3 },
      { pattern: /\bbi\b/i, weight: 1 },
      { pattern: /\breporting\b/i, weight: 2 },
      { pattern: /\bsql\b/i, weight: 2 }
    ],
    negative: [
      { pattern: /\bdata entry\b/i, weight: 3 },
      { pattern: /\bwarehouse operative\b/i, weight: 2 }
    ]
  },
  finance: {
    threshold: 3,
    positive: [
      { pattern: /\bfinance\b/i, weight: 3, titleBonus: 2 },
      { pattern: /\bfinancial\b/i, weight: 2, titleBonus: 1 },
      { pattern: /\baccounting\b/i, weight: 3, titleBonus: 2 },
      { pattern: /\baccounts?\s*(assistant|payable|receivable)?\b/i, weight: 3, titleBonus: 1 },
      { pattern: /\bbookkeep/i, weight: 3, titleBonus: 1 },
      { pattern: /\baudit\b/i, weight: 2 },
      { pattern: /\btax\b/i, weight: 2 },
      { pattern: /\bpayroll\b/i, weight: 2 },
      { pattern: /\bbanking\b/i, weight: 2 },
      { pattern: /\binvestment\b/i, weight: 2 }
    ],
    negative: [
      { pattern: /\bsoftware engineer\b/i, weight: 2 },
      { pattern: /\bdata scientist\b/i, weight: 2 },
      { pattern: /\bnurse\b/i, weight: 2 }
    ]
  }
};

function computeScore(category: Category, title: string, description: string): number {
  const config = categoryScoring[category];
  let score = 0;

  for (const signal of config.positive) {
    if (signal.pattern.test(description)) score += signal.weight;
    if (signal.titleBonus && signal.pattern.test(title)) score += signal.titleBonus;
  }

  for (const signal of config.negative) {
    if (signal.pattern.test(description)) score -= signal.weight;
  }

  return score;
}

export function classifyCategories(
  title: string,
  description: string | null,
  allowedCategories?: readonly Category[]
): Category[] {
  const normalizedTitle = title.trim();
  const text = `${normalizedTitle} ${description ?? ""}`.trim();
  const activeCategories =
    allowedCategories && allowedCategories.length > 0
      ? Array.from(new Set(allowedCategories))
      : (Object.keys(categoryScoring) as Category[]);

  const scored = activeCategories
    .map((category) => {
      const score = computeScore(category, normalizedTitle, text);
      return { category, score };
    })
    .filter((item) => item.score >= categoryScoring[item.category].threshold)
    .sort((a, b) => b.score - a.score);

  return scored.map((item) => item.category);
}
