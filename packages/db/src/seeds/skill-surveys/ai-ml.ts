/**
 * AI/ML・データ スキルアンケート シードデータ（jobType='ai-ml'）
 *
 * spec: .kiro/specs/sage-survey（設計駆動・正本 CSV なし。設問正本は design.md の設問設計表）
 *
 * 構成: 6 トップカテゴリ（機械学習基礎／モデル開発・評価／データエンジニアリング／
 * 推薦・検索／MLOps／分析・可視化）。
 * 変換規約（infrastructure-sre 踏襲）:
 *  - 経験選択系は multi_choice（scoringKind 無し）
 *  - 技術・手法選択系 4 カテゴリ（機械学習基礎／モデル開発・評価／データエンジニアリング／MLOps）に
 *    代表習熟度ペア（最も得意な X を1つ選ぶ single_choice ＋ 習熟度 proficiency single_choice level 0-3）を付与
 *  - 各トップカテゴリ先頭の経験設問へ isRequired=true（計 6 問）
 *  - 分析・可視化カテゴリに自由記述設問（free_text, 任意）を 1 問配置
 *  - score_kind enum は既存値（proficiency のみ使用。recency/frequency 未使用）
 *
 * ai-driven-development-survey との境界: 本アンケートは「AI/ML モデル・データそのものを設計・
 * 学習・評価・運用する専門技術」（sage 職掌）を測る。AI コーディング支援ツール（Copilot 等、
 * ranger 職掌）は選択肢に一切含めない。
 */

import type { DB } from '../../client';
import { runSkillSurveySeed } from './runner';

export type AiMlSurveySeedData = {
  jobType: 'ai-ml';
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

/** 標準習熟度 4 段階（level 0-3）。proficiency 設問で再利用する。 */
const PROFICIENCY_CHOICES = [
  { text: '未経験・知識なし', displayOrder: 0, level: 0 },
  { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
  { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
  { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
];

/** multi_choice / single_choice 選択肢を簡潔に組み立てるヘルパ（displayOrder を自動付与） */
function choices(labels: string[]): Array<{ text: string; displayOrder: number }> {
  return labels.map((text, i) => ({ text, displayOrder: i }));
}

export const aiMlSurveySeed: AiMlSurveySeedData = {
  jobType: 'ai-ml',
  title: 'AI/ML・データ スキルアンケート',
  categories: [
    // ══════════ 1. 機械学習基礎 ★ ══════════
    {
      name: '機械学習基礎',
      subcategory: '手法・基礎',
      displayOrder: 0,
      questions: [
        {
          text: '経験のある学習パラダイム・アルゴリズムを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            '教師あり学習',
            '教師なし学習',
            '強化学習',
            '決定木・アンサンブル（Random Forest, XGBoost, LightGBM）',
            'サポートベクターマシン',
            'ニューラルネットワーク基礎',
            '深層学習（CNN/RNN/Transformer）',
            '生成モデル（GAN, VAE, 拡散モデル）',
            '大規模言語モデル（事前学習・アーキテクチャ理解）',
          ]),
        },
        {
          text: '数理・評価の基礎で理解しているものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: choices([
            '線形代数・微積分',
            '確率・統計',
            '最適化（勾配降下法など）',
            '損失関数・正則化',
            'バイアス-バリアンストレードオフ',
            '過学習・汎化性能',
            '評価指標（Precision/Recall/F1/AUC など）',
            '交差検証',
          ]),
        },
      ],
    },
    {
      name: '機械学習基礎',
      subcategory: '代表習熟度',
      displayOrder: 1,
      questions: [
        {
          text: '最も得意な手法群を1つ選んでください。',
          questionType: 'single_choice',
          displayOrder: 0,
          choices: choices([
            '教師あり学習',
            '教師なし学習',
            '強化学習',
            '決定木・アンサンブル',
            '深層学習',
            '生成モデル',
            '大規模言語モデル',
            'その他',
          ]),
        },
        {
          text: '選んだ手法群の習熟度を教えてください。',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: PROFICIENCY_CHOICES,
        },
      ],
    },
    // ══════════ 2. モデル開発・評価 ★ ══════════
    {
      name: 'モデル開発・評価',
      subcategory: '開発・評価',
      displayOrder: 2,
      questions: [
        {
          text: '経験のある ML/DL フレームワークを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            'scikit-learn',
            'PyTorch',
            'TensorFlow',
            'Keras',
            'JAX',
            'XGBoost',
            'LightGBM',
            'Hugging Face Transformers',
            'Hugging Face 生態系（Datasets, PEFT 等）',
          ]),
        },
        {
          text: 'モデル開発プロセスで経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: choices([
            'データ分割・前処理',
            'ハイパーパラメータ探索（Optuna など）',
            '転移学習・ファインチューニング',
            '分散学習・混合精度学習',
            '実験管理・再現性の確保',
            'モデル圧縮・量子化・蒸留',
          ]),
        },
        {
          text: '評価・検証手法で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 2,
          choices: choices([
            '交差検証',
            'ホールドアウト検証',
            '混同行列・ROC/PR 曲線',
            'オフライン評価指標の設計',
            'アブレーションスタディ',
            'モデルの誤り分析',
            '公平性・バイアス評価',
          ]),
        },
      ],
    },
    {
      name: 'モデル開発・評価',
      subcategory: '代表習熟度',
      displayOrder: 3,
      questions: [
        {
          text: '最も得意な ML/DL フレームワークを1つ選んでください。',
          questionType: 'single_choice',
          displayOrder: 0,
          choices: choices([
            'scikit-learn',
            'PyTorch',
            'TensorFlow',
            'Keras',
            'JAX',
            'Hugging Face Transformers',
            'その他',
          ]),
        },
        {
          text: '選んだフレームワークの習熟度を教えてください。',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: PROFICIENCY_CHOICES,
        },
      ],
    },
    // ══════════ 3. データエンジニアリング ★ ══════════
    {
      name: 'データエンジニアリング',
      subcategory: 'パイプライン・特徴量',
      displayOrder: 4,
      questions: [
        {
          text: 'データ収集・前処理・パイプライン構築で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            'データ収集・スクレイピング',
            'データクレンジング・前処理',
            'ETL/ELT パイプライン構築',
            'バッチ処理',
            'ストリーミング処理',
            'データ品質検証',
            'ワークフローオーケストレーション',
          ]),
        },
        {
          text: '利用経験のあるデータ基盤・ツールを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: choices([
            'Apache Spark',
            'Apache Airflow',
            'dbt',
            'Kafka',
            'BigQuery',
            'Snowflake',
            'Databricks',
            'Feature Store（Feast など）',
            'Pandas・Polars',
          ]),
        },
        {
          text: '特徴量エンジニアリングで経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 2,
          choices: choices([
            '特徴量の設計・生成',
            'カテゴリ変数のエンコーディング',
            '欠損値・外れ値処理',
            '特徴量選択',
            '次元削減（PCA など）',
            '特徴量ストア運用',
            '時系列特徴量の生成',
          ]),
        },
      ],
    },
    {
      name: 'データエンジニアリング',
      subcategory: '代表習熟度',
      displayOrder: 5,
      questions: [
        {
          text: '最も得意なデータ基盤・ツールを1つ選んでください。',
          questionType: 'single_choice',
          displayOrder: 0,
          choices: choices([
            'Apache Spark',
            'Apache Airflow',
            'dbt',
            'BigQuery',
            'Snowflake',
            'Databricks',
            'Pandas・Polars',
            'その他',
          ]),
        },
        {
          text: '選んだデータ基盤・ツールの習熟度を教えてください。',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: PROFICIENCY_CHOICES,
        },
      ],
    },
    // ══════════ 4. 推薦・検索 ══════════
    {
      name: '推薦・検索',
      subcategory: '推薦・検索',
      displayOrder: 6,
      questions: [
        {
          text: '経験のある推薦・検索・情報検索技術を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            '協調フィルタリング',
            'コンテンツベース推薦',
            'ハイブリッド推薦',
            'ランキング学習（Learning to Rank）',
            '全文検索（Elasticsearch など）',
            'セマンティック検索',
          ]),
        },
        {
          text: 'ベクトル検索・埋め込み関連で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: choices([
            '埋め込みモデルの学習・活用',
            'ベクトル検索（Faiss など）',
            'ベクトルDB（Pinecone, Weaviate など）',
            'pgvector',
            '近似最近傍探索（ANN）',
            'RAG 向けの検索設計',
          ]),
        },
      ],
    },
    // ══════════ 5. MLOps ★ ══════════
    {
      name: 'MLOps',
      subcategory: '運用・ガバナンス',
      displayOrder: 7,
      questions: [
        {
          text: 'モデルの学習・デプロイ・監視で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            'モデルのデプロイ（バッチ/オンライン）',
            'モデルサービング',
            'A/Bテスト・カナリアリリース',
            'モデル監視（ドリフト検知）',
            '再学習パイプライン',
            '推論の高速化・スケーリング',
          ]),
        },
        {
          text: '利用経験のある MLOps ツール・基盤を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: choices([
            'MLflow',
            'Kubeflow',
            'SageMaker',
            'Vertex AI',
            'Weights & Biases',
            'DVC',
            'モデルサービング基盤（TorchServe, Triton, BentoML）',
            'CI/CD for ML',
          ]),
        },
        {
          text: 'モデル品質・再現性・ガバナンスで意識している取り組みを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 2,
          choices: choices([
            '実験の再現性確保',
            'モデルのバージョン管理',
            'データ・モデルの系譜管理（lineage）',
            'モデルカード・ドキュメント整備',
            '説明可能性（SHAP など）',
            '監査・コンプライアンス対応',
          ]),
        },
      ],
    },
    {
      name: 'MLOps',
      subcategory: '代表習熟度',
      displayOrder: 8,
      questions: [
        {
          text: '最も得意な MLOps ツール・基盤を1つ選んでください。',
          questionType: 'single_choice',
          displayOrder: 0,
          choices: choices([
            'MLflow',
            'Kubeflow',
            'SageMaker',
            'Vertex AI',
            'Weights & Biases',
            'TorchServe・Triton・BentoML',
            'その他',
          ]),
        },
        {
          text: '選んだ MLOps ツール・基盤の習熟度を教えてください。',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: PROFICIENCY_CHOICES,
        },
      ],
    },
    // ══════════ 6. 分析・可視化 ══════════
    {
      name: '分析・可視化',
      subcategory: '分析・可視化',
      displayOrder: 9,
      questions: [
        {
          text: '経験のあるデータ分析・統計手法を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            '記述統計・探索的データ分析（EDA）',
            '統計的仮説検定',
            '回帰分析',
            '時系列分析',
            'クラスタリング',
            'ベイズ統計',
            '因果推論',
          ]),
        },
        {
          text: '利用経験のある可視化・BI ツールを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: choices([
            'Jupyter',
            'matplotlib・seaborn・plotly',
            'Tableau',
            'Looker',
            'Metabase',
            'Superset',
            'Streamlit・Dash',
          ]),
        },
        {
          text: 'モデル・分析結果をどのように検証し、意思決定に活かしているか教えてください。',
          questionType: 'free_text',
          displayOrder: 2,
          choices: [],
        },
      ],
    },
  ],
};

/**
 * ai-ml スキルアンケートの seed を投入する（idempotent）。共通ランナーへ委譲する。
 */
export async function runAiMlSkillSurveySeed(db: DB): Promise<void> {
  await runSkillSurveySeed(db, aiMlSurveySeed, { logLabel: 'ai-ml' });
}
