/**
 * プロダクトマネージャー（PdM）スキルアンケート シードデータ（jobType='product-manager'）
 *
 * spec: .kiro/specs/pdm-strategist-survey（設計駆動・正本 CSV なし、design.md の設問設計表が正本）
 *
 * 構成: 先頭に「PdM経験プロフィール」（集計対象外）＋ 8 コンピテンシーカテゴリ。
 * 変換規約（engineering-manager 踏襲）:
 *  - プロフィールは single_choice（scoringKind 無し・非必須）
 *  - 各コンピテンシーは breadth multi_choice 2 問 ＋ コンピテンシー習熟度 single_choice（proficiency, level 0-3）1 問
 *  - 各コンピテンシー先頭 breadth へ isRequired=true（計 8 問）
 *  - 一部コンピテンシー（プロダクト戦略 / データドリブン運用）に自由記述 free_text（任意）
 *  - score_kind enum は既存値（proficiency のみ使用）
 *
 * 職能境界（重要）: 本アンケートは「プロダクトの what/why」に関するコンピテンシーのみを扱い、
 * EM アンケートの領域（1on1・フィードバック・採用面接・評価・報酬・組織設計・キャリア育成等）は
 * 含めない。カテゴリ6「ステークホルダー・組織連携」は対象を「プロダクト意思決定の合意形成」に
 * 限定し、部下の人事評価・採用面接は設問に含めない（design.md「職能境界」節に準拠）。
 *
 * 代表習熟度ペア（ツール選択方式）は不採用（Non-Goals）。コンピテンシー別習熟度を採る。
 */

import type { DB } from '../../client';
import { runSkillSurveySeed } from './runner';

export type ProductManagerSurveySeedData = {
  jobType: 'product-manager';
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

/** 標準習熟度 4 段階（level 0-3）。proficiency 設問で再利用する（engineering-manager と同一ラベル）。 */
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
}): ProductManagerSurveySeedData['categories'][number] {
  const questions: ProductManagerSurveySeedData['categories'][number]['questions'] = [
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

export const productManagerSurveySeed: ProductManagerSurveySeedData = {
  jobType: 'product-manager',
  title: 'プロダクトマネージャー スキルアンケート',
  categories: [
    // ══════════ PdM経験プロフィール（先頭・集計対象外） ══════════
    {
      name: 'PdM経験プロフィール',
      subcategory: 'PdM経験',
      displayOrder: 0,
      questions: [
        {
          text: 'PdM 経験年数を選択してください。',
          questionType: 'single_choice',
          displayOrder: 0,
          choices: choices(['未経験・1年未満', '1〜3年', '3〜5年', '5〜10年', '10年以上']),
        },
        {
          text: '直近で担当したプロダクトのフェーズを選択してください。',
          questionType: 'single_choice',
          displayOrder: 1,
          choices: choices([
            '0→1（新規立ち上げ）',
            'PMF 前後',
            'スケール期（成長）',
            '成熟期・グロース',
            '複数プロダクトのポートフォリオ管理',
          ]),
        },
        {
          text: '事業サイド（営業・マーケティング・事業開発等）との兼務経験はありますか？',
          questionType: 'single_choice',
          displayOrder: 2,
          choices: choices(['はい', 'いいえ']),
        },
      ],
    },

    // ══════════ コンピテンシーカテゴリ（8） ══════════
    competency({
      name: 'プロダクト戦略',
      displayOrder: 1,
      breadthA: {
        text: 'プロダクトのビジョン・戦略策定で実践してきたことを選択してください。',
        choices: [
          'プロダクトビジョン・ミッションの策定',
          '事業戦略とプロダクト戦略の接続',
          '中長期プロダクトロードマップの方向付け',
          'North Star Metric の定義',
          'プロダクト原則（Product Principles）の策定',
          '投資判断・事業計画への関与',
        ],
      },
      breadthB: {
        text: '市場・競合分析、ポジショニングで実践してきたことを選択してください。',
        choices: [
          '市場規模（TAM/SAM/SOM）の分析',
          '競合分析・ベンチマーク',
          'プロダクトポジショニングの定義',
          '差別化戦略の立案',
          '市場トレンド・技術動向の調査',
          '顧客セグメンテーション',
        ],
      },
      freeText: 'プロダクト戦略を立てる際に大切にしている思想や判断基準があれば記述してください。',
    }),

    competency({
      name: 'ディスカバリー・顧客理解',
      displayOrder: 2,
      breadthA: {
        text: '顧客インタビュー・ユーザーリサーチで実践してきたことを選択してください。',
        choices: [
          '顧客インタビューの設計・実施',
          'ユーザーリサーチ計画の立案',
          '定性調査（インタビュー・行動観察）',
          '定量調査（アンケート設計・分析）',
          'ユーザビリティテストの実施',
          'リサーチ結果からのインサイト抽出',
        ],
      },
      breadthB: {
        text: 'ペルソナ・課題仮説の検証で実践してきたことを選択してください。',
        choices: [
          'ペルソナ・ユーザー像の定義',
          'ジョブ理論（JTBD）の活用',
          'カスタマージャーニーマップの作成',
          '課題仮説の立案・検証',
          'プロトタイプ・MVP による検証',
          '顧客課題の優先度評価',
        ],
      },
    }),

    competency({
      name: '優先順位付け・意思決定',
      displayOrder: 3,
      breadthA: {
        text: '優先順位付け・トレードオフ判断で実践してきたことを選択してください。',
        choices: [
          '優先順位フレームワーク（RICE/ICE など）の運用',
          '価値と工数のトレードオフ判断',
          'バックログの優先順位付け・管理',
          'スコープと期日のトレードオフ調整',
          '定量・定性を統合した施策判断',
          '関係者間の優先度の調整',
        ],
      },
      breadthB: {
        text: '撤退判断・不確実性下の意思決定で実践してきたことを選択してください。',
        choices: [
          '機能・プロダクトの撤退判断（サンセット）',
          'Go/No-Go の意思決定',
          '不確実性下での仮説ベース意思決定',
          'リスクとリターンの評価',
          'データが不十分な状況での判断',
          '意思決定の記録・振り返り',
        ],
      },
    }),

    competency({
      name: 'ロードマップ・実行推進',
      displayOrder: 4,
      breadthA: {
        text: 'ロードマップ策定・要求仕様定義で実践してきたことを選択してください。',
        choices: [
          'プロダクトロードマップの策定・更新',
          '要求仕様（PRD）の作成',
          'ユーザーストーリー・受け入れ基準の定義',
          'リリース計画の立案',
          'マイルストーン設計',
          '成功指標（成功の定義）の設定',
        ],
      },
      breadthB: {
        text: '開発チームとの実行伴走・スコープ調整で実践してきたことを選択してください。',
        choices: [
          '開発チームとの要求すり合わせ',
          'スプリント・イテレーションへの関与',
          'スコープ調整・優先度の再交渉',
          'ブロッカーの解消・意思決定の迅速化',
          '進捗の可視化・リスク管理',
          'リリース後の効果測定',
        ],
      },
    }),

    competency({
      name: 'データドリブン運用',
      displayOrder: 5,
      breadthA: {
        text: 'KPI設計・ダッシュボード運用で実践してきたことを選択してください。',
        choices: [
          'KPI・成功指標の設計',
          'ダッシュボードの構築・運用',
          'ファネル分析・コホート分析',
          'プロダクト指標のモニタリング',
          '計測要件・イベント設計の定義',
          '指標の異常検知・原因分析',
        ],
      },
      breadthB: {
        text: 'A/Bテスト・実験からの意思決定で実践してきたことを選択してください。',
        choices: [
          'A/Bテスト・実験の設計',
          '実験結果の統計的評価',
          '実験からの意思決定・横展開',
          '仮説→実験→学習のサイクル運用',
          'セグメント別の効果分析',
          '実験基盤・フィーチャーフラグ運用への関与',
        ],
      },
      freeText: 'データによって当初の意思決定が覆った経験があれば記述してください。',
    }),

    competency({
      name: 'ステークホルダー・組織連携',
      displayOrder: 6,
      breadthA: {
        text: '経営・営業・CS との要望収集と合意形成で実践してきたことを選択してください（プロダクト意思決定に関するもの）。',
        choices: [
          '経営層へのプロダクト提案・承認取得',
          '営業・CS からの顧客要望の収集・整理',
          'プロダクト意思決定に関する合意形成',
          '要望のプロダクト優先度への翻訳',
          'ロードマップの社内共有・期待値調整',
          'プロダクト方針の社内発信',
        ],
      },
      breadthB: {
        text: '開発・デザインとの協働・期待値調整で実践してきたことを選択してください。',
        choices: [
          '開発チームとの要求・制約のすり合わせ',
          'デザインチームとの体験設計の協働',
          '部門横断プロジェクトのファシリテーション',
          'リリース内容・時期の期待値調整',
          '意思決定の背景・根拠の共有',
          'プロダクト仕様に関する合意の文書化',
        ],
      },
    }),

    competency({
      name: 'GTM・グロース連携',
      displayOrder: 7,
      breadthA: {
        text: 'ローンチ計画・GTM戦略で実践してきたことを選択してください。',
        choices: [
          'ローンチ計画の立案・実行',
          'GTM（Go-To-Market）戦略の立案',
          'ポジショニング・メッセージングの整理',
          '価格・パッケージング検討への関与',
          'ローンチ後の効果測定',
          'マーケ・営業への価値訴求の連携',
        ],
      },
      breadthB: {
        text: 'グロース施策との連携で実践してきたことを選択してください。',
        choices: [
          'プロダクト内オンボーディングの改善',
          'アクティベーション率の改善',
          'リテンション施策への関与',
          'バイラリティ・紹介機能の設計',
          '課金・アップセル導線の改善',
          'グロースチームとの施策連携',
        ],
      },
    }),

    competency({
      name: 'UX・ビジネス・テクノロジーの越境',
      displayOrder: 8,
      breadthA: {
        text: 'UX・情報設計への関与で実践してきたことを選択してください。',
        choices: [
          'UX・情報設計のレビューへの参加',
          'ワイヤーフレーム・プロトタイプへのフィードバック',
          'ユーザー体験の一貫性の担保',
          'デザインシステムの理解・活用',
          'アクセシビリティへの配慮',
          '体験と事業目標の両立検討',
        ],
      },
      breadthB: {
        text: '技術的制約の理解・エンジニアとのトレードオフ議論で実践してきたことを選択してください。',
        choices: [
          '技術的制約・実現可能性の理解',
          'エンジニアとの技術トレードオフ議論',
          '技術的負債とプロダクト価値のバランス判断',
          'API・データ連携の要件理解',
          'セキュリティ・プライバシー要件への配慮',
          '技術選定の背景理解（最終決定はエンジニアリング側）',
        ],
      },
    }),
  ],
};

/**
 * product-manager スキルアンケートの seed を投入する（idempotent）。共通ランナーへ委譲する。
 */
export async function runProductManagerSkillSurveySeed(db: DB): Promise<void> {
  await runSkillSurveySeed(db, productManagerSurveySeed, { logLabel: 'product-manager' });
}
