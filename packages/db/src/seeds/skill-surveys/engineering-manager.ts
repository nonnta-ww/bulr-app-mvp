/**
 * エンジニアリングマネージャー（EM）スキルアンケート シードデータ
 *
 * spec: .kiro/specs/engineering-manager-survey（設計駆動・正本 CSV なし、design.md の設問設計表が正本）
 *
 * 構成: 先頭に「マネジメント経験プロフィール」（集計対象外）＋ 10 コンピテンシーカテゴリ。
 * 変換規約（infrastructure-sre 踏襲）:
 *  - プロフィールは single_choice（scoringKind 無し・非必須）
 *  - 各コンピテンシーは breadth multi_choice 2 問 ＋ コンピテンシー習熟度 single_choice（proficiency, level 0-3）1 問
 *  - 各コンピテンシー先頭 breadth へ isRequired=true（計 10 問）
 *  - 一部コンピテンシー（ピープルマネジメント / 育成・キャリア支援 / 戦略・組織運営）に自由記述 free_text（任意）
 *  - score_kind enum は既存値（proficiency のみ使用）
 *
 * 代表習熟度ペア（ツール選択方式）は EM には不採用（Non-Goals）。コンピテンシー別習熟度を採る。
 */

import { sql } from 'drizzle-orm';
import type { DB } from '../../client';
import {
  skillSurvey,
  skillSurveyCategory,
  skillSurveyQuestion,
  skillSurveyChoice,
} from '../../schema/skill-survey';

export type EngineeringManagerSurveySeedData = {
  jobType: 'engineering-manager';
  title: string;
  categories: Array<{
    name: string;
    subcategory: string | null;
    displayOrder: number;
    questions: Array<{
      text: string;
      questionType: 'single_choice' | 'multi_choice' | 'free_text';
      displayOrder: number;
      isRequired?: boolean;
      scoringKind?: 'proficiency';
      choices: Array<{ text: string; displayOrder: number; level?: number }>;
    }>;
  }>;
};

/**
 * 標準習熟度 4 段階（level 0-3）。proficiency 設問で再利用する。
 * EM は IC（infrastructure-sre）と異なり L2 を「実務で実践したことがある」とする。
 */
const PROFICIENCY_CHOICES = [
  { text: '未経験・知識なし', displayOrder: 0, level: 0 },
  { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
  { text: '実務で実践したことがある', displayOrder: 2, level: 2 },
  { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
];

/** multi_choice / single_choice 選択肢を簡潔に組み立てるヘルパ（displayOrder を自動付与） */
function choices(labels: string[]): Array<{ text: string; displayOrder: number }> {
  return labels.map((text, i) => ({ text, displayOrder: i }));
}

type Breadth = { text: string; choices: string[] };

/**
 * コンピテンシーカテゴリを構築するヘルパ。
 * 構成: breadth-A（必須・multi）→ breadth-B（multi）→ 習熟度（single, proficiency）→ [free_text]
 * 設問 displayOrder はカテゴリ内 0..n-1 連番。
 */
function competency(opts: {
  name: string;
  displayOrder: number;
  breadthA: Breadth;
  breadthB: Breadth;
  freeText?: string;
}): EngineeringManagerSurveySeedData['categories'][number] {
  const questions: EngineeringManagerSurveySeedData['categories'][number]['questions'] = [
    {
      text: opts.breadthA.text,
      questionType: 'multi_choice',
      displayOrder: 0,
      isRequired: true,
      choices: choices(opts.breadthA.choices),
    },
    {
      text: opts.breadthB.text,
      questionType: 'multi_choice',
      displayOrder: 1,
      choices: choices(opts.breadthB.choices),
    },
    {
      text: `${opts.name}の習熟度を選択してください。`,
      questionType: 'single_choice',
      scoringKind: 'proficiency',
      displayOrder: 2,
      choices: PROFICIENCY_CHOICES,
    },
  ];

  if (opts.freeText) {
    questions.push({
      text: opts.freeText,
      questionType: 'free_text',
      displayOrder: 3,
      choices: [],
    });
  }

  return {
    name: opts.name,
    subcategory: 'コンピテンシー',
    displayOrder: opts.displayOrder,
    questions,
  };
}

export const engineeringManagerSurveySeed: EngineeringManagerSurveySeedData = {
  jobType: 'engineering-manager',
  title: 'エンジニアリングマネージャー スキルアンケート',
  categories: [
    // ══════════ マネジメント経験プロフィール（先頭・集計対象外） ══════════
    {
      name: 'マネジメント経験プロフィール',
      subcategory: 'マネジメント経験',
      displayOrder: 0,
      questions: [
        {
          text: 'マネジメント経験年数を選択してください。',
          questionType: 'single_choice',
          displayOrder: 0,
          choices: choices(['未経験・1年未満', '1〜3年', '3〜5年', '5〜10年', '10年以上']),
        },
        {
          text: '直近で管理したチーム規模を選択してください。',
          questionType: 'single_choice',
          displayOrder: 1,
          choices: choices(['経験なし', '1〜3名', '4〜7名', '8〜15名', '16名以上']),
        },
        {
          text: 'マネージャーを管理した経験（manager-of-managers）はありますか？',
          questionType: 'single_choice',
          displayOrder: 2,
          choices: choices(['はい', 'いいえ']),
        },
      ],
    },

    // ══════════ コンピテンシーカテゴリ（10） ══════════
    competency({
      name: 'ピープルマネジメント',
      displayOrder: 1,
      breadthA: {
        text: 'ピープルマネジメント（1on1・フィードバック・信頼構築）で実践してきたことを選択してください。',
        choices: [
          '定期的な 1on1 の実施・運用',
          '建設的なフィードバックの提供',
          '成果と行動に基づく承認・称賛',
          '傾聴・共感を通じた信頼関係の構築',
          '個々のキャリア志向・価値観の把握',
          '期待値のすり合わせ',
        ],
      },
      breadthB: {
        text: 'モチベーション・心理的安全性・困難な会話で実践してきたことを選択してください。',
        choices: [
          'メンバーのモチベーション要因の把握・喚起',
          '心理的安全性の醸成',
          '耳の痛いフィードバック・困難な会話の実施',
          'コンフリクト（対立）の仲裁・解消',
          'エンゲージメント低下の早期察知と対応',
          '多様な個性・働き方への配慮',
        ],
      },
      freeText: 'これまでに直面した難しい意思決定と、そこから得た学びがあれば記述してください。',
    }),

    competency({
      name: '採用・チーム組成',
      displayOrder: 2,
      breadthA: {
        text: '採用（採用要件・構造化面接・パイプライン）で実践してきたことを選択してください。',
        choices: [
          '採用要件・ジョブディスクリプションの定義',
          '構造化面接の設計・実施',
          '評価基準・スコアカードの整備',
          '候補者パイプラインの構築・管理',
          'スカウト・リファラル採用の推進',
          '面接官のトレーニング・キャリブレーション',
        ],
      },
      breadthB: {
        text: 'オンボーディング・チーム編成・D&I 採用で実践してきたことを選択してください。',
        choices: [
          'オンボーディングプログラムの設計・運用',
          '立ち上がり（ramp-up）支援',
          'チーム編成・役割分担の設計',
          'スキルギャップを踏まえた採用計画',
          'D&I（多様性）を意識した採用',
          '採用ブランディング・候補者体験の改善',
        ],
      },
    }),

    competency({
      name: '育成・キャリア支援',
      displayOrder: 3,
      breadthA: {
        text: '育成（コーチング・メンタリング）で実践してきたことを選択してください。',
        choices: [
          'コーチングによる自律的成長支援',
          'メンタリング・技術指導',
          '強み・弱みのフィードバックと育成計画',
          'ストレッチアサインメントの付与',
          '学習機会・研修の提供',
          '振り返り（リフレクション）の促進',
        ],
      },
      breadthB: {
        text: 'キャリアラダー・後継者育成・役割設計で実践してきたことを選択してください。',
        choices: [
          'キャリアラダー・等級制度の運用',
          'キャリアパスの提示・支援',
          '後継者育成（サクセッションプランニング）',
          '強みベースの役割設計',
          '昇格・昇進の推薦・支援',
          '社内異動・ローテーションの支援',
        ],
      },
      freeText: '印象に残っているメンバー育成の事例があれば記述してください。',
    }),

    competency({
      name: 'パフォーマンスマネジメント',
      displayOrder: 4,
      breadthA: {
        text: '目標設定（OKR/MBO）・評価レビューで実践してきたことを選択してください。',
        choices: [
          '目標設定（OKR/MBO）の運用',
          '目標と組織方針の整合（アラインメント）',
          '定期的な進捗レビュー・軌道修正',
          '評価（パフォーマンスレビュー）の実施',
          '360 度フィードバックの運用',
          '評価コメント・フィードバックの言語化',
        ],
      },
      breadthB: {
        text: '報酬・昇進・ローパフォーマー対応・公平性で実践してきたことを選択してください。',
        choices: [
          '報酬・給与改定の検討・提案',
          '昇進・昇格の判断・推薦',
          'ローパフォーマー対応（改善計画/PIP）',
          '評価の公平性・バイアス低減',
          'キャリブレーション会議の運営',
          '納得感のある評価フィードバック',
        ],
      },
    }),

    competency({
      name: 'デリバリーマネジメント',
      displayOrder: 5,
      breadthA: {
        text: 'スコープ・見積もり・優先順位付けで実践してきたことを選択してください。',
        choices: [
          'スコープ定義・要件整理',
          '見積もり・工数計画',
          '優先順位付け（トレードオフ判断）',
          'ロードマップ・マイルストーン管理',
          '進捗の可視化・トラッキング',
          'ステークホルダーとの納期調整',
        ],
      },
      breadthB: {
        text: 'リスク・依存管理・アジャイル運用・横断調整で実践してきたことを選択してください。',
        choices: [
          'リスクの特定・対応計画',
          '依存関係・ブロッカーの管理',
          'アジャイル/スクラムの運用・改善',
          '横断チーム・他部門との調整',
          'デリバリーメトリクス（ベロシティ等）の活用',
          'スコープクリープへの対応',
        ],
      },
    }),

    competency({
      name: '技術リーダーシップ',
      displayOrder: 6,
      breadthA: {
        text: '技術方針・アーキ判断・技術選定への関与で実践してきたことを選択してください。',
        choices: [
          '技術方針・技術戦略の策定',
          'アーキテクチャ判断への関与・意思決定',
          '技術選定（言語/FW/基盤）の支援・承認',
          '技術的トレードオフの整理・合意形成',
          '技術ロードマップの策定',
          '設計レビューへの参加',
        ],
      },
      breadthB: {
        text: '品質・レビュー文化・技術的負債・標準策定で実践してきたことを選択してください。',
        choices: [
          'コードレビュー文化の醸成',
          '品質基準・Done の定義',
          '技術的負債の可視化・返済計画',
          'コーディング規約・標準の策定',
          '技術ドキュメント文化の推進',
          'セキュリティ・品質ゲートの整備',
        ],
      },
    }),

    competency({
      name: 'ステークホルダー・コミュニケーション',
      displayOrder: 7,
      breadthA: {
        text: '経営・PM・他部門との連携で実践してきたことを選択してください。',
        choices: [
          '経営層への報告・提案',
          'プロダクトマネージャーとの連携',
          '他部門（営業/CS/法務 等）との連携',
          '部門横断プロジェクトの推進',
          '定例報告・情報共有の設計',
          'エスカレーションの適切な実施',
        ],
      },
      breadthB: {
        text: '期待値調整・交渉・影響力で実践してきたことを選択してください。',
        choices: [
          '期待値の調整・すり合わせ',
          'リソース・優先度の交渉',
          '権限を超えた影響力（influence without authority）の発揮',
          '利害対立の調整・合意形成',
          '悪いニュースの透明な開示・伝達',
          'ナラティブ（文脈・ストーリー）による説得',
        ],
      },
    }),

    competency({
      name: '戦略・組織運営',
      displayOrder: 8,
      breadthA: {
        text: 'ロードマップ・予算・リソース計画で実践してきたことを選択してください。',
        choices: [
          '中長期ロードマップの策定',
          '予算策定・コスト管理',
          'リソース（要員）計画',
          '投資対効果（ROI）の検討',
          '採用計画と事業計画の接続',
          'KPI・目標の設定',
        ],
      },
      breadthB: {
        text: '組織設計・目標カスケード・ビジョン浸透で実践してきたことを選択してください。',
        choices: [
          '組織設計・チームトポロジーの検討',
          '目標のカスケード（経営→チーム）',
          'ビジョン・ミッションの浸透',
          '組織文化・バリューの体現',
          '変革（チェンジマネジメント）の推進',
          '組織の拡大（スケール）への対応',
        ],
      },
      freeText: 'あなたのマネジメント哲学・大切にしている価値観を記述してください。',
    }),

    competency({
      name: 'チーム文化・エンゲージメント',
      displayOrder: 9,
      breadthA: {
        text: '心理的安全性・エンゲージメント計測で実践してきたことを選択してください。',
        choices: [
          '心理的安全性の醸成・計測',
          'エンゲージメントサーベイの実施・分析',
          'eNPS 等の指標のモニタリング',
          '1on1・サーベイからの課題抽出',
          'チームの健全性の可視化',
          '改善アクションの実行・追跡',
        ],
      },
      breadthB: {
        text: '文化醸成・DEI・バーンアウト予防で実践してきたことを選択してください。',
        choices: [
          'チームの行動規範・カルチャー醸成',
          'DEI（多様性・公平性・包摂）の推進',
          'バーンアウト・過負荷の予防',
          'リモート/ハイブリッドでの一体感づくり',
          '称賛・感謝の文化づくり',
          '離職の予兆検知・リテンション施策',
        ],
      },
    }),

    competency({
      name: 'プロセス・オペレーショナルエクセレンス',
      displayOrder: 10,
      breadthA: {
        text: 'プロセス改善・生産性メトリクス（DORA/SPACE）で実践してきたことを選択してください。',
        choices: [
          '開発プロセスの設計・改善',
          '生産性メトリクス（DORA/SPACE）の活用',
          'ボトルネック・ムダの特定と解消',
          '振り返り（レトロスペクティブ）の運営',
          'ワークフロー・ツールの整備',
          '継続的改善（カイゼン）文化の醸成',
        ],
      },
      breadthB: {
        text: 'インシデント文化・オンコール方針・ナレッジ共有で実践してきたことを選択してください。',
        choices: [
          'インシデント対応プロセスの整備',
          'ブレームレスなインシデント文化の醸成',
          'オンコール体制・負荷の方針策定',
          'ポストモーテム・再発防止の仕組み化',
          'ナレッジ共有・ドキュメント文化の推進',
          '運用負荷（トイル）の削減推進',
        ],
      },
    }),
  ],
};

/**
 * エンジニアリングマネージャー スキルアンケートのシードデータを DB に投入する（idempotent）。
 *
 * upsert 方式（onConflictDoUpdate）を全テーブルで統一使用。
 * 各テーブルの id は初回生成後不変（set に id を含めない）。
 * backend / frontend / ai-driven-development / infrastructure-sre seed と同型。
 */
export async function runEngineeringManagerSkillSurveySeed(db: DB): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. survey をアップサート
    const [survey] = await tx
      .insert(skillSurvey)
      .values({
        jobType: engineeringManagerSurveySeed.jobType,
        title: engineeringManagerSurveySeed.title,
      })
      .onConflictDoUpdate({
        target: skillSurvey.jobType,
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: skillSurvey.id });

    if (!survey) throw new Error('Failed to upsert skill_survey row');
    const surveyId = survey.id;

    let totalCategories = 0;
    let totalQuestions = 0;
    let totalChoices = 0;

    for (const category of engineeringManagerSurveySeed.categories) {
      // 2. category をアップサート
      const [cat] = await tx
        .insert(skillSurveyCategory)
        .values({
          skillSurveyId: surveyId,
          name: category.name,
          subcategory: category.subcategory,
          displayOrder: category.displayOrder,
        })
        .onConflictDoUpdate({
          target: [
            skillSurveyCategory.skillSurveyId,
            skillSurveyCategory.name,
            skillSurveyCategory.subcategory,
          ],
          set: {
            displayOrder: sql`excluded.display_order`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: skillSurveyCategory.id });

      if (!cat) throw new Error(`Failed to upsert category: ${category.name} / ${category.subcategory}`);
      const categoryId = cat.id;
      totalCategories++;

      for (const question of category.questions) {
        // 3. question をアップサート
        const [q] = await tx
          .insert(skillSurveyQuestion)
          .values({
            categoryId,
            body: question.text,
            questionType: question.questionType,
            scoringKind: question.scoringKind ?? null,
            displayOrder: question.displayOrder,
            isRequired: question.isRequired ?? false,
          })
          .onConflictDoUpdate({
            target: [skillSurveyQuestion.categoryId, skillSurveyQuestion.body],
            set: {
              questionType: sql`excluded.question_type`,
              scoringKind: sql`excluded.scoring_kind`,
              displayOrder: sql`excluded.display_order`,
              isRequired: sql`excluded.is_required`,
              updatedAt: new Date(),
            },
          })
          .returning({ id: skillSurveyQuestion.id });

        if (!q) throw new Error(`Failed to upsert question: ${question.text}`);
        const questionId = q.id;
        totalQuestions++;

        for (const choice of question.choices) {
          // 4. choice をアップサート
          await tx
            .insert(skillSurveyChoice)
            .values({
              questionId,
              label: choice.text,
              level: choice.level ?? null,
              displayOrder: choice.displayOrder,
            })
            .onConflictDoUpdate({
              target: [skillSurveyChoice.questionId, skillSurveyChoice.label],
              set: {
                level: sql`excluded.level`,
                displayOrder: sql`excluded.display_order`,
              },
            });

          totalChoices++;
        }
      }
    }

    console.log(
      `[skill-survey/engineering-manager] categories: ${totalCategories}, questions: ${totalQuestions}, choices: ${totalChoices}`,
    );
  });
}
