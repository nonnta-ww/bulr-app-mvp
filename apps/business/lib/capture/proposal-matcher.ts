/**
 * ProposalMatcher — 面接官発話と直近 3 候補の照合モジュール
 *
 * Requirements: 3.6, 3.7
 * Design: design.md > ProposalMatcher
 *
 * ## アルゴリズム選択の根拠
 *
 * ### 正規化（normalize 関数）
 * 1. NFKC Unicode 正規化: 全角英数字・記号を半角に統一し、合成文字を分解する。
 *    例）「１２３」→「123」、「ｋｍ」→「km」、「㎡」→「m2」
 * 2. 記号・句読点・区切り文字・空白を除去（Unicode カテゴリ \p{P}\p{S}\p{Z} と \s）:
 *    「どのような、判断基準？」→「どのような判断基準」
 * 3. 小文字化: ラテン文字の大小を統一。日本語文字には影響しない。
 *
 * ### n-gram サイズ（n=2、bigram）
 * 日本語は一文字単位で意味を持つ表語文字を含むため、bigram（2 文字）が適切。
 * - n=1（unigram）: 語順情報を持たず過多マッチしやすい
 * - n=2（bigram）: 10〜30 文字程度の面接質問で十分な識別力を持ち、
 *   軽微な言い換え（助詞・語尾変化）後も共通 bigram が多く残る
 * - n=3（trigram）: 短文（10 文字未満）でスパースになりすぎる
 *
 * ### 類似度指標（Dice 係数）
 * Dice(A, B) = 2|A ∩ B| / (|A| + |B|)
 * A, B は正規化後テキストの bigram 集合（重複除去済み）
 * - 値域 [0, 1]、対称
 * - セットベース: 繰り返し bigram のノイズを排除
 * - 計算コスト O(|bigrams|)、LLM・埋め込み不使用
 *
 * ### 閾値（SIMILARITY_THRESHOLD = 0.3）
 * 実験値（tests/comments 参照）:
 * - 完全一致 → Dice ≈ 1.0
 * - 軽い言い換え（助詞・語尾変化）→ Dice ≈ 0.5–0.8
 * - 無関係な自由質問 → Dice ≈ 0.05–0.15
 * 0.3 は両グループの間に十分なマージンを持つ保守的な値。
 * 面接中のノイズや文字起こし誤り（1〜2 文字程度）には robust。
 *
 * @module proposal-matcher
 */

/** n-gram サイズ（bigram） */
const NGRAM_SIZE = 2;

/**
 * 類似度閾値。この値以上の最大候補を "proposal" として選択する。
 * 未満の場合は "manual"（フリー質問入口、Req 3.7）。
 */
const SIMILARITY_THRESHOLD = 0.3;

/**
 * テキストを正規化する。
 * 1. NFKC Unicode 正規化（全角→半角等）
 * 2. 記号・句読点・空白の除去
 * 3. 小文字化
 *
 * @param text - 正規化前のテキスト
 * @returns 正規化後のテキスト
 */
function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\p{P}\p{S}\p{Z}\s]/gu, "")
    .toLowerCase();
}

/**
 * テキストから文字 n-gram の集合（重複除去）を生成する。
 *
 * @param text - 正規化済みテキスト
 * @param n    - n-gram サイズ（既定 NGRAM_SIZE = 2）
 * @returns n-gram の Set
 */
function ngramSet(text: string, n: number = NGRAM_SIZE): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i <= text.length - n; i++) {
    result.add(text.slice(i, i + n));
  }
  return result;
}

/**
 * 2 つの n-gram 集合間の Dice 係数を計算する。
 * Dice(A, B) = 2|A ∩ B| / (|A| + |B|)
 *
 * @param a - 集合 A（正規化済みテキストの n-gram 集合）
 * @param b - 集合 B
 * @returns [0, 1] の類似度。どちらかが空集合の場合は 0 を返す。
 */
function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const ngram of a) {
    if (b.has(ngram)) intersection++;
  }

  return (2 * intersection) / (a.size + b.size);
}

/** ProposalMatcher の入力型 */
export type MatchInput = {
  interviewerText: string;
  proposal: { candidates: [string, string, string] } | null;
};

/** ProposalMatcher の出力型 */
export type MatchResult =
  | { source: "proposal"; selectedIndex: 0 | 1 | 2 }
  | { source: "manual" };

/**
 * 面接官発話と直近 3 候補を照合し、使用質問を判別する。
 *
 * - 正規化後の bigram Dice 係数で各候補との類似度を算出
 * - 最大類似度が SIMILARITY_THRESHOLD 以上 → proposal（選択候補のインデックスを返す）
 * - 最大類似度が SIMILARITY_THRESHOLD 未満 → manual（フリー質問判定の入口、Req 3.7）
 * - proposal が null の場合も manual を返す
 *
 * @param input - { interviewerText, proposal }
 * @returns MatchResult
 */
export function match(input: MatchInput): MatchResult {
  const { interviewerText, proposal } = input;

  if (proposal === null) {
    return { source: "manual" };
  }

  const normalizedQuery = normalize(interviewerText);
  const queryNgrams = ngramSet(normalizedQuery);

  // 各候補との Dice 係数を計算
  const similarities = proposal.candidates.map((candidate) =>
    diceCoefficient(queryNgrams, ngramSet(normalize(candidate))),
  );

  const maxSimilarity = Math.max(...similarities);

  if (maxSimilarity < SIMILARITY_THRESHOLD) {
    return { source: "manual" };
  }

  // 最大スコアの候補インデックスを選択（同点の場合は最小インデックス）
  const selectedIndex = similarities.indexOf(maxSimilarity) as 0 | 1 | 2;
  return { source: "proposal", selectedIndex };
}
