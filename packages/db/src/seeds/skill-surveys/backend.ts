/**
 * バックエンドエンジニア スキルアンケート シードデータ
 *
 * Source: docs/backend-skills.csv
 * Categories: 45
 * Questions: 119
 * Choices: 503
 */

import type { DB } from '../../client';
import { runSkillSurveySeed } from './runner';

export type BackendSurveySeedData = {
  jobType: 'backend';
  title: string;
  categories: Array<{
    name: string;
    subcategory: string | null;
    displayOrder: number;
    questions: Array<{
      text: string;
      questionType: 'single_choice' | 'multi_choice' | 'free_text';
      displayOrder: number;
      // Wave 5: per-question 必須上書き（任意）。未指定時は REQUIRED_QUESTION_BODIES で判定する。
      isRequired?: boolean;
      // proficiency-scale: 集計分類（能力系は 'proficiency'、直近利用は 'recency'、その他は未設定）
      scoringKind?: 'proficiency' | 'recency';
      choices: Array<{ text: string; displayOrder: number; level?: number }>;
    }>;
  }>;
};

/**
 * Wave 5: 必須設問（is_required=true）の集合（task 8.3）。
 * 各トップレベルカテゴリ先頭の「経験設問」9 問をユーザーが選定。回答品質の最低限を担保しつつ
 * candidate-self-analysis が各カテゴリの土台データを得られるようにする。
 * body の完全一致で判定する（下記 9 件の body はカテゴリ横断でも一意）。
 */
const REQUIRED_QUESTION_BODIES = new Set<string>([
  '経験のある言語（サーバーサイド）を選択してください。', // プログラミング
  '経験のある言語（サーバーサイド）で利用したフレームワークを選択してください。', // フレームワーク・ライブラリ
  '経験のあるRDB（リレーショナルデータベース）を選択してください。', // データベース
  'RESTful APIの実装経験がありますか？', // API開発
  'XSS（クロスサイトスクリプティング）対策を実装した経験がありますか？', // セキュリティ（認証・認可以外）
  '経験のあるレイヤー設計を選択してください。', // アーキテクチャ設計
  'プロファイリングツール（Datadog、New Relic、Google Cloud Profiler、JVM Profilerなど）を使って、アプリケーションのパフォーマンスボトルネックを診断したことがありますか？', // パフォーマンス・チューニング
  '単体テストの経験がありますか？', // テスト
  'Linux上の操作において、経験のあるものを選択してください。', // DevOps・インフラ
]);

export const backendSurveySeed: BackendSurveySeedData = {
  jobType: 'backend',
  title: 'バックエンドエンジニア スキルアンケート',
  categories: [
    {
      name: 'プログラミング',
      subcategory: '主要プログラミング言語の熟練度',
      displayOrder: 0,
      questions: [
        {
          text: '経験のある言語（サーバーサイド）を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'Java', displayOrder: 0 },
            { text: 'Kotlin', displayOrder: 1 },
            { text: 'Scala', displayOrder: 2 },
            { text: 'Node.js', displayOrder: 3 },
            { text: 'Ruby', displayOrder: 4 },
            { text: 'PHP', displayOrder: 5 },
            { text: 'Python', displayOrder: 6 },
            { text: 'Go', displayOrder: 7 },
            { text: 'Rust', displayOrder: 8 },
            { text: 'Elixir', displayOrder: 9 },
          ],
        },
        {
          text: '得意なプログラミング言語について、概念を理解できているものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: '変数のスコープ', displayOrder: 0 },
            { text: 'エラーハンドリング', displayOrder: 1 },
            { text: 'データ構造（リスト、スタック、キュー、ハッシュマップ）', displayOrder: 2 },
            { text: '非同期処理（スレッド、コルーチン、Promiseなど）', displayOrder: 3 },
          ],
        },
      ],
    },
    {
      name: 'プログラミング',
      subcategory: 'デバッグスキル',
      displayOrder: 1,
      questions: [
        {
          text: 'IDE のステップデバッガー（例: Visual Studio Code、IntelliJ、PhpStorm など）を使用して、コードのデバッグを行ったことがありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'ステップデバッガーの活用レベルを教えてください。',
          questionType: 'single_choice',
          displayOrder: 1,
          choices: [
            { text: 'ブレークポイントを設定してコードを一時停止することができる', displayOrder: 0 },
            { text: '変数ウォッチや条件付きブレークポイントを活用できる', displayOrder: 1 },
            { text: 'ステップイン／アウト、コールスタックの確認、例外デバッグができる', displayOrder: 2 },
            { text: 'メモリ解析やスレッドデバッグを含む高度なデバッグができる', displayOrder: 3 },
          ],
        },
        {
          text: 'ブラウザのデベロッパーツール（Chrome DevTools など）を使用して、リクエストのパフォーマンスを分析したことがありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 2,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'ブラウザのデベロッパーツールの活用レベルを教えてください。',
          questionType: 'multi_choice',
          displayOrder: 3,
          choices: [
            { text: 'Network タブで、リクエストの詳細情報（ステータスコード、レスポンスタイム、サイズなど）を確認したことがある', displayOrder: 0 },
            { text: 'Chrome DevTools の Waterfall グラフを使って、リクエストの遅延やボトルネックを特定したことがある', displayOrder: 1 },
            { text: 'リクエストの「タイムライン」タブを使用して、特定のリソースがどの段階で遅れているかを分析したことがある', displayOrder: 2 },
            { text: 'パフォーマンス分析の際に、Throttlingを使用して、ネットワーク帯域やCPUの負荷をシミュレーションしたことがある', displayOrder: 3 },
            { text: 'リクエストを送信する際、 "Request/Response Headers" を使って、特定のヘッダーがパフォーマンスに与える影響を確認し改善したことはありますか？', displayOrder: 4 },
            { text: 'DevTools の「Console」タブを使って、API リクエストの結果を直接確認し、問題の診断を行ったことがありますか？', displayOrder: 5 },
          ],
        },
      ],
    },
    {
      name: 'プログラミング',
      subcategory: 'コードの可読性とメンテナンス性',
      displayOrder: 2,
      questions: [
        {
          text: 'プロジェクトや組織内で、コーディングルール（例: コードフォーマット、命名規則、レビュー基準）を策定した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'コーディングルールの策定後、どのようにルールの遵守を監視しましたか？',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: '手動でルールを共有し、ドキュメントで管理した', displayOrder: 0 },
            { text: '自動化ツール（例: ESLint, Prettier, StyleCI）を設定し、コードの整形やチェックを行った', displayOrder: 1 },
            { text: 'CI/CD パイプラインに組み込み、コードレビュー時に自動でチェックが行われるようにした', displayOrder: 2 },
            { text: 'コードレビュー時に手動チェックを行い、チームでルールの遵守を確認していた', displayOrder: 3 },
          ],
        },
      ],
    },
    {
      name: 'プログラミング',
      subcategory: 'アルゴリズム',
      displayOrder: 3,
      questions: [
        {
          text: 'データ検索・フィルタリングを実装するときに利用するアルゴリズムで経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: '二分探索（例: ソート済みリストから効率的に検索）', displayOrder: 0 },
            { text: 'Trie（例: オートコンプリートや辞書検索）', displayOrder: 1 },
            { text: 'ハッシュ検索（例: 一意なキーを用いた高速検索）', displayOrder: 2 },
          ],
        },
        {
          text: 'ソート処理を実装するときに利用したことのあるアルゴリズムを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'クイックソート（大量データのソートでよく使う）', displayOrder: 0 },
            { text: 'マージソート（安定なソートが求められる場合に使用）', displayOrder: 1 },
            { text: 'ヒープソート（優先度付きキューの実装などで使用）', displayOrder: 2 },
            { text: 'その他（バブルソート、挿入ソートなど）', displayOrder: 3 },
          ],
        },
        {
          text: 'レコメンド機能（推薦システム）を実装した際に利用したことのあるアルゴリズムを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 2,
          choices: [
            { text: 'K近傍法（KNN）（類似データを検索して推薦）', displayOrder: 0 },
            { text: '協調フィルタリング（ユーザーの行動データを元に推薦）', displayOrder: 1 },
            { text: 'ページランク（リンクの重要度を算出し推薦）', displayOrder: 2 },
            { text: 'その他（行列分解、コンテンツベースフィルタリングなど）', displayOrder: 3 },
          ],
        },
        {
          text: '経路探索・ルーティングを実装した際に利用したことのあるアルゴリズムを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 3,
          choices: [
            { text: 'ダイクストラ法（最短経路を求める一般的なアルゴリズム）', displayOrder: 0 },
            { text: 'A（Aスター）アルゴリズム*（ヒューリスティックを活用した最適経路探索）', displayOrder: 1 },
            { text: 'ベルマンフォード法（負の重みを考慮できる最短経路探索）', displayOrder: 2 },
            { text: 'フロイド・ワーシャル法（全頂点間の最短経路を求めるアルゴリズム）', displayOrder: 3 },
            { text: '幅優先探索（BFS）（迷路やグリッドでの最短経路探索に使用）', displayOrder: 4 },
            { text: '深さ優先探索（DFS）（探索範囲を深く進める方法）', displayOrder: 5 },
          ],
        },
      ],
    },
    {
      name: 'プログラミング',
      subcategory: '正規表現',
      displayOrder: 4,
      questions: [
        {
          text: '正規表現を使って、ログ解析、入力バリデーション、テキスト抽出などのパターンマッチング処理を実装したことがありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: '正規表現を使った具体的な用途は何ですか？',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: '単純な文字列検索', displayOrder: 0 },
            { text: 'ログファイルから特定の情報（例: エラーメッセージ）を抽出', displayOrder: 1 },
            { text: '入力フォームのバリデーション（例: メールアドレス、電話番号の形式チェック）', displayOrder: 2 },
            { text: '大量のテキストデータからパターンに基づいてデータを抽出・変換', displayOrder: 3 },
            { text: '複雑なテキスト処理（例: 複数条件を組み合わせた検索や置換）', displayOrder: 4 },
          ],
        },
        {
          text: '正規表現を使ったテキスト抽出で、どのようなデータを抽出した経験がありますか？',
          questionType: 'multi_choice',
          displayOrder: 2,
          choices: [
            { text: '簡単な文字列抽出（例: URLやメールアドレス）', displayOrder: 0 },
            { text: '特定のパターンに基づいて複数のフィールドを抽出（例: 日付、ID番号）', displayOrder: 1 },
            { text: '複雑なパターンに基づいて、複数の要素を同時に抽出（例: 一文から日付と数量を抽出）', displayOrder: 2 },
            { text: '入れ子になった構造から情報を抽出（例: HTMLやJSONからデータを抽出）', displayOrder: 3 },
          ],
        },
      ],
    },
    {
      name: 'フレームワーク・ライブラリ',
      subcategory: '主要フレームワークの熟練度（例: Laravel, Django, Spring Boot, Express.js）',
      displayOrder: 5,
      questions: [
        {
          text: '経験のある言語（サーバーサイド）で利用したフレームワークを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'Spring Framework（Spring Boot）', displayOrder: 0 },
            { text: 'Play Framework', displayOrder: 1 },
            { text: 'Apache Struts', displayOrder: 2 },
            { text: 'Quarkus', displayOrder: 3 },
            { text: 'Ktor', displayOrder: 4 },
            { text: 'Spring Boot（Kotlin対応）', displayOrder: 5 },
            { text: 'Play Framework', displayOrder: 6 },
            { text: 'Akka', displayOrder: 7 },
            { text: 'Express.js', displayOrder: 8 },
            { text: 'NestJS', displayOrder: 9 },
            { text: 'Fastify', displayOrder: 10 },
            { text: 'Hapi.js', displayOrder: 11 },
            { text: 'Ruby on Rails', displayOrder: 12 },
            { text: 'Sinatra', displayOrder: 13 },
            { text: 'Hanami', displayOrder: 14 },
            { text: 'Laravel', displayOrder: 15 },
            { text: 'Symfony', displayOrder: 16 },
            { text: 'Codeigniter', displayOrder: 17 },
            { text: 'CakePHP', displayOrder: 18 },
            { text: 'Zend Framework（Laminas）', displayOrder: 19 },
            { text: 'Django', displayOrder: 20 },
            { text: 'Flask', displayOrder: 21 },
            { text: 'FastAPI', displayOrder: 22 },
            { text: 'Gin', displayOrder: 23 },
            { text: 'Echo', displayOrder: 24 },
            { text: 'Fiber', displayOrder: 25 },
            { text: 'Actix Web', displayOrder: 26 },
            { text: 'Rocket', displayOrder: 27 },
            { text: 'Warp', displayOrder: 28 },
            { text: 'Axum', displayOrder: 29 },
            { text: 'Phoenix', displayOrder: 30 },
            { text: 'Nerves', displayOrder: 31 },
          ],
        },
      ],
    },
    {
      name: 'フレームワーク・ライブラリ',
      subcategory: 'フレームワークのルーティング、ミドルウェア、テンプレートエンジンなどの活用',
      displayOrder: 6,
      questions: [
        {
          text: '得意なフレームワークで、経験のある機能を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'ルーティング（URL へのリクエストを適切なコントローラーやハンドラーに振り分ける機能）', displayOrder: 0 },
            { text: 'ミドルウェア（リクエスト・レスポンスの処理をフレームワークの前後で制御）', displayOrder: 1 },
            { text: 'テンプレートエンジン（フロントエンドのビューを動的に生成）', displayOrder: 2 },
            { text: 'DI（依存性注入）（コンストラクタインジェクション、サービスコンテナの活用など）', displayOrder: 3 },
            { text: 'ORM（オブジェクト・リレーショナル・マッピング）', displayOrder: 4 },
            { text: 'バリデーション（ユーザー入力のデータ検証、カスタムルールの作成など）', displayOrder: 5 },
          ],
        },
      ],
    },
    {
      name: 'フレームワーク・ライブラリ',
      subcategory: 'フレームワークの拡張やカスタマイズの実践',
      displayOrder: 7,
      questions: [
        {
          text: 'フレームワークを拡張してカスタム機能を作成した経験はありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'フレームワークの拡張を行った目的は何ですか？',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: '小規模な機能追加（例: ログ出力やエラーハンドリングの強化）', displayOrder: 0 },
            { text: 'フレームワークの設計思想を変更するような大きな機能追加（例: ミドルウェア、ライフサイクルの変更）', displayOrder: 1 },
            { text: '外部ライブラリやAPIの統合（例: サードパーティの認証システム、データベース接続の抽象化）', displayOrder: 2 },
            { text: '既存機能の改善や最適化（例: パフォーマンス向上、バグ修正）', displayOrder: 3 },
          ],
        },
        {
          text: '自作のフレームワークやライブラリを開発したことはありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 2,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'プロジェクトのライブラリ更新を定期的に行う運用をしたことがありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 3,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'フレームワークやライブラリの導入に関して、開発メンバーの合意を取るプロセスを経験したことがありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 4,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'プロジェクトの技術スタックを変更する提案をしたことがありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 5,
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
      name: 'データベース',
      subcategory: 'RDBの利用',
      displayOrder: 8,
      questions: [
        {
          text: '経験のあるRDB（リレーショナルデータベース）を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'MySQL', displayOrder: 0 },
            { text: 'MariaDB', displayOrder: 1 },
            { text: 'PostgreSQL', displayOrder: 2 },
            { text: 'Oracle', displayOrder: 3 },
            { text: 'SQL Server', displayOrder: 4 },
          ],
        },
        {
          text: 'クラウドのマネージドサービスにおいて、経験のあるRDB（リレーショナルデータベース）を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'Amazon RDS', displayOrder: 0 },
            { text: 'Amazon Aurora', displayOrder: 1 },
            { text: 'Google Cloud SQL', displayOrder: 2 },
            { text: 'Google Cloud AlloyDB', displayOrder: 3 },
            { text: 'Google Cloud Spanner', displayOrder: 4 },
            { text: 'Azure SQL Database', displayOrder: 5 },
          ],
        },
      ],
    },
    {
      name: 'データベース',
      subcategory: 'SQLクエリ（SELECT、INSERT、UPDATE、DELETE）作成',
      displayOrder: 9,
      questions: [
        {
          text: 'SQLクエリを、業務で使用したことがありますか？',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: '基本的なSELECT（データ取得）', displayOrder: 0 },
            { text: 'データ挿入（INSERT）', displayOrder: 1 },
            { text: 'データ更新（UPDATE）', displayOrder: 2 },
            { text: 'データ削除（DELETE）', displayOrder: 3 },
            { text: '複雑な結合（JOIN）やサブクエリを含むSELECT', displayOrder: 4 },
            { text: 'トランザクション管理（BEGIN、COMMIT、ROLLBACK）', displayOrder: 5 },
          ],
        },
        {
          text: '複数のテーブルを結合してクエリを実行した経験はありますか？',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: '単純なINNER JOIN', displayOrder: 0 },
            { text: 'LEFT JOINやRIGHT JOINを使用した', displayOrder: 1 },
            { text: '複数のJOIN（例えば、INNER JOINとLEFT JOINの組み合わせ）', displayOrder: 2 },
            { text: '複雑な自己結合（SELF JOIN）', displayOrder: 3 },
            { text: 'UNIONやUNION ALLを使った複数の結果セットの統合', displayOrder: 4 },
          ],
        },
        {
          text: 'GROUP BY、HAVING、集計関数（SUM, COUNT, AVG など）を使ってデータを集計した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 2,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: '集計関数（SUM, COUNT, AVG など）をどのような目的で利用しましたか？',
          questionType: 'single_choice',
          displayOrder: 3,
          choices: [
            { text: '基本的な集計（例えば、売上の合計、件数のカウント）', displayOrder: 0 },
            { text: 'グループごとに集計を行い、詳細なデータ分析（例えば、地域別売上や月別トラフィック）', displayOrder: 1 },
            { text: '複数の集計関数を組み合わせた複雑な集計（例えば、平均値と合計を同時に求める）', displayOrder: 2 },
          ],
        },
      ],
    },
    {
      name: 'データベース',
      subcategory: 'インデックスやクエリの最適化',
      displayOrder: 10,
      questions: [
        {
          text: 'EXPLAINを使ってSQLクエリの実行計画を確認したことがありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: '実行計画を確認して、どのような問題を解決しましたか？',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: '単純なクエリの実行速度を向上させた', displayOrder: 0 },
            { text: '複雑なクエリでのパフォーマンスボトルネックを特定した', displayOrder: 1 },
            { text: 'インデックスの適用有無を確認して、パフォーマンスを最適化した', displayOrder: 2 },
            { text: '不要なフルテーブルスキャンの回避を試みた', displayOrder: 3 },
            { text: 'クエリのリソース消費（CPU、メモリ）を最適化した', displayOrder: 4 },
          ],
        },
        {
          text: 'インデックスを活用して、パフォーマンス改善を行った経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 2,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'インデックスの最適化を行った経験はありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 3,
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
      name: 'データベース',
      subcategory: 'データベース設計',
      displayOrder: 11,
      questions: [
        {
          text: 'システムを新規に構築する際に、RDB（リレーショナルデータベース）のテーブル定義書を作成した経験はありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'テーブル定義書を作成する際、どのような要素を含めましたか？',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'NOT NULL制約', displayOrder: 0 },
            { text: 'DEFAULT値', displayOrder: 1 },
            { text: '主キー', displayOrder: 2 },
            { text: 'UNIQUEキー', displayOrder: 3 },
            { text: '外部キー', displayOrder: 4 },
            { text: 'インデックス', displayOrder: 5 },
            { text: 'JSON型', displayOrder: 6 },
            { text: 'ENUM型', displayOrder: 7 },
            { text: 'ZEROFILL', displayOrder: 8 },
            { text: 'UNSIGNED', displayOrder: 9 },
          ],
        },
        {
          text: 'テーブル定義書を作成する際、どの程度のスケーラビリティを考慮しましたか？',
          questionType: 'single_choice',
          displayOrder: 2,
          choices: [
            { text: '初期のデータ量や利用頻度を考慮して設計した', displayOrder: 0 },
            { text: '将来的なデータの増加に対応するために、パーティショニングやインデックス戦略を検討し設計した', displayOrder: 1 },
            { text: '高可用性やバックアップ戦略を意識した設計を行った', displayOrder: 2 },
            { text: 'クラウド環境や分散システムを前提とした設計を行った', displayOrder: 3 },
          ],
        },
        {
          text: 'パフォーマンスのために意図的に非正規化した設計をしたことがありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 3,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: '大規模なシステムや高トラフィックなアプリケーションにおいて、RDB（リレーショナルデータベース）のパーティショニングまたはシャーディングを行った経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 4,
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
      name: 'データベース',
      subcategory: 'トランザクション管理とACID特性の理解',
      displayOrder: 12,
      questions: [
        {
          text: 'ACID特性（Atomicity, Consistency, Isolation, Durability）を理解し、RDB（リレーショナルデータベース）のトランザクション設計を行った経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
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
      name: 'データベース',
      subcategory: 'データベースのバックアップとリストア',
      displayOrder: 13,
      questions: [
        {
          text: 'RDB（リレーショナルデータベース）のデータのバックアップ・リストアを設計した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
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
      name: 'データベース',
      subcategory: 'NoSQLデータベースの利用',
      displayOrder: 14,
      questions: [
        {
          text: '経験のあるNoSQLデータベースを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'MongoDB', displayOrder: 0 },
            { text: 'CouchDB', displayOrder: 1 },
            { text: 'Couchbase', displayOrder: 2 },
            { text: 'RavenDB', displayOrder: 3 },
            { text: 'Apache Cassandra', displayOrder: 4 },
            { text: 'Apache HBase', displayOrder: 5 },
            { text: 'Redis', displayOrder: 6 },
            { text: 'Neo4j', displayOrder: 7 },
            { text: 'ArangoDB', displayOrder: 8 },
          ],
        },
        {
          text: 'クラウドのマネージドサービスにおいて、経験のあるNoSQLデータベースを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'Amazon DynamoDB', displayOrder: 0 },
            { text: 'Amazon Neptune', displayOrder: 1 },
            { text: 'Google Cloud Datastore', displayOrder: 2 },
            { text: 'Goolge Cloud Firestore', displayOrder: 3 },
            { text: 'Google Bigtable', displayOrder: 4 },
            { text: 'Azure Table Storage', displayOrder: 5 },
            { text: 'Azure Cosmos DB', displayOrder: 6 },
          ],
        },
        {
          text: 'キー・バリュー型ストア（Redis, DynamoDB など）において、適切なキー設計をしたことがありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 2,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'ドキュメント指向データベース（MongoDBなど）において、データ構造の設計をしたことがありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 3,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'カラム指向型データベース（Apache Cassandra, HBaseなど）において、読み取り速度を考慮してカラムファミリーを設計をしたことがありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 4,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'グラフデータベース（Neo4j など）において、ノードとエッジの設計を最適化した経験はありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 5,
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
      name: 'データベース',
      subcategory: '分散システムの設計',
      displayOrder: 15,
      questions: [
        {
          text: 'CAP定理を理解し、分散システムにおけるNoSQLデータベースの設計を行った経験がありますか？（例えば、整合性、可用性、分断耐性のトレードオフを考慮した設計）',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
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
      name: 'データベース',
      subcategory: 'データ移行',
      displayOrder: 16,
      questions: [
        {
          text: '旧システムからデータベースのデータ移行の設計経験はありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'どのような手段でデータ移行を行いましたか？',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'データベースのエクスポート/インポート', displayOrder: 0 },
            { text: 'ETLツールを使用（AWS Glue, Talend, Apache NiFi など）', displayOrder: 1 },
            { text: 'データベースのレプリケーション', displayOrder: 2 },
            { text: 'クラウドのデータ移行ツールを使用', displayOrder: 3 },
            { text: 'アプリケーションレイヤーでの移行', displayOrder: 4 },
          ],
        },
      ],
    },
    {
      name: 'API開発',
      subcategory: 'RESTful APIの設計・実装',
      displayOrder: 17,
      questions: [
        {
          text: 'RESTful APIの実装経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'RESTful APIの設計経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'RESTful APIの開発において、GET、POST、PUT、DELETEなどのHTTPメソッドを適切に使い分けて設計した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 2,
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
      name: 'API開発',
      subcategory: 'エラーハンドリングとレスポンスコードの設計',
      displayOrder: 18,
      questions: [
        {
          text: 'RESTful APIの開発において、HTTPステータスコード（200, 201, 400, 404, 500 など）を適切に使い分け、エラーハンドリングを設計した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
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
      name: 'API開発',
      subcategory: '認証・認可の実装（OAuth, JWTなど）',
      displayOrder: 19,
      questions: [
        {
          text: 'CORS（クロスオリジンリソースシェアリング）に関して理解し、実際に設定した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'クエリパラメータやヘッダー、ボディを使用して、データのフィルタリングやページネーションを設計した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
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
      name: 'API開発',
      subcategory: 'APIドキュメント（Swagger/OpenAPI）作成',
      displayOrder: 20,
      questions: [
        {
          text: 'APIのドキュメンテーションツール（Swagger、OpenAPIなど）を使って、APIドキュメントを作成した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
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
      name: 'API開発',
      subcategory: 'gRPCの設計・実装',
      displayOrder: 21,
      questions: [
        {
          text: 'gRPCを使ったAPIの設計・実装経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'Protocol Buffers（protobuf）を使って、メッセージ定義を作成した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'gRPCのストリーミング機能（クライアントストリーミング／サーバーストリーミング／双方向ストリーミング）を実装した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 2,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'gRPCサーバーのパフォーマンスチューニング（同時接続数やスレッドプール設定）を行った経験がありますか',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 3,
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
      name: 'セキュリティ（認証・認可以外）',
      subcategory: 'OWASP Top 10の脆弱性に対する理解と実践',
      displayOrder: 22,
      questions: [
        {
          text: 'XSS（クロスサイトスクリプティング）対策を実装した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
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
      name: 'セキュリティ（認証・認可以外）',
      subcategory: 'CSRFトークンの実装',
      displayOrder: 23,
      questions: [
        {
          text: 'CSRF（クロスサイトリクエストフォージェリ）対策を実装した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
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
      name: 'セキュリティ（認証・認可以外）',
      subcategory: 'インジェクション',
      displayOrder: 24,
      questions: [
        {
          text: 'SQLインジェクション対策を実施した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
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
      name: 'セキュリティ（認証・認可以外）',
      subcategory: 'セッション管理とクッキーの安全な取り扱い',
      displayOrder: 25,
      questions: [
        {
          text: 'セッション管理のセキュリティ対策（セッション固定攻撃、セッションハイジャック対策）を行った経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'セキュリティ対策としてWAF（Web Application Firewall）を導入・設定した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
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
      name: 'セキュリティ（認証・認可以外）',
      subcategory: 'セキュリティ監査の実施・対応',
      displayOrder: 26,
      questions: [
        {
          text: 'Webアプリケーションのセキュリティ診断（ペネトレーションテストや脆弱性診断）を行った経験はありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
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
      name: 'セキュリティ（認証・認可以外）',
      subcategory: 'HTTPS/TLSの設定',
      displayOrder: 27,
      questions: [
        {
          text: 'HTTPS/TLSの設定でセキュリティ対策を行なった経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
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
      name: 'セキュリティ（認証・認可以外）',
      subcategory: '脆弱性診断',
      displayOrder: 28,
      questions: [
        {
          text: '外部の第三者機関による脆弱性診断を受けて、システムの修正や改善を行った経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'どのような種類の脆弱性診断を受けて、対応までされましたか？',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'Webアプリケーション診断（SQLインジェクション、XSS など）', displayOrder: 0 },
            { text: 'ネットワーク診断（ポートスキャン、ファイアウォール設定の検証 など）', displayOrder: 1 },
            { text: 'クラウド環境診断（AWS Security Hub、GCP Security Command Center など）', displayOrder: 2 },
            { text: 'モバイルアプリ診断（iOS/Android の脆弱性チェック）', displayOrder: 3 },
            { text: 'ソースコード診断（SAST: 静的解析）', displayOrder: 4 },
            { text: 'ペネトレーションテスト（ホワイトハッカーによる疑似攻撃テスト）', displayOrder: 5 },
            { text: 'コンテナセキュリティ診断（Docker, Kubernetes のセキュリティチェック）', displayOrder: 6 },
            { text: 'CI/CD パイプラインのセキュリティ診断', displayOrder: 7 },
          ],
        },
      ],
    },
    {
      name: 'アーキテクチャ設計',
      subcategory: 'MVC、三層アーキテクチャ、マイクロサービスなどのレイヤー設計',
      displayOrder: 29,
      questions: [
        {
          text: '経験のあるレイヤー設計を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'MVC（Model-View-Controller）', displayOrder: 0 },
            { text: 'レイヤードアーキテクチャ（Layered Architecture）', displayOrder: 1 },
            { text: 'クリーンアーキテクチャ（Clean Architecture）', displayOrder: 2 },
            { text: 'ヘキサゴナルアーキテクチャ（Hexagonal Architecture）', displayOrder: 3 },
          ],
        },
        {
          text: 'マイクロサービスアーキテクチャで設計を行なった経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'マイクロサービスアーキテクチャの設計で、自身が行なったものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 2,
          choices: [
            { text: 'ドメイン駆動設計（DDD）によるサービス分割と境界の設計', displayOrder: 0 },
            { text: 'RESTful API設計およびgRPC等のAPI通信設計', displayOrder: 1 },
            { text: '分散データベース設計（データの分割、整合性、CQRS）', displayOrder: 2 },
            { text: 'サービス監視（Prometheus, Grafana などのツールを使用した監視設計）', displayOrder: 3 },
            { text: 'CI/CDのパイプライン設計と自動化（CircleCI、GitHub Actions、Jenkins、GitLab CIなど）', displayOrder: 4 },
            { text: 'サービス間通信（メッセージキュー、イベント駆動設計など）', displayOrder: 5 },
            { text: 'スケーラビリティ設計（オートスケーリング、ロードバランシング）', displayOrder: 6 },
            { text: '認証・認可（OAuth 2.0, JWTなどの認証技術）', displayOrder: 7 },
          ],
        },
        {
          text: 'イベント駆動アーキテクチャ（Event-Driven Architecture）で設計を行なった経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 3,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'イベント駆動アーキテクチャ（EDA）の設計で、自身が行なったものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 4,
          choices: [
            { text: 'イベントソーシング（Event Sourcing）の導入', displayOrder: 0 },
            { text: 'コマンドとイベントの分離（CQRS）', displayOrder: 1 },
            { text: 'メッセージングシステムの設計（Kafka, RabbitMQ, AWS SNS/SQS など）', displayOrder: 2 },
            { text: 'イベントのスキーマ設計と管理（Avro, Protobufなど）', displayOrder: 3 },
            { text: 'イベントのデータ整合性とトランザクション管理', displayOrder: 4 },
            { text: 'イベント処理のリアルタイム性と遅延管理', displayOrder: 5 },
            { text: 'サービス間の非同期通信設計', displayOrder: 6 },
            { text: 'イベント駆動のモニタリングとデバッグ（トレーシング、ロギング）', displayOrder: 7 },
            { text: 'イベントストリーム処理（Apache Flink, Kafka Streams など）', displayOrder: 8 },
          ],
        },
        {
          text: 'サーバーレスアーキテクチャ（Serverless Architecture）で設計を行なった経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 5,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'サーバーレスアーキテクチャ（Serverless Architecture）の設計で、自身が行なったものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 6,
          choices: [
            { text: 'サーバーレスプラットフォーム（AWS Lambda, Azure Functions, Google Cloud Functions）の選定・設計', displayOrder: 0 },
            { text: '関数のデプロイメントとバージョン管理', displayOrder: 1 },
            { text: 'イベントトリガー（S3, SNS, DynamoDB Streams など）によるアクション設計', displayOrder: 2 },
            { text: 'サーバーレスデータベース（Amazon Aurora Serverless, DynamoDBなど）の選定と設計', displayOrder: 3 },
            { text: 'API Gateway や同様のサービスを使ったAPI設計', displayOrder: 4 },
            { text: 'サーバーレスアーキテクチャのモニタリングとロギング（AWS CloudWatch, Google Cloud Monitoringなど）', displayOrder: 5 },
            { text: 'サーバーレス環境でのセキュリティ（認証、認可、API Gatewayのセキュリティ設計など）', displayOrder: 6 },
            { text: 'オートスケーリングの設計とリソース管理', displayOrder: 7 },
            { text: 'サーバーレス環境におけるコスト最適化', displayOrder: 8 },
            { text: '非同期処理の設計（SQS, SNS, EventBridgeなど）', displayOrder: 9 },
            { text: 'サーバーレスアーキテクチャにおけるパフォーマンス最適化（Cold Start問題への対策など）', displayOrder: 10 },
          ],
        },
      ],
    },
    {
      name: 'アーキテクチャ設計',
      subcategory: 'デザインパターンの実践',
      displayOrder: 30,
      questions: [
        {
          text: 'デザインパターン（例：Singleton、Factory、Observer）を理解し、実際に適用した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: '実践したことのあるデザインパターンを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'シングルトンパターン（Singleton Pattern）', displayOrder: 0 },
            { text: 'ファクトリーパターン（Factory Method Pattern）', displayOrder: 1 },
            { text: '抽象ファクトリーパターン（Abstract Factory Pattern）', displayOrder: 2 },
            { text: 'ビルダーパターン（Builder Pattern）', displayOrder: 3 },
            { text: 'プロトタイプパターン（Prototype Pattern）', displayOrder: 4 },
            { text: 'デコレーターパターン（Decorator Pattern）', displayOrder: 5 },
            { text: 'ストラテジーパターン（Strategy Pattern）', displayOrder: 6 },
            { text: 'テンプレートメソッドパターン（Template Method Pattern）', displayOrder: 7 },
            { text: 'コマンドパターン（Command Pattern）', displayOrder: 8 },
            { text: '状態パターン（State Pattern）', displayOrder: 9 },
            { text: 'オブザーバーパターン（Observer Pattern）', displayOrder: 10 },
            { text: 'アダプターパターン（Adapter Pattern）', displayOrder: 11 },
            { text: 'ファサードパターン（Facade Pattern）', displayOrder: 12 },
            { text: 'コンポジットパターン（Composite Pattern）', displayOrder: 13 },
            { text: '代理パターン（Proxy Pattern）', displayOrder: 14 },
          ],
        },
      ],
    },
    {
      name: 'アーキテクチャ設計',
      subcategory: 'キューやメッセージングサービスを使った非同期処理の設計',
      displayOrder: 31,
      questions: [
        {
          text: 'キューを使用した非同期処理の設計経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: '経験のあるキューのミドルウェアを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'RabbitMQ', displayOrder: 0 },
            { text: 'Apache ActiveMQ', displayOrder: 1 },
          ],
        },
        {
          text: 'クラウドのマネージドサービスにおいて、経験のあるキューのミドルウェアを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 2,
          choices: [
            { text: 'AWS SQS', displayOrder: 0 },
            { text: 'Google Cloud Tasks', displayOrder: 1 },
            { text: 'Azure Storage Queue', displayOrder: 2 },
          ],
        },
        {
          text: 'メッセージングサービスを使用した非同期処理の設計経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 3,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: '経験のあるメッセージングサービスのミドルウェアを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 4,
          choices: [
            { text: 'RabbitMQ（Pub/Subモード）', displayOrder: 0 },
            { text: 'Apache Kafka', displayOrder: 1 },
          ],
        },
        {
          text: 'クラウドのマネージドサービスにおいて、経験のあるメッセージングサービスのミドルウェアを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 5,
          choices: [
            { text: 'AWS SNS', displayOrder: 0 },
            { text: 'Google Cloud Pub/Sub', displayOrder: 1 },
            { text: 'Azure Service Bus', displayOrder: 2 },
          ],
        },
      ],
    },
    {
      name: 'アーキテクチャ設計',
      subcategory: '認証',
      displayOrder: 32,
      questions: [
        {
          text: '認証機能の設計経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: '認証機能の設計で、自身が行なったものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'フォーム認証（ユーザー名＋パスワード）による認証', displayOrder: 0 },
            { text: 'OAuth 2.0 / OpenID Connect による認証', displayOrder: 1 },
            { text: 'JWT（JSON Web Token）を用いたトークンベース認証', displayOrder: 2 },
            { text: 'SSO（シングルサインオン）による認証統合', displayOrder: 3 },
            { text: 'ソーシャルログイン（Google, Facebook, GitHub など）による認証', displayOrder: 4 },
            { text: 'パスワードレス認証（メールリンク、OTP など）', displayOrder: 5 },
            { text: '2要素認証（2FA） / 多要素認証（MFA）', displayOrder: 6 },
            { text: 'API 認証（APIキー、HMAC、OAuth Bearer Token など）', displayOrder: 7 },
            { text: 'セッションベース認証（Cookie や Redis によるセッション管理）', displayOrder: 8 },
            { text: 'Active Directory / LDAP を用いた認証', displayOrder: 9 },
            { text: '生体認証（指紋認証、顔認証など）', displayOrder: 10 },
          ],
        },
      ],
    },
    {
      name: 'アーキテクチャ設計',
      subcategory: '認可',
      displayOrder: 33,
      questions: [
        {
          text: '認可機能の設計経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: '認可機能の設計で、自身が行なったものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'RBAC（ロールベースアクセス制御）', displayOrder: 0 },
            { text: 'ABAC（属性ベースアクセス制御）', displayOrder: 1 },
            { text: 'PBAC（ポリシーベースアクセス制御：Open Policy Agent、Casbinなど）', displayOrder: 2 },
            { text: 'ACL（アクセス制御リスト）を用いたアクセス管理', displayOrder: 3 },
            { text: 'アプリケーション内での認可ロジック設計（ミドルウェア・ガード・サービス層など）', displayOrder: 4 },
            { text: 'マイクロサービス間のアクセス制御設計（スコープ管理、サービス単位の認可など）', displayOrder: 5 },
            { text: 'リソースベースのアクセス制御（ユーザーごとのデータ制限、オーナーシップ管理など）', displayOrder: 6 },
            { text: 'スコープやクレーム（claims）ベースのトークン設計', displayOrder: 7 },
            { text: 'サードパーティAPIとの連携における認可設計（OAuthのスコープ設計など）', displayOrder: 8 },
            { text: 'APIゲートウェイでの認可設計（APIゲートウェイでの認証・認可ポリシー設定）', displayOrder: 9 },
          ],
        },
      ],
    },
    {
      name: 'パフォーマンス・チューニング',
      subcategory: 'ボトルネックを特定とコードやクエリの最適化',
      displayOrder: 34,
      questions: [
        {
          text: 'プロファイリングツール（Datadog、New Relic、Google Cloud Profiler、JVM Profilerなど）を使って、アプリケーションのパフォーマンスボトルネックを診断したことがありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'SQLクエリのパフォーマンス最適化を行ったことがありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'コードの最適化を行い、アプリケーションのパフォーマンスを改善した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 2,
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
      name: 'パフォーマンス・チューニング',
      subcategory: '負荷テストやストレステストの実践と分析',
      displayOrder: 35,
      questions: [
        {
          text: '経験のある負荷テストツールを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'Apache JMeter', displayOrder: 0 },
            { text: 'Gatling', displayOrder: 1 },
            { text: 'Locust', displayOrder: 2 },
            { text: 'k6', displayOrder: 3 },
            { text: 'LoadRunner', displayOrder: 4 },
          ],
        },
      ],
    },
    {
      name: 'パフォーマンス・チューニング',
      subcategory: '非同期処理や並列処理を活用したパフォーマンス向上',
      displayOrder: 36,
      questions: [
        {
          text: '並列処理（マルチスレッド、マルチプロセス）を活用してパフォーマンス向上を実現した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
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
      name: 'パフォーマンス・チューニング',
      subcategory: 'CDNやキャッシュを利用したパフォーマンス向上',
      displayOrder: 37,
      questions: [
        {
          text: 'CDNを利用して、ウェブアプリケーションのパフォーマンスを向上させた経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'CDNを利用して、キャッシュ戦略（例: キャッシュの期限設定、キャッシュクリア方法）を設計した経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'CDNのキャッシュ戦略において経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 2,
          choices: [
            { text: '静的ファイルへの長期間のTTL設定（max-age などを使ったキャッシュ制御）', displayOrder: 0 },
            { text: '動的コンテンツに対する短いTTLの設定（APIレスポンス等）', displayOrder: 1 },
            { text: 'Cache-Control / ETag / Last-Modified ヘッダーの適切な設定', displayOrder: 2 },
            { text: 'アセットのバージョン管理（ハッシュやクエリパラメータによるキャッシュバスティング）', displayOrder: 3 },
            { text: 'CDNキャッシュの手動・自動パージ（無効化）の運用', displayOrder: 4 },
            { text: 'パスや拡張子ごとのキャッシュ設定の最適化（例：画像は長期、HTMLは短期）', displayOrder: 5 },
            { text: 'エッジキャッシュの活用によるオリジンサーバー負荷分散', displayOrder: 6 },
            { text: 'ログインページやユーザー別ページなどでのキャッシュ制御（パーソナライズ非対象）', displayOrder: 7 },
            { text: 'CDNでのキャッシュ制御とオリジンサーバー側の設定の整合性を設計・調整した経験', displayOrder: 8 },
            { text: 'キャッシュヒット率のモニタリングと改善施策の実施', displayOrder: 9 },
            { text: '特定ディレクトリ／パスごとのキャッシュ対象・非対象の設定（例：/adminはno-cache）', displayOrder: 10 },
          ],
        },
        {
          text: '経験のあるCDNプロバイダーを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 3,
          choices: [
            { text: 'Cloudflare', displayOrder: 0 },
            { text: 'AWS CloudFront', displayOrder: 1 },
            { text: 'Akamai', displayOrder: 2 },
            { text: 'Fastly', displayOrder: 3 },
            { text: 'Google Cloud CDN', displayOrder: 4 },
            { text: 'Microsoft Azure CDN', displayOrder: 5 },
            { text: 'KeyCDN', displayOrder: 6 },
            { text: 'StackPath', displayOrder: 7 },
            { text: 'CDN77', displayOrder: 8 },
            { text: 'BunnyCDN', displayOrder: 9 },
          ],
        },
      ],
    },
    {
      name: 'テスト',
      subcategory: '単体・結合のテストコード作成',
      displayOrder: 38,
      questions: [
        {
          text: '単体テストの経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: '経験のあるテストフレームワーク・ツールを選択してください',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'JUnit (Java)', displayOrder: 0 },
            { text: 'Spock (Groovy)', displayOrder: 1 },
            { text: 'Mocha (JavaScript)', displayOrder: 2 },
            { text: 'Jest (JavaScript)', displayOrder: 3 },
            { text: 'RSpec (Ruby)', displayOrder: 4 },
            { text: 'PHPUnit (PHP)', displayOrder: 5 },
            { text: 'PyTest (Python)', displayOrder: 6 },
            { text: 'ScalaTest (Scala)', displayOrder: 7 },
            { text: 'Goの標準テストパッケージ（testing） / Go Test Framework', displayOrder: 8 },
            { text: 'xUnit (C#, .NET)', displayOrder: 9 },
            { text: 'NUnit (.NET)', displayOrder: 10 },
            { text: 'ExUnit (Elixir)', displayOrder: 11 },
            { text: 'Rustの標準テストライブラリ（cargo test）', displayOrder: 12 },
          ],
        },
        {
          text: '単体テストにおいて、次の中から経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 2,
          choices: [
            { text: 'モックやスタブを使った外部依存の切り離し', displayOrder: 0 },
            { text: 'テスト駆動開発（TDD）の実施', displayOrder: 1 },
            { text: '疑似データやフェイクデータを使ったテスト', displayOrder: 2 },
            { text: 'テストのカバレッジを確認するツールの使用', displayOrder: 3 },
            { text: 'エラーハンドリングや例外処理のテスト', displayOrder: 4 },
          ],
        },
        {
          text: '結合テストの経験がありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 3,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: '結合テストで使用したツールやフレームワークを選択してください',
          questionType: 'multi_choice',
          displayOrder: 4,
          choices: [
            { text: 'Cucumber（BDDフレームワーク）', displayOrder: 0 },
            { text: 'Cypress（E2Eテスト）', displayOrder: 1 },
            { text: 'Puppeteer（ブラウザ自動化）', displayOrder: 2 },
            { text: 'Selenium（UIテスト）', displayOrder: 3 },
            { text: 'Playwright（クロスブラウザE2Eテスト）', displayOrder: 4 },
            { text: 'CodeceptJS（E2E/API/UIテスト）', displayOrder: 5 },
            { text: 'Postman（APIテスト）', displayOrder: 6 },
            { text: 'Insomnia（APIテスト）', displayOrder: 7 },
            { text: 'Swagger（API設計・テスト）', displayOrder: 8 },
          ],
        },
        {
          text: '結合テストにおいて、次の中から経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 5,
          choices: [
            { text: 'APIの統合テスト（GET, POST, PUT, DELETE）', displayOrder: 0 },
            { text: 'APIの統合テスト（GET, POST, PUT, DELETE）', displayOrder: 1 },
            { text: 'データベースの結合テスト（DB接続、クエリ結果の検証）', displayOrder: 2 },
            { text: 'システム全体のフローをテストするシナリオ設計', displayOrder: 3 },
            { text: 'マイクロサービス間の結合テスト', displayOrder: 4 },
            { text: 'サードパーティサービスとの連携テスト', displayOrder: 5 },
            { text: 'テスト自動化ツールによる定期的な結合テストの実施', displayOrder: 6 },
          ],
        },
      ],
    },
    {
      name: 'DevOps・インフラ',
      subcategory: 'Linux',
      displayOrder: 39,
      questions: [
        {
          text: 'Linux上の操作において、経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'ファイル操作', displayOrder: 0 },
            { text: 'プロセスの確認・停止・再起動', displayOrder: 1 },
            { text: '権限エラー対応', displayOrder: 2 },
            { text: 'サーバエラー・アプリケーションエラーの原因特定', displayOrder: 3 },
            { text: '接続確認・通信トラブルの調査', displayOrder: 4 },
            { text: 'サーバリソースの確認', displayOrder: 5 },
          ],
        },
      ],
    },
    {
      name: 'DevOps・インフラ',
      subcategory: 'Gitの利用',
      displayOrder: 40,
      questions: [
        {
          text: 'チーム開発でGitを用いたバージョン管理を行った経験はありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'ブランチ戦略の設計に携わったことがありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'ブランチ戦略において、経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 2,
          choices: [
            { text: 'Git Flow', displayOrder: 0 },
            { text: 'GitHub Flow', displayOrder: 1 },
            { text: 'GitLab Flow', displayOrder: 2 },
            { text: 'Trunk Based Development', displayOrder: 3 },
          ],
        },
        {
          text: 'Gitの履歴操作において、経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 3,
          choices: [
            { text: 'git rebase を使って履歴を整理した経験がある', displayOrder: 0 },
            { text: 'git revert で安全に変更を打ち消した経験がある', displayOrder: 1 },
            { text: 'git reset でローカルの履歴を戻したことがある', displayOrder: 2 },
            { text: 'git cherry-pick で特定のコミットだけ取り込んだことがある', displayOrder: 3 },
            { text: 'git reflog で過去の履歴からブランチを復旧したことがある', displayOrder: 4 },
          ],
        },
      ],
    },
    {
      name: 'DevOps・インフラ',
      subcategory: 'CI/CDパイプラインの構築',
      displayOrder: 41,
      questions: [
        {
          text: 'CI/CDツール（GitHub Actions、GitLab CI、CircleCIなど）を使った自動化パイプラインを構築した経験はありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: 'CI/CDツールで、経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'GitHub Actions', displayOrder: 0 },
            { text: 'GitLab CI/CD', displayOrder: 1 },
            { text: 'CircleCI', displayOrder: 2 },
            { text: 'Jenkins', displayOrder: 3 },
            { text: 'Azure Pipelines', displayOrder: 4 },
            { text: 'AWS CodePipeline', displayOrder: 5 },
            { text: 'Google Cloud Build', displayOrder: 6 },
          ],
        },
        {
          text: 'CI/CDに組み込んだことがあるセキュリティチェックや静的解析を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 2,
          choices: [
            { text: 'コードのセキュリティ脆弱性の検出', displayOrder: 0 },
            { text: '依存関係の脆弱性の検出', displayOrder: 1 },
            { text: '機密情報の漏洩防止', displayOrder: 2 },
            { text: 'セキュアなコーディングプラクティスの遵守', displayOrder: 3 },
            { text: 'セキュリティガイドラインの自動チェック', displayOrder: 4 },
            { text: 'コンテナ・イメージのセキュリティチェック', displayOrder: 5 },
            { text: 'コード品質の向上', displayOrder: 6 },
          ],
        },
        {
          text: 'CI/CDパイプラインの運用後に、行なったことがあるパフォーマンス改善や最適化を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 3,
          choices: [
            { text: 'ビルド時間の短縮（例：キャッシュ活用、ジョブの並列化）', displayOrder: 0 },
            { text: 'テストの実行時間を短縮（例：テストの分割・並列化、不必要なテストの除外）', displayOrder: 1 },
            { text: '実行頻度の見直しやトリガーの最適化（例：PR単位のみ実行）', displayOrder: 2 },
            { text: 'パイプラインの可視化や監視（ログ、メトリクス）を強化した', displayOrder: 3 },
            { text: 'ツールや実行環境の見直しによって速度や安定性を改善', displayOrder: 4 },
          ],
        },
      ],
    },
    {
      name: 'DevOps・インフラ',
      subcategory: 'Dockerを使用したコンテナ化',
      displayOrder: 42,
      questions: [
        {
          text: 'Dockerを使用したコンテナ化に関して、経験のある項目を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'Dockerfileの作成', displayOrder: 0 },
            { text: 'docker-compose による複数コンテナの開発環境構築（DB, キャッシュ, バックエンド, フロントエンドなど）', displayOrder: 1 },
            { text: 'アプリケーションの開発・テスト環境をDockerで構築', displayOrder: 2 },
            { text: 'イメージのビルド・プッシュ・タグ付けの自動化（CI/CDとの連携）', displayOrder: 3 },
            { text: 'コンテナレジストリの運用（Docker Hub、Amazon ECR、GitHub Container Registryなど）', displayOrder: 4 },
            { text: '本番環境へのDocker導入経験（単体またはオーケストレーションと組み合わせ）', displayOrder: 5 },
            { text: 'Dockerコンテナのログ・リソース監視対応', displayOrder: 6 },
          ],
        },
      ],
    },
    {
      name: 'DevOps・インフラ',
      subcategory: 'クラウドサービスの知識',
      displayOrder: 43,
      questions: [
        {
          text: 'アプリケーションの開発・デプロイ環境として利用したクラウドプラットフォームを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'AWS', displayOrder: 0 },
            { text: 'GCP', displayOrder: 1 },
            { text: 'Azure', displayOrder: 2 },
          ],
        },
        {
          text: 'ネットワーク・サーバ・ストレージなど、インフラ構築・運用の経験があるクラウドプラットフォームを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'AWS', displayOrder: 0 },
            { text: 'GCP', displayOrder: 1 },
            { text: 'Azure', displayOrder: 2 },
          ],
        },
        {
          text: 'マネージドサービス（例：ロードバランサー、仮想マシン、DBなど）を選定・利用した経験のあるクラウドプラットフォームを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 2,
          choices: [
            { text: 'AWS', displayOrder: 0 },
            { text: 'GCP', displayOrder: 1 },
            { text: 'Azure', displayOrder: 2 },
          ],
        },
      ],
    },
    {
      name: 'DevOps・インフラ',
      subcategory: 'インフラ監視ツールの利用',
      displayOrder: 44,
      questions: [
        {
          text: '監視設定（メトリクス収集・ログ取得・アラート設定など）を行った経験はありますか？',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 0,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
        {
          text: '利用したことのある監視ツールを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'Zabbix', displayOrder: 0 },
            { text: 'Prometheus', displayOrder: 1 },
            { text: 'Grafana', displayOrder: 2 },
            { text: 'Datadog', displayOrder: 3 },
            { text: 'New Relic', displayOrder: 4 },
            { text: 'CloudWatch（AWS）', displayOrder: 5 },
            { text: 'Azure Monitor', displayOrder: 6 },
            { text: 'Google Cloud Monitoring（GCP Operations Suite）', displayOrder: 7 },
            { text: 'Nagios', displayOrder: 8 },
            { text: 'Mackerel', displayOrder: 9 },
            { text: 'Sentry（エラー監視）', displayOrder: 10 },
            { text: 'PagerDuty（通知連携）', displayOrder: 11 },
          ],
        },
        {
          text: '監視設計・運用について経験のあるものを選択してください',
          questionType: 'multi_choice',
          displayOrder: 2,
          choices: [
            { text: 'サーバーのメトリクス監視（CPU、メモリ、ディスクなど）', displayOrder: 0 },
            { text: 'アプリケーションログやシステムログの収集・分析', displayOrder: 1 },
            { text: 'アラート条件の設計（しきい値、通知ルール）', displayOrder: 2 },
            { text: 'ダッシュボードの可視化（Grafana、Datadog など）', displayOrder: 3 },
            { text: 'アラート通知の運用（Slack、メール、PagerDutyなど）', displayOrder: 4 },
            { text: '外形監視（死活監視、HTTPステータス監視など）', displayOrder: 5 },
            { text: '監視対象の自動登録・自動削除（インフラの動的スケーリングに対応）', displayOrder: 6 },
            { text: '監視のSLO/SLA設計', displayOrder: 7 },
          ],
        },
      ],
    },
    // ── 直近利用（recency）設問: 各トップレベルカテゴリに 1 問ずつ追加 ──
    {
      name: 'プログラミング',
      subcategory: '直近利用',
      displayOrder: 45,
      questions: [
        {
          text: 'この領域の技術を最後に実務で利用したのはいつですか？',
          questionType: 'single_choice',
          scoringKind: 'recency',
          displayOrder: 0,
          choices: [
            { text: '現在も利用中', displayOrder: 0, level: 4 },
            { text: '1年以内', displayOrder: 1, level: 3 },
            { text: '3年以内', displayOrder: 2, level: 2 },
            { text: '3年以上前', displayOrder: 3, level: 1 },
            { text: '実務利用なし', displayOrder: 4, level: 0 },
          ],
        },
      ],
    },
    {
      name: 'フレームワーク・ライブラリ',
      subcategory: '直近利用',
      displayOrder: 46,
      questions: [
        {
          text: 'この領域の技術を最後に実務で利用したのはいつですか？',
          questionType: 'single_choice',
          scoringKind: 'recency',
          displayOrder: 0,
          choices: [
            { text: '現在も利用中', displayOrder: 0, level: 4 },
            { text: '1年以内', displayOrder: 1, level: 3 },
            { text: '3年以内', displayOrder: 2, level: 2 },
            { text: '3年以上前', displayOrder: 3, level: 1 },
            { text: '実務利用なし', displayOrder: 4, level: 0 },
          ],
        },
      ],
    },
    {
      name: 'データベース',
      subcategory: '直近利用',
      displayOrder: 47,
      questions: [
        {
          text: 'この領域の技術を最後に実務で利用したのはいつですか？',
          questionType: 'single_choice',
          scoringKind: 'recency',
          displayOrder: 0,
          choices: [
            { text: '現在も利用中', displayOrder: 0, level: 4 },
            { text: '1年以内', displayOrder: 1, level: 3 },
            { text: '3年以内', displayOrder: 2, level: 2 },
            { text: '3年以上前', displayOrder: 3, level: 1 },
            { text: '実務利用なし', displayOrder: 4, level: 0 },
          ],
        },
      ],
    },
    {
      name: 'API開発',
      subcategory: '直近利用',
      displayOrder: 48,
      questions: [
        {
          text: 'この領域の技術を最後に実務で利用したのはいつですか？',
          questionType: 'single_choice',
          scoringKind: 'recency',
          displayOrder: 0,
          choices: [
            { text: '現在も利用中', displayOrder: 0, level: 4 },
            { text: '1年以内', displayOrder: 1, level: 3 },
            { text: '3年以内', displayOrder: 2, level: 2 },
            { text: '3年以上前', displayOrder: 3, level: 1 },
            { text: '実務利用なし', displayOrder: 4, level: 0 },
          ],
        },
      ],
    },
    {
      name: 'セキュリティ（認証・認可以外）',
      subcategory: '直近利用',
      displayOrder: 49,
      questions: [
        {
          text: 'この領域の技術を最後に実務で利用したのはいつですか？',
          questionType: 'single_choice',
          scoringKind: 'recency',
          displayOrder: 0,
          choices: [
            { text: '現在も利用中', displayOrder: 0, level: 4 },
            { text: '1年以内', displayOrder: 1, level: 3 },
            { text: '3年以内', displayOrder: 2, level: 2 },
            { text: '3年以上前', displayOrder: 3, level: 1 },
            { text: '実務利用なし', displayOrder: 4, level: 0 },
          ],
        },
      ],
    },
    {
      name: 'アーキテクチャ設計',
      subcategory: '直近利用',
      displayOrder: 50,
      questions: [
        {
          text: 'この領域の技術を最後に実務で利用したのはいつですか？',
          questionType: 'single_choice',
          scoringKind: 'recency',
          displayOrder: 0,
          choices: [
            { text: '現在も利用中', displayOrder: 0, level: 4 },
            { text: '1年以内', displayOrder: 1, level: 3 },
            { text: '3年以内', displayOrder: 2, level: 2 },
            { text: '3年以上前', displayOrder: 3, level: 1 },
            { text: '実務利用なし', displayOrder: 4, level: 0 },
          ],
        },
      ],
    },
    {
      name: 'パフォーマンス・チューニング',
      subcategory: '直近利用',
      displayOrder: 51,
      questions: [
        {
          text: 'この領域の技術を最後に実務で利用したのはいつですか？',
          questionType: 'single_choice',
          scoringKind: 'recency',
          displayOrder: 0,
          choices: [
            { text: '現在も利用中', displayOrder: 0, level: 4 },
            { text: '1年以内', displayOrder: 1, level: 3 },
            { text: '3年以内', displayOrder: 2, level: 2 },
            { text: '3年以上前', displayOrder: 3, level: 1 },
            { text: '実務利用なし', displayOrder: 4, level: 0 },
          ],
        },
      ],
    },
    {
      name: 'テスト',
      subcategory: '直近利用',
      displayOrder: 52,
      questions: [
        {
          text: 'この領域の技術を最後に実務で利用したのはいつですか？',
          questionType: 'single_choice',
          scoringKind: 'recency',
          displayOrder: 0,
          choices: [
            { text: '現在も利用中', displayOrder: 0, level: 4 },
            { text: '1年以内', displayOrder: 1, level: 3 },
            { text: '3年以内', displayOrder: 2, level: 2 },
            { text: '3年以上前', displayOrder: 3, level: 1 },
            { text: '実務利用なし', displayOrder: 4, level: 0 },
          ],
        },
      ],
    },
    {
      name: 'DevOps・インフラ',
      subcategory: '直近利用',
      displayOrder: 53,
      questions: [
        {
          text: 'この領域の技術を最後に実務で利用したのはいつですか？',
          questionType: 'single_choice',
          scoringKind: 'recency',
          displayOrder: 0,
          choices: [
            { text: '現在も利用中', displayOrder: 0, level: 4 },
            { text: '1年以内', displayOrder: 1, level: 3 },
            { text: '3年以内', displayOrder: 2, level: 2 },
            { text: '3年以上前', displayOrder: 3, level: 1 },
            { text: '実務利用なし', displayOrder: 4, level: 0 },
          ],
        },
      ],
    },
    // ── カテゴリ代表習熟度設問: 主要3カテゴリに各1行追加 (Req 2.1, 2.2, 2.3) ──
    {
      name: 'プログラミング',
      subcategory: '代表習熟度',
      displayOrder: 54,
      questions: [
        {
          text: 'このカテゴリで最も得意な言語を1つ選んでください。',
          questionType: 'single_choice',
          isRequired: false,
          displayOrder: 0,
          choices: [
            { text: 'Java', displayOrder: 0 },
            { text: 'Kotlin', displayOrder: 1 },
            { text: 'Scala', displayOrder: 2 },
            { text: 'Node.js', displayOrder: 3 },
            { text: 'Ruby', displayOrder: 4 },
            { text: 'PHP', displayOrder: 5 },
            { text: 'Python', displayOrder: 6 },
            { text: 'Go', displayOrder: 7 },
            { text: 'Rust', displayOrder: 8 },
            { text: 'Elixir', displayOrder: 9 },
          ],
        },
        {
          text: '選んだ言語の習熟度を教えてください。',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          isRequired: false,
          displayOrder: 1,
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
      name: 'フレームワーク・ライブラリ',
      subcategory: '代表習熟度',
      displayOrder: 55,
      questions: [
        {
          text: 'このカテゴリで最も得意なフレームワークを1つ選んでください。',
          questionType: 'single_choice',
          isRequired: false,
          displayOrder: 0,
          choices: [
            { text: 'Spring Framework（Spring Boot）', displayOrder: 0 },
            { text: 'Play Framework', displayOrder: 1 },
            { text: 'Apache Struts', displayOrder: 2 },
            { text: 'Quarkus', displayOrder: 3 },
            { text: 'Ktor', displayOrder: 4 },
            { text: 'Spring Boot（Kotlin対応）', displayOrder: 5 },
            { text: 'Play Framework', displayOrder: 6 },
            { text: 'Akka', displayOrder: 7 },
            { text: 'Express.js', displayOrder: 8 },
            { text: 'NestJS', displayOrder: 9 },
            { text: 'Fastify', displayOrder: 10 },
            { text: 'Hapi.js', displayOrder: 11 },
            { text: 'Ruby on Rails', displayOrder: 12 },
            { text: 'Sinatra', displayOrder: 13 },
            { text: 'Hanami', displayOrder: 14 },
            { text: 'Laravel', displayOrder: 15 },
            { text: 'Symfony', displayOrder: 16 },
            { text: 'Codeigniter', displayOrder: 17 },
            { text: 'CakePHP', displayOrder: 18 },
            { text: 'Zend Framework（Laminas）', displayOrder: 19 },
            { text: 'Django', displayOrder: 20 },
            { text: 'Flask', displayOrder: 21 },
            { text: 'FastAPI', displayOrder: 22 },
            { text: 'Gin', displayOrder: 23 },
            { text: 'Echo', displayOrder: 24 },
            { text: 'Fiber', displayOrder: 25 },
            { text: 'Actix Web', displayOrder: 26 },
            { text: 'Rocket', displayOrder: 27 },
            { text: 'Warp', displayOrder: 28 },
            { text: 'Axum', displayOrder: 29 },
            { text: 'Phoenix', displayOrder: 30 },
            { text: 'Nerves', displayOrder: 31 },
          ],
        },
        {
          text: '選んだフレームワークの習熟度を教えてください。',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          isRequired: false,
          displayOrder: 1,
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
      name: 'データベース',
      subcategory: '代表習熟度',
      displayOrder: 56,
      questions: [
        {
          text: 'このカテゴリで最も得意なRDBを1つ選んでください。',
          questionType: 'single_choice',
          isRequired: false,
          displayOrder: 0,
          choices: [
            { text: 'MySQL', displayOrder: 0 },
            { text: 'MariaDB', displayOrder: 1 },
            { text: 'PostgreSQL', displayOrder: 2 },
            { text: 'Oracle', displayOrder: 3 },
            { text: 'SQL Server', displayOrder: 4 },
          ],
        },
        {
          text: '選んだRDBの習熟度を教えてください。',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          isRequired: false,
          displayOrder: 1,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
            { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
            { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
          ],
        },
      ],
    },
    // ── 深掘り自由記述設問: 各主要カテゴリに1問ずつ追加 (Req 4.1, 4.2, 4.3) ──
    // 任意回答（is_required=false）。文字数上限は既存 free_text と同等（フォーム/送信側で 2000 字）。
    // scoringKind は未設定（=null）。熟練度平均には寄与せず、従来どおり広さ/カバレッジ側に属する。
    {
      name: 'プログラミング',
      subcategory: '深掘り',
      displayOrder: 57,
      questions: [
        {
          text: 'プログラミングにおける技術・設計選択の理由、または失敗から学んだことがあれば記述してください。',
          questionType: 'free_text',
          isRequired: false,
          displayOrder: 0,
          choices: [],
        },
      ],
    },
    {
      name: 'フレームワーク・ライブラリ',
      subcategory: '深掘り',
      displayOrder: 58,
      questions: [
        {
          text: 'フレームワーク・ライブラリの選定理由、または失敗から学んだことがあれば記述してください。',
          questionType: 'free_text',
          isRequired: false,
          displayOrder: 0,
          choices: [],
        },
      ],
    },
    {
      name: 'データベース',
      subcategory: '深掘り',
      displayOrder: 59,
      questions: [
        {
          text: 'データベースの設計・技術選択の理由、または失敗から学んだことがあれば記述してください。',
          questionType: 'free_text',
          isRequired: false,
          displayOrder: 0,
          choices: [],
        },
      ],
    },
    {
      name: 'API開発',
      subcategory: '深掘り',
      displayOrder: 60,
      questions: [
        {
          text: 'API設計における判断の理由、または失敗から学んだことがあれば記述してください。',
          questionType: 'free_text',
          isRequired: false,
          displayOrder: 0,
          choices: [],
        },
      ],
    },
    {
      name: 'セキュリティ（認証・認可以外）',
      subcategory: '深掘り',
      displayOrder: 61,
      questions: [
        {
          text: 'セキュリティ対策の技術・設計選択の理由、または失敗から学んだことがあれば記述してください。',
          questionType: 'free_text',
          isRequired: false,
          displayOrder: 0,
          choices: [],
        },
      ],
    },
    {
      name: 'アーキテクチャ設計',
      subcategory: '深掘り',
      displayOrder: 62,
      questions: [
        {
          text: 'アーキテクチャ設計における判断の理由、または失敗から学んだことがあれば記述してください。',
          questionType: 'free_text',
          isRequired: false,
          displayOrder: 0,
          choices: [],
        },
      ],
    },
    {
      name: 'パフォーマンス・チューニング',
      subcategory: '深掘り',
      displayOrder: 63,
      questions: [
        {
          text: 'パフォーマンス改善の技術・設計選択の理由、または失敗から学んだことがあれば記述してください。',
          questionType: 'free_text',
          isRequired: false,
          displayOrder: 0,
          choices: [],
        },
      ],
    },
    {
      name: 'テスト',
      subcategory: '深掘り',
      displayOrder: 64,
      questions: [
        {
          text: 'テスト戦略における判断の理由、または失敗から学んだことがあれば記述してください。',
          questionType: 'free_text',
          isRequired: false,
          displayOrder: 0,
          choices: [],
        },
      ],
    },
    {
      name: 'DevOps・インフラ',
      subcategory: '深掘り',
      displayOrder: 65,
      questions: [
        {
          text: 'DevOps・インフラの技術・設計選択の理由、または失敗から学んだことがあれば記述してください。',
          questionType: 'free_text',
          isRequired: false,
          displayOrder: 0,
          choices: [],
        },
      ],
    },
  ],
};

/**
 * backend スキルアンケートの seed を投入する（idempotent）。共通ランナーへ委譲する。
 */
export async function runBackendSkillSurveySeed(db: DB): Promise<void> {
  await runSkillSurveySeed(db, backendSurveySeed, {
    logLabel: 'backend',
    // 129/146 問は明示 isRequired を持たず REQUIRED_QUESTION_BODIES の本文一致で必須判定するため、
    // その挙動を注入して後方互換を保つ。
    resolveIsRequired: (question) =>
      question.isRequired ?? REQUIRED_QUESTION_BODIES.has(question.text),
  });
}
