/**
 * PatternMatchingUtil
 *
 * スキルアンケート回答テキストと assessment_pattern の title/description の
 * キーワード含有マッチングを行う純関数モジュール。
 *
 * ML・ベクトル検索は使用しない（MVP キーワードマッチングのみ）。
 * Requirements: 3.2, 3.7
 */

import type { AssessmentPattern } from '@bulr/db/schema';
import type { SkillSurveyResponseWithAnswers } from '@bulr/db';

// --- Types ---

export type PatternMatch = {
  patternCode: string;
  patternTitle: string;
  patternCategory: string;
  matchScore: number; // マッチしたキーワード数
  matchedKeywords: string[];
};

// --- Tokenization ---

/**
 * テキストをトークン（小文字の単語）に分割する。
 * 日本語を含むテキストはホワイトスペースと記号で分割するシンプルな方式を採用（MVP）。
 * 長さ 2 未満のトークンはノイズとして除外する。
 */
function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    // 空白・句読点・記号・スラッシュ・ハイフン等で分割
    .split(/[\s　.,、。・:：;；!！?？/／\-_()（）【】「」『』]+/)
    .filter((token) => token.length >= 2);

  return new Set(tokens);
}

/**
 * 回答テキスト（質問本文 + 記述回答）からキーワードセットを抽出する。
 *
 * `selectedChoiceIds` は ID 文字列であり人間可読テキストではないため除外する。
 * 代わりに質問の `body`（質問文）と `freeText`（記述回答）を使用する。
 */
function extractAnswerTokens(answers: SkillSurveyResponseWithAnswers): Set<string> {
  const combined: string[] = [];

  for (const { answer, question } of answers.answers) {
    // 質問文をキーワードソースとして使用
    combined.push(question.body);
    // 記述回答があれば追加
    if (answer.freeText) {
      combined.push(answer.freeText);
    }
  }

  return tokenize(combined.join(' '));
}

/**
 * パターンの title + description からキーワードセットを抽出する。
 */
function extractPatternTokens(
  pattern: Pick<AssessmentPattern, 'title' | 'description'>,
): Set<string> {
  return tokenize(`${pattern.title} ${pattern.description}`);
}

// --- Core ---

/**
 * スキルアンケート回答と assessment_pattern のキーワードマッチングを行い、
 * `matchScore > 0` のパターンを `matchScore` 降順で返す。
 *
 * @param answers - スキルアンケートの回答データ
 * @param patterns - マッチング対象の assessment_pattern リスト
 * @returns マッチしたパターンを matchScore 降順・patternCode 昇順で並べたリスト
 */
export function matchPatterns(
  answers: SkillSurveyResponseWithAnswers,
  patterns: Pick<AssessmentPattern, 'code' | 'title' | 'description' | 'category'>[],
): PatternMatch[] {
  const answerTokens = extractAnswerTokens(answers);

  const results: PatternMatch[] = [];

  for (const pattern of patterns) {
    const patternTokens = extractPatternTokens(pattern);

    const matchedKeywords: string[] = [];

    // 回答トークンとパターントークンの共通集合を求める
    for (const token of answerTokens) {
      if (patternTokens.has(token)) {
        matchedKeywords.push(token);
      }
    }

    const matchScore = matchedKeywords.length;

    if (matchScore > 0) {
      results.push({
        patternCode: pattern.code,
        patternTitle: pattern.title,
        patternCategory: pattern.category,
        matchScore,
        matchedKeywords,
      });
    }
  }

  // matchScore 降順、同点の場合は patternCode 昇順（決定論的な安定ソート）
  results.sort((a, b) => {
    if (b.matchScore !== a.matchScore) {
      return b.matchScore - a.matchScore;
    }
    return a.patternCode.localeCompare(b.patternCode);
  });

  return results;
}
