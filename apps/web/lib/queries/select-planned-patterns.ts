import type { AssessmentPattern, PatternCategory } from '@bulr/db/schema';

/**
 * キーワード辞書: backgroundSummary 中のキーワードにマッチしたパターンカテゴリの優先度を上げる。
 * 各エントリーは { keywords: string[], boostCategories: PatternCategory[] } の形式。
 */
const KEYWORD_BOOST_RULES: Array<{
  keywords: string[];
  boostCategories: PatternCategory[];
}> = [
  // AI / LLM 関連
  {
    keywords: [
      'llm', 'gpt', 'chatgpt', 'claude', 'gemini', 'openai', 'anthropic',
      'ai', 'ml', '機械学習', '人工知能', 'rag', 'embedding', 'ベクトル',
      'エージェント', 'agent', 'プロンプト', 'prompt', 'fine-tuning',
      'ファインチューニング', '生成ai', '生成 ai',
    ],
    boostCategories: ['ai'],
  },
  // パフォーマンス・スケール関連
  {
    keywords: [
      'パフォーマンス', 'performance', '高負荷', 'スケール', 'scaling',
      'キャッシュ', 'cache', 'レイテンシ', 'latency', 'スループット',
      'throughput', 'ボトルネック', 'bottleneck', 'p99', 'p999',
      '負荷試験', '大量データ', 'バッチ', 'クエリ最適化', 'インデックス',
    ],
    boostCategories: ['performance'],
  },
  // セキュリティ関連
  {
    keywords: [
      'セキュリティ', 'security', '脆弱性', 'vulnerability', '認証', 'auth',
      '認可', 'authorization', '個人情報', 'pii', '暗号化', 'encryption',
      'コンプライアンス', 'compliance', 'gdpr', '障害対応', 'インシデント',
      'クレデンシャル', 'credential', 'アクセス制御',
    ],
    boostCategories: ['security'],
  },
  // 組織・チーム関連
  {
    keywords: [
      'チームリード', 'tech lead', 'テックリード', 'マネージャー', 'manager',
      'メンバー育成', '採用', '面接', 'オンボーディング', 'onboarding',
      'コードレビュー', '開発プロセス', 'アジャイル', 'スクラム', 'scrum',
      '合意形成', '要件定義', '組織', 'organization', 'リファクタリング',
    ],
    boostCategories: ['organization'],
  },
  // トラブルシューティング関連
  {
    keywords: [
      '障害', 'incident', 'outage', 'デバッグ', 'debug', 'トラブル',
      'ポストモーテム', 'postmortem', '本番', 'production', '復旧',
      'メモリリーク', 'memory leak', '不整合', 'データ破損',
    ],
    boostCategories: ['trouble'],
  },
  // システム設計関連
  {
    keywords: [
      'アーキテクチャ', 'architecture', 'マイクロサービス', 'microservice',
      'モノリス', 'monolith', 'api設計', 'api design', 'スキーマ設計',
      'ドメイン設計', 'ddd', 'マルチテナント', 'multitenant',
      '非同期', 'async', 'メッセージキュー', 'kafka', 'rabbitmq',
    ],
    boostCategories: ['design'],
  },
];

/** 各カテゴリのデフォルト選定数 (合計 10 件) */
const CATEGORY_DEFAULT_COUNTS: Record<PatternCategory, number> = {
  design: 3,
  trouble: 2,
  performance: 1,
  security: 1,
  organization: 1,
  ai: 2, // ai カテゴリは最低 1 件以上必須のため、デフォルトで多めに割り当て
};

/** カテゴリ全種 */
const ALL_CATEGORIES: PatternCategory[] = [
  'design',
  'trouble',
  'performance',
  'security',
  'organization',
  'ai',
];

/** 8-12 件の上下限 */
const MIN_PATTERNS = 8;
const MAX_PATTERNS = 12;

/**
 * backgroundSummary にキーワードがマッチするカテゴリに対してブーストスコアを返す。
 * 数値が高いほど優先度が高い。
 */
function computeCategoryBoost(
  backgroundSummary: string,
): Partial<Record<PatternCategory, number>> {
  const lower = backgroundSummary.toLowerCase();
  const boostMap: Partial<Record<PatternCategory, number>> = {};

  for (const rule of KEYWORD_BOOST_RULES) {
    const matchCount = rule.keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
    if (matchCount > 0) {
      for (const cat of rule.boostCategories) {
        boostMap[cat] = (boostMap[cat] ?? 0) + matchCount;
      }
    }
  }

  return boostMap;
}

/**
 * パターンリストからカテゴリごとに指定件数を選定し、code 配列を返す。
 * パターンはリストの先頭から選択される（seed データの順序を尊重）。
 */
function selectFromCategory(
  patterns: AssessmentPattern[],
  category: PatternCategory,
  count: number,
): string[] {
  return patterns
    .filter((p) => p.category === category && p.is_active)
    .slice(0, count)
    .map((p) => p.code);
}

/**
 * `assessment_pattern` の有効パターン一覧から、backgroundSummary に応じた
 * 8-12 件のパターンコードを選定する純関数。
 *
 * アルゴリズム (Stage 1):
 * 1. カテゴリ多様性確保: 全 6 カテゴリから最低 1 件ずつ選定
 * 2. ai カテゴリ必須: 少なくとも 1 件の ai カテゴリパターンを含む
 * 3. キーワードマッチ: backgroundSummary のキーワードに基づきカテゴリの選定数をブースト
 * 4. 合計 8-12 件に収める
 */
export function selectPlannedPatterns(input: {
  backgroundSummary: string;
  allActivePatterns: AssessmentPattern[];
}): string[] {
  const { backgroundSummary, allActivePatterns } = input;

  // カテゴリブーストを計算
  const boostMap = computeCategoryBoost(backgroundSummary);

  // カテゴリごとの選定数を決定 (base = デフォルト、ブーストがある場合は +1)
  const categoryCounts: Record<PatternCategory, number> = { ...CATEGORY_DEFAULT_COUNTS };

  // ブーストが強いカテゴリに追加割り当て
  const boostedCategories = (Object.entries(boostMap) as [PatternCategory, number][])
    .filter(([, score]) => score > 0)
    .sort(([, a], [, b]) => b - a);

  for (const [cat] of boostedCategories) {
    // ブーストされたカテゴリに +1、ただし上限を守る
    // まず他のカテゴリから 1 件削減してブーストカテゴリに追加する
    const donorCategory = ALL_CATEGORIES.find(
      (c) => c !== cat && categoryCounts[c] > 1,
    );
    if (donorCategory) {
      categoryCounts[donorCategory]--;
      categoryCounts[cat]++;
    }
  }

  // ai カテゴリ必須保証
  if (categoryCounts['ai'] < 1) {
    categoryCounts['ai'] = 1;
    // 他から 1 件削減
    const donor = ALL_CATEGORIES.find((c) => c !== 'ai' && categoryCounts[c] > 1);
    if (donor) categoryCounts[donor]--;
  }

  // 合計チェック・MIN/MAX の範囲に収める
  const total = ALL_CATEGORIES.reduce((sum, cat) => sum + categoryCounts[cat], 0);

  if (total < MIN_PATTERNS) {
    const deficit = MIN_PATTERNS - total;
    // deficit 分を ai や design に追加
    categoryCounts['design'] += deficit;
  } else if (total > MAX_PATTERNS) {
    let excess = total - MAX_PATTERNS;
    for (const cat of [...ALL_CATEGORIES].reverse()) {
      if (excess <= 0) break;
      const reducible = Math.max(0, categoryCounts[cat] - 1);
      const reduce = Math.min(reducible, excess);
      categoryCounts[cat] -= reduce;
      excess -= reduce;
    }
  }

  // 各カテゴリからパターンを選定
  const selected: string[] = [];
  for (const cat of ALL_CATEGORIES) {
    const codes = selectFromCategory(allActivePatterns, cat, categoryCounts[cat]);
    selected.push(...codes);
  }

  // フォールバック: 選定件数が MIN を下回る場合、残りのアクティブパターンで補充
  if (selected.length < MIN_PATTERNS) {
    const selectedSet = new Set(selected);
    const remaining = allActivePatterns
      .filter((p) => p.is_active && !selectedSet.has(p.code))
      .map((p) => p.code);
    selected.push(...remaining.slice(0, MIN_PATTERNS - selected.length));
  }

  // MAX を超えた場合はトリム
  return selected.slice(0, MAX_PATTERNS);
}
