/**
 * フロントエンドエンジニア スキルアンケート シードデータ
 *
 * Source: docs/frontend-skills.csv（69 行・ENGINEER_SKILL_LEVEL マーカー付き）
 * spec: .kiro/specs/frontend-survey
 *
 * 変換規約（design.md）:
 *  - 経験選択系は multi_choice（scoringKind 無し）
 *  - ENGINEER_SKILL_LEVEL を持つ 3 カテゴリ（HTML・CSS / JavaScript / フレームワーク・ライブラリ）に
 *    代表習熟度ペア（最も得意な X を1つ選ぶ single_choice ＋ 習熟度 proficiency single_choice level 0-3）を追加
 *  - 「はい/いいえ＋活用レベル」（デザインシステム）は proficiency single_choice 4 段階に正規化
 *  - 各トップカテゴリ先頭の経験設問へ isRequired=true（計 10 問）
 *  - CSV「その他」カテゴリはアーキテクチャ設計へ統合（重複は追加しない）。崩れ行 68-69 は正規 multi_choice に救済
 *  - 誤字補正: Crome→Chrome / Server Worker→Service Worker / 教会設計→境界設計 / Svelt→Svelte /
 *    OpeinAPI→OpenAPI / Model→Modal / メモカ→メモ化 / X-Frame-Optons→X-Frame-Options /
 *    アップグレー→アップグレード / Datadog. RUM→DatadogのRUM / Tailwind CSSS→Tailwind CSS ほか
 */

import type { DB } from '../../client';
import { runSkillSurveySeed } from './runner';

export type FrontendSurveySeedData = {
  jobType: 'frontend';
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
      scoringKind?: 'proficiency' | 'recency';
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

export const frontendSurveySeed: FrontendSurveySeedData = {
  jobType: 'frontend',
  title: 'フロントエンドエンジニア スキルアンケート',
  categories: [
    // ── HTML・CSS ──────────────────────────────────────────────
    {
      name: 'HTML・CSS',
      subcategory: '言語スキル',
      displayOrder: 0,
      questions: [
        {
          text: '経験のあるマークアップ・スタイル言語を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: [
            { text: 'HTML', displayOrder: 0 },
            { text: 'CSS', displayOrder: 1 },
          ],
        },
        {
          text: 'HTML・CSSを使って構築したことがあるサイトやシステムを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: '業務システム（管理画面など）', displayOrder: 0 },
            { text: 'SNS系（投稿、コメント、プロフィール機能など）', displayOrder: 1 },
            { text: 'ECサイト（カート機能、商品一覧、決済ページなど）', displayOrder: 2 },
            { text: 'メディアサイト（ニュース、ブログなど）', displayOrder: 3 },
            { text: 'LP（ランディングページ、キャンペーンページ）', displayOrder: 4 },
            { text: '管理系ダッシュボード', displayOrder: 5 },
            { text: '企業コーポレートサイト', displayOrder: 6 },
          ],
        },
        {
          // 行3（はい/いいえ）＋行4（活用レベル）を proficiency 4 段階に正規化
          text: 'デザインシステムの構築経験として最も近いものを選択してください。',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 2,
          choices: [
            { text: '未経験・知識なし', displayOrder: 0, level: 0 },
            { text: '部分的なガイドライン策定やCSS設計', displayOrder: 1, level: 1 },
            {
              text: 'チームでデザインシステムを作成し、コンポーネントライブラリを構築',
              displayOrder: 2,
              level: 2,
            },
            { text: '自らリードしてデザインシステム全体の設計・運用', displayOrder: 3, level: 3 },
          ],
        },
      ],
    },
    {
      name: 'HTML・CSS',
      subcategory: 'CSSプリプロセッサ',
      displayOrder: 1,
      questions: [
        {
          text: '経験のあるプリプロセッサを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'Sass', displayOrder: 0 },
            { text: 'Less', displayOrder: 1 },
          ],
        },
      ],
    },
    {
      name: 'HTML・CSS',
      subcategory: 'CSSフレームワーク',
      displayOrder: 2,
      questions: [
        {
          text: '経験のあるCSSフレームワークを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'Bootstrap', displayOrder: 0 },
            { text: 'Tailwind CSS', displayOrder: 1 },
            { text: 'Bulma', displayOrder: 2 },
            { text: 'Foundation', displayOrder: 3 },
            { text: 'Materialize', displayOrder: 4 },
          ],
        },
      ],
    },
    {
      name: 'HTML・CSS',
      subcategory: 'CSS設計',
      displayOrder: 3,
      questions: [
        {
          text: '経験のあるCSS設計手法を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'BEM', displayOrder: 0 },
            { text: 'OOCSS', displayOrder: 1 },
            { text: 'SMACSS', displayOrder: 2 },
            { text: 'Atomic Design', displayOrder: 3 },
          ],
        },
        {
          text: 'CSSを役割ごとにレイヤーに分けて設計・管理した経験はありますか？',
          questionType: 'single_choice',
          displayOrder: 1,
          choices: [
            { text: 'はい', displayOrder: 0 },
            { text: 'いいえ', displayOrder: 1 },
          ],
        },
      ],
    },
    {
      name: 'HTML・CSS',
      subcategory: '代表習熟度',
      displayOrder: 4,
      questions: [
        {
          text: 'このカテゴリで最も自信のあるスタイリング技術を1つ選んでください。',
          questionType: 'single_choice',
          displayOrder: 0,
          choices: [
            { text: 'Tailwind CSS', displayOrder: 0 },
            { text: 'Bootstrap', displayOrder: 1 },
            { text: 'Bulma', displayOrder: 2 },
            { text: 'Foundation', displayOrder: 3 },
            { text: 'Materialize', displayOrder: 4 },
            { text: 'Sass/SCSS', displayOrder: 5 },
            { text: '素のCSSのみ', displayOrder: 6 },
          ],
        },
        {
          text: '選んだスタイリング技術の習熟度を教えてください。',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: PROFICIENCY_CHOICES,
        },
      ],
    },
    // ── JavaScript ─────────────────────────────────────────────
    {
      name: 'JavaScript',
      subcategory: '言語スキル',
      displayOrder: 5,
      questions: [
        {
          text: '経験のある言語を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: [
            { text: 'JavaScript', displayOrder: 0 },
            { text: 'TypeScript', displayOrder: 1 },
          ],
        },
      ],
    },
    {
      name: 'JavaScript',
      subcategory: 'DOM操作・イベント',
      displayOrder: 6,
      questions: [
        {
          text: 'JavaScriptを利用したDOM操作やイベントで経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'DOM取得・操作', displayOrder: 0 },
            { text: '属性・スタイル制御', displayOrder: 1 },
            { text: 'イベントリスナ', displayOrder: 2 },
            { text: 'イベントバブリング制御', displayOrder: 3 },
            { text: 'イベントデリゲーション制御', displayOrder: 4 },
          ],
        },
      ],
    },
    {
      name: 'JavaScript',
      subcategory: '非同期処理・API通信',
      displayOrder: 7,
      questions: [
        {
          text: 'JavaScriptの非同期処理・API通信に関して、経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'コールバック関数を使った非同期処理', displayOrder: 0 },
            { text: 'Promise（try/catch）を使った非同期処理', displayOrder: 1 },
            { text: 'async/await構文を使った非同期処理', displayOrder: 2 },
            { text: 'XMLHttpRequestを使ったAPI通信', displayOrder: 3 },
            { text: 'Fetch APIを使ったAPI通信', displayOrder: 4 },
            { text: 'Axiosなどのライブラリを使ったAPI通信', displayOrder: 5 },
            { text: '複数のAPIを連続的・並列的に呼び出す処理', displayOrder: 6 },
            { text: '非同期処理中のエラーハンドリング', displayOrder: 7 },
            { text: 'APIレスポンスのJSONデータ処理', displayOrder: 8 },
            {
              text: 'APIレスポンスのキャッシュやデータ保存（localStorage/IndexedDBなど）',
              displayOrder: 9,
            },
          ],
        },
      ],
    },
    {
      name: 'JavaScript',
      subcategory: 'オブジェクト指向・モジュール化',
      displayOrder: 8,
      questions: [
        {
          text: 'JavaScriptのオブジェクト指向・モジュール化に関して、経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'オブジェクトリテラルを使ったデータ構造・機能定義', displayOrder: 0 },
            { text: 'コンストラクタ関数とプロトタイプを使ったオブジェクト設計', displayOrder: 1 },
            {
              text: 'ES6クラス（class、constructor、メソッド）を使ったオブジェクト設計',
              displayOrder: 2,
            },
            { text: 'クラス継承（extends、super）を使った実装', displayOrder: 3 },
            { text: 'モジュールパターン（IIFEなど）を使ったスコープ管理', displayOrder: 4 },
            { text: 'ESモジュール（import・export）を使ったモジュール化', displayOrder: 5 },
            { text: 'CommonJS（require/module.exports）を使ったモジュール化', displayOrder: 6 },
            { text: '名前空間を使ったグローバル汚染防止', displayOrder: 7 },
            { text: 'thisの挙動制御（bind、call、applyなど）', displayOrder: 8 },
            { text: 'クラスベースのUIコンポーネント', displayOrder: 9 },
          ],
        },
      ],
    },
    {
      name: 'JavaScript',
      subcategory: 'パフォーマンス最適化',
      displayOrder: 9,
      questions: [
        {
          text: 'JavaScriptのパフォーマンス最適化に関して、実践したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'DOM最適化（レンダリングパフォーマンス改善）', displayOrder: 0 },
            { text: '冗長なループやネストの改善', displayOrder: 1 },
            { text: '関数最適化（無駄なメモリ消費・再実行を抑制）', displayOrder: 2 },
            { text: 'デバウンス・スロットル対応', displayOrder: 3 },
            { text: 'メモリリーク解消', displayOrder: 4 },
            { text: 'Lazy loading（コード分割・動的インポート）', displayOrder: 5 },
            { text: 'Web Workerによるスレッド化', displayOrder: 6 },
            { text: '画像やメディアの最適化', displayOrder: 7 },
          ],
        },
      ],
    },
    {
      name: 'JavaScript',
      subcategory: '代表習熟度',
      displayOrder: 10,
      questions: [
        {
          text: 'このカテゴリで最も得意な言語を1つ選んでください。',
          questionType: 'single_choice',
          displayOrder: 0,
          choices: [
            { text: 'JavaScript', displayOrder: 0 },
            { text: 'TypeScript', displayOrder: 1 },
          ],
        },
        {
          text: '選んだ言語の習熟度を教えてください。',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: PROFICIENCY_CHOICES,
        },
      ],
    },
    // ── フレームワーク・ライブラリ ─────────────────────────────
    {
      name: 'フレームワーク・ライブラリ',
      subcategory: 'UIライブラリ・フレームワーク',
      displayOrder: 11,
      questions: [
        {
          text: '経験のあるUIライブラリ・フレームワークを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: [
            { text: 'React', displayOrder: 0 },
            { text: 'Vue', displayOrder: 1 },
            { text: 'Angular', displayOrder: 2 },
            { text: 'Solid', displayOrder: 3 },
            { text: 'Svelte', displayOrder: 4 },
            { text: 'Qwik', displayOrder: 5 },
          ],
        },
      ],
    },
    {
      name: 'フレームワーク・ライブラリ',
      subcategory: 'コンポーネントライブラリ',
      displayOrder: 12,
      questions: [
        {
          text: '経験のあるコンポーネントライブラリを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'MUI', displayOrder: 0 },
            { text: 'Chakra UI', displayOrder: 1 },
            { text: 'Ant Design', displayOrder: 2 },
            { text: 'Vuetify', displayOrder: 3 },
            { text: 'Quasar', displayOrder: 4 },
            { text: 'Naive UI', displayOrder: 5 },
            { text: 'Angular Material', displayOrder: 6 },
          ],
        },
        {
          text: 'UIライブラリでカスタマイズした経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'グローバルなテーマカラー・フォントなどの変更', displayOrder: 0 },
            { text: 'コンポーネント単位のスタイルオーバーライド', displayOrder: 1 },
            { text: 'カスタムバリアント・サイズなどの追加', displayOrder: 2 },
            {
              text: 'コンポーネント内部ロジックの置き換え（Props追加、イベント拡張）',
              displayOrder: 3,
            },
            { text: 'TypeScriptでの型補完やコンポーネント制限', displayOrder: 4 },
          ],
        },
      ],
    },
    {
      name: 'フレームワーク・ライブラリ',
      subcategory: 'SSRフレームワーク',
      displayOrder: 13,
      questions: [
        {
          text: '経験のあるSSRフレームワークを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'Next.js', displayOrder: 0 },
            { text: 'Remix', displayOrder: 1 },
            { text: 'Gatsby', displayOrder: 2 },
            { text: 'Nuxt.js', displayOrder: 3 },
            { text: 'Astro', displayOrder: 4 },
            { text: 'SvelteKit', displayOrder: 5 },
          ],
        },
      ],
    },
    {
      name: 'フレームワーク・ライブラリ',
      subcategory: 'ルーティング',
      displayOrder: 14,
      questions: [
        {
          text: '動的ルーティングやルートガードに関して、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            {
              text: 'パラメータ付きの動的ルーティング（例：/users/:idのようなユーザー詳細ページ）',
              displayOrder: 0,
            },
            {
              text: 'ネストされたルーティング（親コンポーネント内にサブビューを表示する入れ子構造）',
              displayOrder: 1,
            },
            {
              text: 'ロールベースアクセス制御（管理者・一般ユーザーなどによって表示や遷移を分岐）',
              displayOrder: 2,
            },
            {
              text: '認証チェックによるリダイレクト（未ログイン時に/loginに強制誘導）',
              displayOrder: 3,
            },
            {
              text: 'パスによるルートリダイレクトの実装（/アクセス時に/dashboardなどへ自動遷移）',
              displayOrder: 4,
            },
            {
              text: 'SSR/SSG時の動的パス生成（フレームワークの静的生成機能を使ってID/スラッグに応じたルートを生成）',
              displayOrder: 5,
            },
            {
              text: 'クエリパラメータを用いた動的制御（例：?page=2や?tab=settingsなどの分岐処理）',
              displayOrder: 6,
            },
          ],
        },
      ],
    },
    {
      name: 'フレームワーク・ライブラリ',
      subcategory: 'バリデーション',
      displayOrder: 15,
      questions: [
        {
          text: 'バリデーションの実装において、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: '入力項目に対する基本的なルール（必須、文字数、形式など）の実装', displayOrder: 0 },
            {
              text: 'バリデーションライブラリ（Zod、Yupなど）を利用してスキーマベースで定義',
              displayOrder: 1,
            },
            { text: 'サーバー側のバリデーション結果をクライアント側でマッピング表示', displayOrder: 2 },
            { text: 'リアルタイムにエラー表示を切り替える処理の実装', displayOrder: 3 },
            { text: '多言語対応されたエラーメッセージのだし分け', displayOrder: 4 },
          ],
        },
      ],
    },
    {
      name: 'フレームワーク・ライブラリ',
      subcategory: 'ステート管理',
      displayOrder: 16,
      questions: [
        {
          text: 'ステート管理について、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'ローカルステート（コンポーネント内の状態）を管理したUI制御', displayOrder: 0 },
            {
              text: '親子コンポーネント間での状態受け渡し（propsやinput/outputなど）',
              displayOrder: 1,
            },
            {
              text: '状態ロジックを再利用可能な形（カスタムフック・Composable・Serviceなど）に分離',
              displayOrder: 2,
            },
            {
              text: 'グローバルステート管理ツールを利用して、複数コンポーネント間の状態同期（Redux、Zustand、Pinia、NgRxなど）',
              displayOrder: 3,
            },
            { text: '非同期処理データ取得と状態管理の組み合わせ', displayOrder: 4 },
            { text: '状態管理のパフォーマンス最適化（メモ化、再レンダリング防止など）', displayOrder: 5 },
            { text: '状態の初期化・永続化（localStorage、IndexedDB、Cookieなど）', displayOrder: 6 },
            {
              text: 'URLクエリやルーティングと連携した状態管理（フィルタ・ソート状態など）',
              displayOrder: 7,
            },
          ],
        },
      ],
    },
    {
      name: 'フレームワーク・ライブラリ',
      subcategory: 'SSR/CSR/SSGの理解',
      displayOrder: 17,
      questions: [
        {
          text: 'SSR（Server-Side Rendering）に関して、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'SSRで初回表示のHTMLを出力する処理を実装した', displayOrder: 0 },
            { text: 'SSRとCSRを意図的に使い分けたページ設計を行ったことがある', displayOrder: 1 },
            { text: 'SEO改善のためにSSRを導入・最適化したことがある', displayOrder: 2 },
            {
              text: 'クライアント側との状態共有や初期データのシリアライズ/デシリアライズ処理を実装した',
              displayOrder: 3,
            },
            { text: 'SSRで発生するHydrationエラーの原因特定・解消した', displayOrder: 4 },
            { text: 'SSRにおけるデザインライブラリ（MUIなど）の制約に対処した経験がある', displayOrder: 5 },
            { text: 'SSRにおけるクッキー・セッション・認証情報の取り扱いを実装した', displayOrder: 6 },
            {
              text: 'SSRにおけるデータフェッチの仕組み（リクエスト時のAPIコールや初期データ取得）を設計・実装した',
              displayOrder: 7,
            },
          ],
        },
      ],
    },
    {
      name: 'フレームワーク・ライブラリ',
      subcategory: 'i18n対応',
      displayOrder: 18,
      questions: [
        {
          text: '多言語対応（i18n）に関して、経験したことのあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: '画面に表示するテキストをハードコーディングではなく辞書ファイルで管理', displayOrder: 0 },
            {
              text: 'ライブラリ（例：Vue i18n、react-intl、next-intlなど）を導入し、コンポーネント内で翻訳関数を利用',
              displayOrder: 1,
            },
            { text: 'ブラウザのAccept-LanguageやCookieを利用した言語の自動判定', displayOrder: 2 },
            { text: '日付や数値、通貨などのロケールに応じたフォーマット', displayOrder: 3 },
            {
              text: '言語セレクターやURLルーティングを通じて、UI上での言語切り替えを実装',
              displayOrder: 4,
            },
            { text: 'プレースホルダー付きの翻訳実装（例：{count}件の結果があります）', displayOrder: 5 },
          ],
        },
      ],
    },
    {
      name: 'フレームワーク・ライブラリ',
      subcategory: '代表習熟度',
      displayOrder: 19,
      questions: [
        {
          text: 'このカテゴリで最も得意なUIフレームワークを1つ選んでください。',
          questionType: 'single_choice',
          displayOrder: 0,
          choices: [
            { text: 'React', displayOrder: 0 },
            { text: 'Vue', displayOrder: 1 },
            { text: 'Angular', displayOrder: 2 },
            { text: 'Solid', displayOrder: 3 },
            { text: 'Svelte', displayOrder: 4 },
            { text: 'Qwik', displayOrder: 5 },
          ],
        },
        {
          text: '選んだUIフレームワークの習熟度を教えてください。',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: PROFICIENCY_CHOICES,
        },
      ],
    },
    // ── UI/UXスキル ────────────────────────────────────────────
    {
      name: 'UI/UXスキル',
      subcategory: '情報設計',
      displayOrder: 20,
      questions: [
        {
          text: '画面やUIコンポーネントの構造・情報設計に関して、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: [
            {
              text: '一覧と詳細画面、フォームなどの構成で、責務の観点やユーザーの認知負荷に配慮した情報整理',
              displayOrder: 0,
            },
            { text: 'ナビゲーション構造やヘッダー、パンくずリストなどの配置・階層設計', displayOrder: 1 },
            { text: 'スマホとPCでの情報表示順や量の調整', displayOrder: 2 },
            { text: 'ユーザーの目的や行動に基づいた表示要素の優先順位や配置順の設計', displayOrder: 3 },
          ],
        },
      ],
    },
    {
      name: 'UI/UXスキル',
      subcategory: '一貫性とデザイン原則の理解',
      displayOrder: 21,
      questions: [
        {
          text: 'デザインガイドや一貫性のあるUI設計に関して、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'ボタン、入力、モーダルなどの再利用可能なコンポーネント実装', displayOrder: 0 },
            {
              text: 'コンポーネントライブラリをStorybookなどを利用したコードベースの管理・運用',
              displayOrder: 1,
            },
            {
              text: 'デザインツール（Figma/AdobeXDなど）の設計ルールを踏襲したUIコンポーネント実装',
              displayOrder: 2,
            },
            {
              text: 'コンポーネントの状態（通常・ホバー・活性・エラーなど）に対する統一されたスタイル・ルール管理',
              displayOrder: 3,
            },
          ],
        },
      ],
    },
    {
      name: 'UI/UXスキル',
      subcategory: '状態管理とフィードバック',
      displayOrder: 22,
      questions: [
        {
          text: 'ユーザー操作に対するUIのフィードバック設計に関して、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'ローディング中、成功時、エラー時に状態に応じた表示の切り替え', displayOrder: 0 },
            { text: 'フォームでバリデーションエラーメッセージを表示', displayOrder: 1 },
            { text: 'トースト通知やモーダルで操作結果をフィードバック', displayOrder: 2 },
            {
              text: '非活性状態（disabled）やスケルトンUIなど読み込み中を表現する実装',
              displayOrder: 3,
            },
          ],
        },
      ],
    },
    {
      name: 'UI/UXスキル',
      subcategory: 'レスポンシブ対応',
      displayOrder: 23,
      questions: [
        {
          text: 'レスポンシブデザイン対応について、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'メディアクエリによるレスポンシブデザイン', displayOrder: 0 },
            { text: 'Flexbox用いたレイアウト設計', displayOrder: 1 },
            { text: 'CSS Gridレイアウト構築', displayOrder: 2 },
            { text: 'レスポンシブフォーム設計（横並び→縦並び切り替え）', displayOrder: 3 },
            { text: '画像対応（srcset、<picture>、WebP対応）', displayOrder: 4 },
          ],
        },
        {
          text: 'レスポンシブデザインのモバイル対応について、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'ハンバーガーメニューの実装', displayOrder: 0 },
            { text: 'レスポンシブなタイポグラフィ（clamp()関数、vw単位）', displayOrder: 1 },
            { text: 'レスポンシブユニット（%、vw、vh、rem）の使い分け', displayOrder: 2 },
            { text: 'Touch対応（hover、pointerメディアクエリ）', displayOrder: 3 },
          ],
        },
      ],
    },
    {
      name: 'UI/UXスキル',
      subcategory: '視覚的インタラクション',
      displayOrder: 24,
      questions: [
        {
          text: '視覚的インタラクションに関わるUIで実装経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'CSSアニメーション（transition/keyframes）', displayOrder: 0 },
            { text: 'JSアニメーションライブラリ', displayOrder: 1 },
            { text: 'Intersection Observerを利用したスクロールアニメーション', displayOrder: 2 },
            { text: 'SVGアニメーション', displayOrder: 3 },
            { text: 'チャートライブラリ（Chart.js、D3.js、Rechartsなど）', displayOrder: 4 },
            { text: 'Canvas/WebGLを使ったレンダリング', displayOrder: 5 },
          ],
        },
      ],
    },
    {
      name: 'UI/UXスキル',
      subcategory: 'アクセシビリティ対応',
      displayOrder: 25,
      questions: [
        {
          text: 'アクセシビリティ対応について、マークアップで実践したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            {
              text: 'セマンティックHTML（article、section、nav、main、header、footerの使い分け）',
              displayOrder: 0,
            },
            { text: 'aria属性（aria-label、aria-hidden、roleなど）の付与', displayOrder: 1 },
            {
              text: 'フォーム要素のラベル・説明テキストの関連付け（label、aria-describedbyなど）',
              displayOrder: 2,
            },
            { text: '色覚対応・コントラスト比の確保（WCAG基準）', displayOrder: 3 },
            { text: 'alt属性の付与', displayOrder: 4 },
            { text: 'フォーカスインジケーター（:focus-visibleの維持など）', displayOrder: 5 },
          ],
        },
        {
          text: 'アクセシビリティ対応について、JavaScriptを用いたUIで経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'モーダル・ダイアログでのフォーカストラップやaria-modal対応', displayOrder: 0 },
            { text: '動的なエラーメッセージやバリデーション結果のaria-live対応', displayOrder: 1 },
            {
              text: 'カスタムコンポーネント（例：アコーディオン、タブ）のARIA属性対応',
              displayOrder: 2,
            },
            {
              text: 'キーボード操作（Enter/Spaceキー、矢印キーでのナビゲーションなどの対応）',
              displayOrder: 3,
            },
            { text: '動的に更新される通知/ステータスメッセージのaria-live対応', displayOrder: 4 },
            { text: 'フォーム入力の支援（aria-describedby/invalidなどの付与）', displayOrder: 5 },
            { text: 'ページ遷移時のフォーカス管理（SPAでの遷移含む）', displayOrder: 6 },
          ],
        },
        {
          text: 'アクセシビリティの品質を評価するために、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 2,
          choices: [
            { text: 'axe DevToolsやWAVEなどの自動検証ツールを使った評価', displayOrder: 0 },
            { text: 'Lighthouse（Chrome DevToolsなど）のアクセシビリティスコア評価', displayOrder: 1 },
            {
              text: 'スクリーンリーダー（NVDA、VoiceOver、TalkBackなど）を用いた実機テスト',
              displayOrder: 2,
            },
            { text: '視覚シミュレーター（Chrome拡張機能など）を使った色覚テスト', displayOrder: 3 },
            { text: 'コントラスト比チェッカー（WebAIMなど）を使った視認性評価', displayOrder: 4 },
            { text: 'アクセシビリティ診断レポートの作成（問題点・改善提案）', displayOrder: 5 },
            { text: '実ユーザー（障害当事者）とのユーザビリティテスト', displayOrder: 6 },
          ],
        },
      ],
    },
    {
      name: 'UI/UXスキル',
      subcategory: 'ユーザー行動データに基づくUI/UX改善',
      displayOrder: 26,
      questions: [
        {
          text: 'ユーザー行動データをもとにUI/UX改善に取り組んだ経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            {
              text: 'DatadogやSentryのSession Replay機能を利用したユーザー操作履歴によるUI/UX改善',
              displayOrder: 0,
            },
            {
              text: 'Google Analytics、Amplitude、Mixpanelなどのアクセス解析ツールを利用したユーザーの離脱・導線の分析',
              displayOrder: 1,
            },
            {
              text: 'DatadogのRUMなどでフロントエンドパフォーマンスやUX指標を用いた改善',
              displayOrder: 2,
            },
            {
              text: 'ヒートマップ/クリックマップツールを利用して、UI要素の表示率やクリック率を確認し、配置や導線の改善を実施',
              displayOrder: 3,
            },
            { text: 'A/BテストやFeature Flagを用いたUI変更の効果検証', displayOrder: 4 },
          ],
        },
      ],
    },
    // ── バックエンド連携 ───────────────────────────────────────
    {
      name: 'バックエンド連携',
      subcategory: 'API呼び出し',
      displayOrder: 27,
      questions: [
        {
          text: 'バックエンドのAPI呼び出しに関して、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: [
            { text: 'fetchやaxiosを使ったREST APIでのデータ取得', displayOrder: 0 },
            { text: 'クエリパラメータ、パスパラメータを使った動的なリクエスト', displayOrder: 1 },
            { text: 'GraphQL APIを使ったデータ取得', displayOrder: 2 },
            { text: 'APIとの通信処理をカスタムフックやサービス層として共通化', displayOrder: 3 },
          ],
        },
        {
          text: 'gRPCを使ったAPI呼び出しに関して、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'gRPC/gRPC-Webを用いて、バックエンドAPIからのデータ取得', displayOrder: 0 },
            { text: '.protoファイルからのクライアントコード生成', displayOrder: 1 },
            {
              text: 'Connect（Buf）やtRPCなどを用いた型安全なAPI呼び出し環境の構築',
              displayOrder: 2,
            },
            {
              text: 'gRPC環境でのステータスコードの処理分岐や通信エラーのハンドリング処理',
              displayOrder: 3,
            },
            { text: 'gRPC環境でのトークンを利用した認証・認可処理', displayOrder: 4 },
          ],
        },
      ],
    },
    {
      name: 'バックエンド連携',
      subcategory: '型安全性',
      displayOrder: 28,
      questions: [
        {
          text: 'APIの入出力データに関して、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'TypeScriptの型を定義したリクエスト・レスポンス構造の明確化', displayOrder: 0 },
            { text: 'zodやyupなどのバリデーションライブラリを使ったスキーマ定義', displayOrder: 1 },
            {
              text: 'OpenAPIやGraphQLの定義から型定義を自動生成（例：openapi-typescript、graphql-codegen）',
              displayOrder: 2,
            },
            { text: 'バックエンドと共通の型スキーマを使った型の整合性の担保（例：tRPC）', displayOrder: 3 },
          ],
        },
      ],
    },
    {
      name: 'バックエンド連携',
      subcategory: 'エラーハンドリング',
      displayOrder: 29,
      questions: [
        {
          text: 'API呼び出しの時のエラーに対して、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'エラー発生時にユーザーへトーストやモーダルで通知', displayOrder: 0 },
            {
              text: 'バリデーションエラー、認証エラー、ネットワークエラーなどを分類して処理を分離',
              displayOrder: 1,
            },
            { text: 'APIエラーをグローバルでキャッチし、共通のエラーハンドラーで処理', displayOrder: 2 },
            { text: 'エラー発生後のフォールバック処理（代替画面や再読み込み誘導）', displayOrder: 3 },
          ],
        },
      ],
    },
    {
      name: 'バックエンド連携',
      subcategory: '認証トークン',
      displayOrder: 30,
      questions: [
        {
          text: '認証付きAPIの呼び出しにおいて、トークンの扱いで経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            {
              text: 'ログイン後に取得したアクセストークンをAuthorizationヘッダーに付与してAPI呼び出し',
              displayOrder: 0,
            },
            { text: 'Cookieに格納されたセッショントークンを自動でAPIリクエストに添付', displayOrder: 1 },
            { text: 'トークンの有効期限切れを検知し、自動リフレッシュ', displayOrder: 2 },
            { text: 'SSO認証の実装', displayOrder: 3 },
            {
              text: 'OAuth2による認証フロー（認可コード、リフレッシュトークンなど）実装',
              displayOrder: 4,
            },
            { text: 'Auth0を利用した認証', displayOrder: 5 },
            { text: 'Firebase Authenticationを利用した認証', displayOrder: 6 },
          ],
        },
      ],
    },
    {
      name: 'バックエンド連携',
      subcategory: '再試行',
      displayOrder: 31,
      questions: [
        {
          text: 'API呼び出しが失敗した場合のリトライに関して、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'ネットワーク系の一時的な失敗時に、再試行処理の自動実行', displayOrder: 0 },
            { text: 'TanStack Queryなどのライブラリのretry、retryDelayオプションを利用', displayOrder: 1 },
            { text: '再試行回数、間隔、条件の最適化', displayOrder: 2 },
            { text: '再試行後の失敗に備え、再読み込みやサポート案内の表示', displayOrder: 3 },
          ],
        },
      ],
    },
    {
      name: 'バックエンド連携',
      subcategory: 'キャッシュ制御',
      displayOrder: 32,
      questions: [
        {
          text: 'APIデータのキャッシュ制御に関して、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            {
              text: 'TanStack Query、SWRなどを利用したキャッシュと自動再取得の制御',
              displayOrder: 0,
            },
            { text: 'キャッシュの有効期限を指定したパフォーマンスの最適化', displayOrder: 1 },
            {
              text: '手動でキャッシュを無効化・リセットして再フェッチする処理（例：invalidateQuery）',
              displayOrder: 2,
            },
            {
              text: '複数画面で同じデータを共有することによる不要なAPIリクエストの削減',
              displayOrder: 3,
            },
          ],
        },
      ],
    },
    // ── セキュリティ ───────────────────────────────────────────
    {
      name: 'セキュリティ',
      subcategory: 'XSS対策',
      displayOrder: 33,
      questions: [
        {
          text: 'XSS（クロスサイトスクリプティング）やCSRF（クロスサイトリクエストフォージェリ）に関して、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: [
            { text: 'ユーザー入力を出力する際に、HTMLエスケープやサニタイズ処理を実装', displayOrder: 0 },
            {
              text: '危険なHTMLタグや属性を除去するためにDOMPurifyなどのサニタイズライブラリを利用',
              displayOrder: 1,
            },
            {
              text: 'クエリパラメータやURLフラグメントを通じて渡された値に対して、安全性を考慮した処理の実装',
              displayOrder: 2,
            },
            {
              text: 'innerHTMLやdangerouslySetInnerHTMLを使用する際に、信頼された入力のみを対象として利用',
              displayOrder: 3,
            },
            {
              text: 'フォーム送信やPOSTリクエストで、CSRFトークンを埋め込み、サーバーと照合する処理',
              displayOrder: 4,
            },
          ],
        },
      ],
    },
    {
      name: 'セキュリティ',
      subcategory: 'セキュリティヘッダー',
      displayOrder: 34,
      questions: [
        {
          text: 'セキュリティ関連のHTTPレスポンスヘッダーについて、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            {
              text: 'Content-Security-Policyを設定し、外部スクリプトやインラインスクリプトを制御',
              displayOrder: 0,
            },
            {
              text: 'X-Frame-Optionsやframe-ancestorsを使ってクリックジャッキングを防止',
              displayOrder: 1,
            },
            { text: 'Strict-Transport-Securityを有効にしてHTTPSの強制', displayOrder: 2 },
          ],
        },
      ],
    },
    {
      name: 'セキュリティ',
      subcategory: '環境変数・機密情報の露出',
      displayOrder: 35,
      questions: [
        {
          text: '環境変数や機密情報の取り扱いに関して、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            {
              text: 'クライアント側で利用する環境変数をプレフィックス付き（例：PUBLIC_やVITE_など）で管理',
              displayOrder: 0,
            },
            {
              text: '機密情報（APIキーや認証情報）を環境変数やコード内に埋め込まず、サーバー経由で取得',
              displayOrder: 1,
            },
            {
              text: 'ビルド・デプロイ時に環境変数がバンドルに含まれていないかを確認し、不要な情報含まれていないように管理',
              displayOrder: 2,
            },
            {
              text: '環境ごとの設定（開発・ステージング・本番）に応じた環境変数の切り替え、スコープ管理',
              displayOrder: 3,
            },
            { text: 'CI/CDやホスティングサービスで、環境変数の公開・非公開を設定', displayOrder: 4 },
          ],
        },
      ],
    },
    {
      name: 'セキュリティ',
      subcategory: '脆弱性のある依存パッケージ',
      displayOrder: 36,
      questions: [
        {
          text: 'npmや外部ライブラリなど、依存パッケージのセキュリティ対策として実施したことのあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            {
              text: 'npm audit、yarn audit、pnpm auditなどで依存パッケージの脆弱性を定期的に確認',
              displayOrder: 0,
            },
            {
              text: 'Snyk、Dependabot、Renovateなどの自動スキャン・更新ツールを導入・運用',
              displayOrder: 1,
            },
            {
              text: '開発時に脆弱性レポートが出たライブラリについて、代替ライブラリへの切り替えや除外対応',
              displayOrder: 2,
            },
            {
              text: '影響範囲の大きい依存関係（例：axios、lodash、momentなど）については、意図的にバージョン固定や手動アップグレードを実施',
              displayOrder: 3,
            },
          ],
        },
      ],
    },
    {
      name: 'セキュリティ',
      subcategory: 'セキュリティ設計力',
      displayOrder: 37,
      questions: [
        {
          text: 'ユーザー入力に関して、セキュリティ上の配慮や境界設計の観点から対応したことのあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            {
              text: 'クライアント側でのフォームバリデーションを実装した上で、サーバー側にもバリデーション処理を必ず実装する',
              displayOrder: 0,
            },
            { text: '入力値の型・長さ・範囲・形式を具体的に制限する設計を実施', displayOrder: 1 },
            {
              text: 'フロントエンドで制限されていても、バックエンドで再検証・拒否されることを前提に設計',
              displayOrder: 2,
            },
            {
              text: 'エラー時に過剰なフィードバックを避け、攻撃者にヒントを与えないようなものにしている',
              displayOrder: 3,
            },
          ],
        },
      ],
    },
    {
      name: 'セキュリティ',
      subcategory: 'エラー・ログ管理',
      displayOrder: 38,
      questions: [
        {
          text: 'エラー処理やログ出力に関して、セキュリティ面で実施したことのあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            {
              text: 'APIレスポンスに含まれる詳細なエラー情報をそのままユーザーに表示せず、汎用的なメッセージにして通知',
              displayOrder: 0,
            },
            {
              text: 'クライアント側のエラーをSentry、LogRocket、Datadogなどに送信し、収集・監視の仕組みを構築',
              displayOrder: 1,
            },
            {
              text: 'ログや通知の中に、ユーザー情報やトークンなどの機密データが含まれないようマスキング・除外処理を実施',
              displayOrder: 2,
            },
            {
              text: 'フロントエンドの内部エラーコードやスタックトレースがUIや通知経由で外部に漏れないようにフィルタ処理を行った',
              displayOrder: 3,
            },
          ],
        },
      ],
    },
    // ── アーキテクチャ設計（CSV「その他」を統合）───────────────
    {
      name: 'アーキテクチャ設計',
      subcategory: '構成パターン設計',
      displayOrder: 39,
      questions: [
        {
          text: 'ディレクトリ構成において、設計・運用の経験があるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: [
            {
              text: 'features/xxのように機能単位でディレクトリを構成し、関連するUIロジック/APIを1箇所で管理（Feature-based構成）',
              displayOrder: 0,
            },
            {
              text: 'ドメインや業務モデル（例：user、project、paymentなど）を軸に、ディレクトリやモジュールを分けた（Domain-based構成）',
              displayOrder: 1,
            },
            {
              text: 'UI層、アプリケーション層、データ取得層などをレイヤー構造として分離（Layer-based構成）',
              displayOrder: 2,
            },
            {
              text: 'クリーンアーキテクチャやドメイン駆動設計の思想に基づき、依存関係の流れや層の責務を意識して、domain/、usecases/、infrastructure/などに分離',
              displayOrder: 3,
            },
            {
              text: '特定のパターンにこだわらず、チームやプロダクトの性質に応じて構成戦略を選定',
              displayOrder: 4,
            },
          ],
        },
      ],
    },
    {
      name: 'アーキテクチャ設計',
      subcategory: 'スコープ設計',
      displayOrder: 40,
      questions: [
        {
          text: 'スタイルや定数・共通モジュールのスコープに関して、設計・運用の経験があるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            {
              text: 'グローバルに使うスタイルや定数はshared/、global/などで一元管理し、ローカルに閉じたものは機能単位で行うなどスコープを分離した設計',
              displayOrder: 0,
            },
            {
              text: 'カラーパレットやフォントサイズなどのデザイントークンを共通化し、CSS変数などで統一',
              displayOrder: 1,
            },
            {
              text: '誤用や循環参照を避けるために、env、route、apiなどの定数・共通値をスコープ分離した設計',
              displayOrder: 2,
            },
            {
              text: '多言語対応やテーマ切り替えなど、スコープの広い状態をグローバルで管理する設計',
              displayOrder: 3,
            },
          ],
        },
      ],
    },
    {
      name: 'アーキテクチャ設計',
      subcategory: 'スケーラビリティ',
      displayOrder: 41,
      questions: [
        {
          text: '中〜大規模のフロントエンドプロジェクトにおいて、構造のスケーラビリティを考慮した実装・運用経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            {
              text: '数十以上の機能・ページを持つプロジェクトにおいて、初期から拡張を見越したディレクトリ構成の設計',
              displayOrder: 0,
            },
            {
              text: 'コンポーネントやhooks、ユーティリティなどを粒度・責務に応じた再分離・統合',
              displayOrder: 1,
            },
            {
              text: '複数人のチーム開発において、命名規則やディレクトリ命名、レイヤー構成などの設計方針',
              displayOrder: 2,
            },
            { text: 'モノレポや複数アプリ構成におけるリポジトリ設計・ビルド分離', displayOrder: 3 },
          ],
        },
      ],
    },
    {
      name: 'アーキテクチャ設計',
      subcategory: 'コンポーネント設計',
      displayOrder: 42,
      questions: [
        {
          text: 'コンポーネント設計において、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: '汎用コンポーネント（Button、Modalなど）を再利用前提にした設計・実装', displayOrder: 0 },
            {
              text: '画面や機能の構成に合わせて、適切な粒度・責務でコンポーネントを分割・統合',
              displayOrder: 1,
            },
            { text: 'presentation/containerなどを利用してロジックと見た目を分離', displayOrder: 2 },
            { text: 'childrenやslotsを使った柔軟なUI構成', displayOrder: 3 },
          ],
        },
        {
          // CSV 行68（崩れ行）を正規 multi_choice に救済
          text: 'コンポーネントライブラリのコード化・設計ポリシー策定で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'Storybookなどでコンポーネントライブラリをコード化・運用した', displayOrder: 0 },
            { text: 'UIコンポーネントの設計ポリシーを策定した', displayOrder: 1 },
          ],
        },
        {
          // CSV 行69（崩れ行）を正規 multi_choice に救済
          text: 'デザインツール連携で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 2,
          choices: [
            { text: 'Figmaなどのデザインツールとコードを同期させる仕組みを構築した', displayOrder: 0 },
            { text: 'Figma/AdobeXDなどを用いた開発連携を行った', displayOrder: 1 },
          ],
        },
      ],
    },
    {
      name: 'アーキテクチャ設計',
      subcategory: '状態管理の設計',
      displayOrder: 43,
      questions: [
        {
          text: '状態管理において、実務で経験したことがある内容を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'グローバル状態管理ライブラリの導入と利用', displayOrder: 0 },
            { text: '状態のスコープ設計（ローカルとグローバルの使い分け）', displayOrder: 1 },
            { text: 'サーバー状態とクライアント状態の分離管理', displayOrder: 2 },
            { text: 'ネストされたオブジェクトや配列の更新管理', displayOrder: 3 },
            { text: '状態の初期化・リセット処理の実装', displayOrder: 4 },
            { text: '状態変更の副作用制御（EffectやMiddleware）', displayOrder: 5 },
            { text: '状態の永続化（localStorageなど）', displayOrder: 6 },
          ],
        },
      ],
    },
    // ── パフォーマンス・チューニング ───────────────────────────
    {
      name: 'パフォーマンス・チューニング',
      subcategory: 'レンダリング最適化',
      displayOrder: 44,
      questions: [
        {
          text: 'レンダリング最適化について、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: [
            {
              text: 'コンポーネントの再レンダリング原因を特定し、メモ化や最適化手法（React.memo、useMemo / Vue：v-once / Angular：OnPushなど）を用いて改善した',
              displayOrder: 0,
            },
            {
              text: '再レンダリング回数を減らすために、コンポーネントの責務分離や分割構成を見直した',
              displayOrder: 1,
            },
            { text: 'イミュータブルなデータ構造を用いて、差分検知（シャロー比較）を効率化した', displayOrder: 2 },
            { text: '大量リスト表示において、仮想スクロール（Virtual Scroll）を導入した', displayOrder: 3 },
            {
              text: '無限ループや高頻度再レンダリングなど、レンダリングに関するパフォーマンスバグを修正した',
              displayOrder: 4,
            },
          ],
        },
      ],
    },
    {
      name: 'パフォーマンス・チューニング',
      subcategory: 'ロード最適化',
      displayOrder: 45,
      questions: [
        {
          text: 'ロード最適化について、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'ファイル分割戦略（Code Splitting）を導入し、初期表示サイズを抑制した', displayOrder: 0 },
            {
              text: 'Lazy Loadを活用し、画像や非同期コンポーネントの初期読み込みを軽量化した',
              displayOrder: 1,
            },
            {
              text: 'Webpack Bundle Analyzerなどのツールでバンドル内容を可視化・分析し、不要なライブラリの削除や軽量な代替品への移行を行なった',
              displayOrder: 2,
            },
            { text: 'Tree Shakingを意識し、ライブラリのインポート方法を最適化した', displayOrder: 3 },
          ],
        },
      ],
    },
    {
      name: 'パフォーマンス・チューニング',
      subcategory: '実行時・インタラクション最適化',
      displayOrder: 46,
      questions: [
        {
          text: '実行時・インタラクション最適化について、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            {
              text: '重い処理（画像変換、全文検索、データ集計など）をWeb WorkerにオフロードしてUIの応答性を保った',
              displayOrder: 0,
            },
            {
              text: 'スクロールや入力イベントなどでdebounceやthrottleを用い、過剰なイベントの発火や処理を制御した',
              displayOrder: 1,
            },
            {
              text: 'requestAnimationFrameの活用やCSSのtransform、opacityを用いてスムーズなアニメーションを実装した',
              displayOrder: 2,
            },
          ],
        },
      ],
    },
    {
      name: 'パフォーマンス・チューニング',
      subcategory: '分析・高度な最適化',
      displayOrder: 47,
      questions: [
        {
          text: '分析・計測について、経験したことがあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            {
              text: 'Chrome DevToolsやLighthouseなどを用いてパフォーマンスの測定や改善ポイントの分析した',
              displayOrder: 0,
            },
            {
              text: 'Core Web Vitals（LCP、INP、CLS）を指標として、具体的な改善（画像の優先度づけ、フォント読み込み最適化など）を行なった',
              displayOrder: 1,
            },
            {
              text: 'Service Workerを用いてリソースキャッシュし、2回目以降のアクセスを高速化した',
              displayOrder: 2,
            },
          ],
        },
      ],
    },
    // ── テスト ─────────────────────────────────────────────────
    {
      name: 'テスト',
      subcategory: '単体テスト',
      displayOrder: 48,
      questions: [
        {
          text: '単体テストにおいて、経験のあるテストフレームワーク・ツールを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: [
            { text: 'Jest', displayOrder: 0 },
            { text: 'Vitest', displayOrder: 1 },
            { text: 'Mocha', displayOrder: 2 },
            { text: 'Jasmine', displayOrder: 3 },
            { text: 'React Testing Library', displayOrder: 4 },
            { text: 'Vue Test Utils', displayOrder: 5 },
            { text: 'Angular Testing Utilities', displayOrder: 6 },
            { text: 'Svelte Testing Library', displayOrder: 7 },
          ],
        },
        {
          text: '単体テストにおいて、次の中から経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'コンポーネント単位のProps/outputに対するテスト', displayOrder: 0 },
            { text: '関数やHooksなどロジックの単体テスト', displayOrder: 1 },
            { text: 'モックやスタブを使ったAPIや依存のコンポーネントの切り離し', displayOrder: 2 },
            { text: 'フェイク・擬似データを使った状態再現やUI差分の確認', displayOrder: 3 },
            { text: 'エラーハンドリングや条件分岐のテスト', displayOrder: 4 },
            { text: 'テストカバレッジを確認するツールの利用', displayOrder: 5 },
          ],
        },
      ],
    },
    {
      name: 'テスト',
      subcategory: '結合テスト',
      displayOrder: 49,
      questions: [
        {
          text: '結合テスト・E2Eテストで使用したツールやフレームワークを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'Cypress', displayOrder: 0 },
            { text: 'Playwright', displayOrder: 1 },
            { text: 'Puppeteer', displayOrder: 2 },
            { text: 'Selenium', displayOrder: 3 },
          ],
        },
        {
          text: '結合テスト・E2Eテストにおいて、次の中から経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'ユーザー操作シナリオをブラウザベースで自動化した', displayOrder: 0 },
            {
              text: 'フォームバリデーションやエラー表示など、状態遷移を伴う処理の結合テスト',
              displayOrder: 1,
            },
            { text: '認証状態やルーティング制御（ガードやリダイレクト）のテスト', displayOrder: 2 },
            { text: 'レスポンシブデザインやモバイルサイズのUI検証', displayOrder: 3 },
            { text: 'モックサーバーを用いたフロントエンドとAPIの結合テスト', displayOrder: 4 },
            {
              text: 'コンポーネント間のデータ連携や親子間通信の挙動を検証するテスト設計',
              displayOrder: 5,
            },
            { text: 'UIテスト失敗時のスクリーンショットやログを用いたデバッグ', displayOrder: 6 },
          ],
        },
      ],
    },
    // ── ビルド・デプロイ ───────────────────────────────────────
    {
      name: 'ビルド・デプロイ',
      subcategory: 'ビルドツール',
      displayOrder: 50,
      questions: [
        {
          text: '経験のあるビルドツールを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: [
            { text: 'Vite', displayOrder: 0 },
            { text: 'Webpack', displayOrder: 1 },
            { text: 'Rollup', displayOrder: 2 },
            { text: 'esbuild', displayOrder: 3 },
          ],
        },
      ],
    },
    {
      name: 'ビルド・デプロイ',
      subcategory: 'バンドル最適化',
      displayOrder: 51,
      questions: [
        {
          text: 'バンドルの最適化設計において、経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'Tree Shaking', displayOrder: 0 },
            { text: 'Code Splitting', displayOrder: 1 },
            { text: 'キャッシュバスティング', displayOrder: 2 },
            { text: 'Lazy Load設計', displayOrder: 3 },
          ],
        },
      ],
    },
    {
      name: 'ビルド・デプロイ',
      subcategory: '環境構築',
      displayOrder: 52,
      questions: [
        {
          text: 'ビルド環境構築において、経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: [
            { text: 'CI上でビルドプロセスの組み込み', displayOrder: 0 },
            { text: '環境ごとにビルド結果の出し分け', displayOrder: 1 },
            {
              text: 'モノレポ構成でのアプリ単位ビルド設定（Turborepo、Nxなどの組み合わせ）',
              displayOrder: 2,
            },
            { text: 'ビルド成果物の検証（E2Eテスト、Lint、型チェック）', displayOrder: 3 },
            {
              text: 'Tailwind CSS、PostCSS、SCSSなどのプリプロセッサやユーティリティCSSのビルド',
              displayOrder: 4,
            },
          ],
        },
        {
          text: '経験のあるビルド環境を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: [
            { text: 'GitHub Actions', displayOrder: 0 },
            { text: 'GitLab CI', displayOrder: 1 },
            { text: 'Circle CI', displayOrder: 2 },
          ],
        },
      ],
    },
  ],
};

/**
 * frontend スキルアンケートの seed を投入する（idempotent）。共通ランナーへ委譲する。
 */
export async function runFrontendSkillSurveySeed(db: DB): Promise<void> {
  await runSkillSurveySeed(db, frontendSurveySeed, { logLabel: 'frontend' });
}
