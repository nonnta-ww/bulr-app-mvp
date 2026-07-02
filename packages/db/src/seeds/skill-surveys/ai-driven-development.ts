/**
 * AI駆動開発 スキルアンケート シードデータ
 *
 * jobType: 'ai-driven-development'
 * Categories: 6
 * Questions: 18
 * Required: 3 (#1 利用ツール, #4 活用深度, #10 生成コード検証レベル)
 */

import type { DB } from '../../client';
import { runSkillSurveySeed } from './runner';

export type AiDrivenDevelopmentSurveySeedData = {
  jobType: 'ai-driven-development';
  title: string;
  categories: Array<{
    name: string;
    subcategory: string;
    displayOrder: number;
    questions: Array<{
      text: string;
      questionType: 'single_choice' | 'multi_choice' | 'free_text';
      displayOrder: number;
      isRequired?: boolean;
      scoringKind?: 'proficiency' | 'recency' | 'frequency';
      choices: Array<{ text: string; displayOrder: number; level?: number }>;
    }>;
  }>;
};

export const aiDrivenDevelopmentSurveySeed: AiDrivenDevelopmentSurveySeedData = {
  jobType: 'ai-driven-development',
  title: 'AI駆動開発スキルアンケート',
  categories: [
    {
      name: 'AI支援開発ツール',
      subcategory: 'ツール利用',
      displayOrder: 0,
      questions: [
        {
          text: '日常的に利用しているAIコーディング支援ツールを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: [
            { text: 'GitHub Copilot', displayOrder: 0 },
            { text: 'Cursor', displayOrder: 1 },
            { text: 'Claude Code', displayOrder: 2 },
            { text: 'Windsurf', displayOrder: 3 },
            { text: 'Cline・Roo Code', displayOrder: 4 },
            { text: 'Codeium', displayOrder: 5 },
            { text: 'Tabnine', displayOrder: 6 },
            { text: 'JetBrains AI Assistant', displayOrder: 7 },
            { text: 'Amazon Q Developer', displayOrder: 8 },
            { text: 'Gemini Code Assist', displayOrder: 9 },
            { text: 'v0', displayOrder: 10 },
            { text: 'bolt.new', displayOrder: 11 },
            { text: 'その他', displayOrder: 12 },
          ],
        },
        {
          text: '利用しているAIチャット/アシスタントを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'ChatGPT', displayOrder: 0 },
            { text: 'Claude', displayOrder: 1 },
            { text: 'Gemini', displayOrder: 2 },
            { text: 'Perplexity', displayOrder: 3 },
            { text: 'GitHub Copilot Chat', displayOrder: 4 },
            { text: 'ローカルLLM（Ollama 等）', displayOrder: 5 },
            { text: 'その他', displayOrder: 6 },
          ],
        },
        {
          text: 'AI支援ツールの利用頻度を選択してください。',
          questionType: 'single_choice',
          displayOrder: 2,
          scoringKind: 'frequency',
          choices: [
            { text: '使っていない', displayOrder: 0, level: 0 },
            { text: 'たまに', displayOrder: 1, level: 1 },
            { text: '日常的に', displayOrder: 2, level: 2 },
            { text: '開発ワークフローの中心', displayOrder: 3, level: 3 },
          ],
        },
      ],
    },
    {
      name: '開発スタイル・ワークフロー',
      subcategory: 'ワークフロー',
      displayOrder: 1,
      questions: [
        {
          text: 'AI活用の深度として最も近いものを選択してください。',
          questionType: 'single_choice',
          displayOrder: 0,
          isRequired: true,
          scoringKind: 'proficiency',
          choices: [
            { text: 'ほぼ使わない', displayOrder: 0, level: 0 },
            { text: '補完中心', displayOrder: 1, level: 1 },
            { text: 'チャットで相談しながら実装', displayOrder: 2, level: 2 },
            { text: 'エージェントに委譲・仕様駆動で運用', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'AIを活用しているSDLCフェーズを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: '要件整理', displayOrder: 0 },
            { text: '設計', displayOrder: 1 },
            { text: '実装', displayOrder: 2 },
            { text: 'テスト生成', displayOrder: 3 },
            { text: 'コードレビュー', displayOrder: 4 },
            { text: 'デバッグ', displayOrder: 5 },
            { text: 'リファクタリング', displayOrder: 6 },
            { text: 'ドキュメント作成', displayOrder: 7 },
            { text: '技術調査・学習', displayOrder: 8 },
            { text: 'データ移行・スクリプト', displayOrder: 9 },
          ],
        },
        {
          text: 'エージェント型開発（タスクを委譲し自律実行させる開発）の習熟度を選択してください。',
          questionType: 'single_choice',
          displayOrder: 2,
          scoringKind: 'proficiency',
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
      ],
    },
    {
      name: 'テクニック',
      subcategory: 'テクニック',
      displayOrder: 2,
      questions: [
        {
          text: '実践しているテクニックを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'プロンプト設計の工夫', displayOrder: 0 },
            { text: '関連ファイル・仕様をコンテキストとして与える', displayOrder: 1 },
            { text: 'カスタムルール・指示ファイル整備（.cursorrules, CLAUDE.md, AGENTS.md 等）', displayOrder: 2 },
            { text: 'MCP・ツール連携', displayOrder: 3 },
            { text: 'サブエージェント・マルチエージェント', displayOrder: 4 },
            { text: 'コードベースを参照させる（RAG的活用）', displayOrder: 5 },
            { text: 'テスト駆動でAIに実装させる', displayOrder: 6 },
            { text: 'AI出力を差分レビューして取り込む', displayOrder: 7 },
          ],
        },
        {
          text: 'プロンプト/コンテキスト設計の習熟度を選択してください。',
          questionType: 'single_choice',
          displayOrder: 1,
          scoringKind: 'proficiency',
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'AI活用で生産性・品質を上げた具体的な工夫、または失敗から学んだことを記述してください。',
          questionType: 'free_text',
          displayOrder: 2,
          choices: [],
        },
      ],
    },
    {
      name: '品質・ガバナンス',
      subcategory: '品質・ガバナンス',
      displayOrder: 3,
      questions: [
        {
          text: 'AI生成コードの検証レベルとして最も近いものを選択してください。',
          questionType: 'single_choice',
          displayOrder: 0,
          isRequired: true,
          scoringKind: 'proficiency',
          choices: [
            { text: 'そのまま使う', displayOrder: 0, level: 0 },
            { text: '目視で確認', displayOrder: 1, level: 1 },
            { text: 'テストで検証', displayOrder: 2, level: 2 },
            { text: 'レビュー基準を整備しチームで運用', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'AI利用で意識しているリスク対策を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: '機密情報をプロンプトに入れない', displayOrder: 0 },
            { text: 'ライセンス・著作権の確認', displayOrder: 1 },
            { text: '幻覚した依存パッケージの検証', displayOrder: 2 },
            { text: '生成コードのセキュリティレビュー', displayOrder: 3 },
            { text: '社内のAI利用ポリシー遵守', displayOrder: 4 },
            { text: '監査ログ・利用範囲の管理', displayOrder: 5 },
          ],
        },
        {
          text: 'チーム/組織でAI活用のルール策定・ガイドライン整備に関与した経験を選択してください。',
          questionType: 'single_choice',
          displayOrder: 2,
          scoringKind: 'proficiency',
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
      ],
    },
    {
      name: 'AI機能の開発経験',
      subcategory: 'LLMアプリ開発',
      displayOrder: 4,
      questions: [
        {
          text: '経験のあるAI/LLM開発要素を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'LLM API連携（OpenAI/Anthropic/Google 等）', displayOrder: 0 },
            { text: '本番でのプロンプトエンジニアリング', displayOrder: 1 },
            { text: 'RAG', displayOrder: 2 },
            { text: 'ベクトルDB・埋め込み', displayOrder: 3 },
            { text: 'エージェント・ツール呼び出し', displayOrder: 4 },
            { text: 'MCPサーバ実装', displayOrder: 5 },
            { text: '評価(eval)パイプライン', displayOrder: 6 },
            { text: 'ガードレール・安全対策', displayOrder: 7 },
            { text: 'ファインチューニング', displayOrder: 8 },
            { text: 'コスト・レイテンシ最適化', displayOrder: 9 },
            { text: 'ストリーミングUX', displayOrder: 10 },
          ],
        },
        {
          text: '利用したAI開発フレームワーク/基盤を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'LangChain', displayOrder: 0 },
            { text: 'LlamaIndex', displayOrder: 1 },
            { text: 'Vercel AI SDK', displayOrder: 2 },
            { text: 'Semantic Kernel', displayOrder: 3 },
            { text: 'DSPy', displayOrder: 4 },
            { text: 'OpenAI SDK', displayOrder: 5 },
            { text: 'Anthropic SDK', displayOrder: 6 },
            { text: 'Amazon Bedrock', displayOrder: 7 },
            { text: 'Google Vertex AI', displayOrder: 8 },
            { text: 'その他', displayOrder: 9 },
          ],
        },
        {
          text: 'LLMアプリ開発の習熟度を選択してください。',
          questionType: 'single_choice',
          displayOrder: 2,
          scoringKind: 'proficiency',
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
      ],
    },
    {
      name: 'AIリテラシー・学習姿勢',
      subcategory: 'リテラシー・学習姿勢',
      displayOrder: 5,
      questions: [
        {
          text: '新しいAIツール・手法のキャッチアップ頻度を選択してください。',
          questionType: 'single_choice',
          displayOrder: 0,
          scoringKind: 'frequency',
          choices: [
            { text: 'ほぼしない', displayOrder: 0, level: 0 },
            { text: 'ときどき', displayOrder: 1, level: 1 },
            { text: '定期的に', displayOrder: 2, level: 2 },
            { text: '常に最新を追い試す', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'モデル特性（コンテキスト長・幻覚・得手不得手）の理解度を選択してください。',
          questionType: 'single_choice',
          displayOrder: 1,
          scoringKind: 'proficiency',
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'AIをどこまで信頼し、どのように検証しているか、あなたの考え方を記述してください。',
          questionType: 'free_text',
          displayOrder: 2,
          choices: [],
        },
      ],
    },
  ],
};

/**
 * ai-driven-development スキルアンケートの seed を投入する（idempotent）。共通ランナーへ委譲する。
 */
export async function runAiDrivenDevelopmentSkillSurveySeed(db: DB): Promise<void> {
  await runSkillSurveySeed(db, aiDrivenDevelopmentSurveySeed, { logLabel: 'ai-driven-development' });
}
