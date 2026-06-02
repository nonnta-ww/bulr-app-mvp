# 要件定義書

## はじめに

エンジニア候補者は、実務判断力を問う面接形式に慣れておらず、本番エントリー前に低リスクで練習できる場がない。bulr にとっては、二面市場の成立を待たずに候補者単独で価値を持つ「engagement hook」が必要で、候補者プール形成の起点となる機能が求められている。

本 spec は、`apps/candidate`（bulr.net）に AI が面接官役を務めるテキスト模擬面接機能を追加する。bulr の 57 パターン・4 段階深掘り・5 次元ルーブリックに紐づく**形成的フィードバック**（スコアではなく成長示唆）を候補者が受け取れるようにし、月次クォータ（3 回/候補者）でコストを抑制する。

## スコープ境界（Boundary Context）

- **In scope（本 spec が担う）**:
  - `mock_interview` テーブル（Drizzle スキーマ・migration・クエリ関数）
  - `packages/ai/mock/` の 2 LLM 関数（`conductMockInterview` / `generateFormativeFeedback`）
  - 候補者向けテキストチャット UI（3 画面: パターン選択・チャット・結果）
  - 2 API Route（`/api/mock-interview/turns/next` / `/api/mock-interview/finalize`）
  - 月次クォータ検査ロジック（サーバー側 3 回/月/候補者）

- **Out of scope（本 spec が担わない）**:
  - 音声録音・文字起こし（テキスト専用 MVP）
  - スコア・ランキング・ピア比較
  - admin 側のコスト監視・クォータ管理 UI（admin-operations spec が担う）
  - `assessment-engine`（BtoB 面接エンジン）への変更
  - `assessment_pattern` マスタの編集（読み取り専用消費）

- **Adjacent expectations（隣接 spec への期待）**:
  - `candidate-auth-onboarding` が提供する `requireCandidate()` / `candidate_profile` を利用する
  - `assessment-pattern-seed` が提供する 57 パターンの `assessment_pattern` テーブルを読み取り専用で消費する
  - `skill-survey` が提供する回答データ（任意）でパターン推奨の上位表示を行う
  - `admin-operations` が `mock_interview` テーブルを読み取り専用で消費し LLM コスト集計を行う

---

## 要件

### 要件 1: 月次クォータ管理

**目的:** 候補者として、月に 3 回まで模擬面接セッションを開始できる。コスト管理のため上限を超えたセッション開始は拒否される。

#### 受け入れ条件

1. モック面接システムは、候補者が当月に開始した `mock_interview` セッション数をサーバー側で検査する。
2. 当月のセッション数が 3 未満の場合、モック面接システムは新規セッションの作成を許可する。
3. 当月のセッション数が 3 に達している場合、モック面接システムは新規セッションの作成を拒否し、「今月の上限に達しました（3 回 / 月）」というメッセージを返す。
4. モック面接システムは、クォータ判定をサーバー側（Server Action または API Route）で行い、クライアント側の操作では迂回できないようにする。
5. 月次クォータのカウント基準は、`mock_interview.created_at` が有効クォータウィンドウ開始時刻以降であるレコード数とする。ウィンドウ開始時刻 = `GREATEST(date_trunc('month', now()), COALESCE(candidate_profile.quota_reset_at, date_trunc('month', now())))` —— admin が `quota_reset_at` をリセットした場合はその日時が起点となり、リセット前のセッションはカウントから除外される。

### 要件 2: パターン選択と推奨

**目的:** 候補者として、bulr の 57 状況パターン一覧から 1 つを選んで模擬面接を開始できる。skill-survey 回答がある場合は関連パターンを上位表示することで選択を補助される。

#### 受け入れ条件

1. モック面接システムは、`assessment_pattern` テーブルから `is_active = true` の全パターンをカテゴリ順（D / T / P / S / O / A）に一覧表示する。
2. 候補者の `skill_survey_response` レコードが存在する場合、モック面接システムはパターン一覧の上部に「あなたへのおすすめ」セクションとして汎用的な推奨ヒントを表示する（任意実装・MVP 簡易化: `skill_survey_response` の存在有無（boolean）のみを確認し、回答内容の解析・特定パターン抽出は行わない）。
3. 候補者がパターンを選択してセッションを開始した場合、モック面接システムは選択した `pattern_code` を新規 `mock_interview` レコードに記録する。
4. 当月のクォータが上限（3 回）に達している場合、モック面接システムはパターン選択画面でクォータ上限メッセージを表示し、「開始」ボタンを無効化する。

### 要件 3: AI 面接官による質問生成

**目的:** 候補者として、AI が bulr の 57 パターン・4 段階深掘り構造に準拠した面接官役として質問を生成し、テキストチャット形式で回答できる。

#### 受け入れ条件

1. モック面接システムは、セッション開始時に選択パターンの `level_1_intro` に基づく最初の質問を AI が生成して表示する。
2. 候補者がテキストを入力して送信した場合、モック面接システムは `conductMockInterview` 関数を呼び出し、4 段階深掘り構造（level 1 → 2 → 3 → 4）に沿った次の質問を生成して返す。
3. モック面接システムは、AI が生成する質問が選択パターンの `level_1_intro` / `level_2_focus` / `level_3_focus` / `level_4_focus` と `ai_perspective` を反映した内容であることを保証する（プロンプト制約）。
4. 候補者が入力を送信中（AI 応答待ち）の間、モック面接システムはローディング状態を表示し、重複送信を防止する。
5. モック面接システムは、1 セッションあたりのターン数を `mock_interview.turn_count` に記録する。
6. セッション中の会話履歴（質問・回答の時系列）はクライアント側の React state で保持し、AI 呼び出し時にコンテキストとして渡す。

### 要件 4: セッション終了と形成的フィードバック生成

**目的:** 候補者として、「面接を終了する」ボタンを押すことでセッションを終了し、5 次元ルーブリックに基づく形成的フィードバック（スコアなし・成長示唆）を受け取れる。

#### 受け入れ条件

1. 候補者が「面接を終了する」を選択した場合、モック面接システムは `/api/mock-interview/finalize` を呼び出し、セッションの会話履歴全体を送信する。
2. モック面接システムは、`generateFormativeFeedback` 関数を呼び出し、5 次元ルーブリック（真贋・判断力・射程・メタ認知・AI 活用リテラシー）ごとの成長示唆テキストを生成する。
3. 生成されたフィードバックはスコア数値を含まず、「〜が観察されました」「次は〜を意識すると良いでしょう」など成長方向を示す文章形式とする。
4. モック面接システムは、`mock_interview` レコードの `formative_feedback`（JSONB）・`ended_at`・`turn_count`・`metadata.llm_cost_estimate` を `/api/mock-interview/finalize` の処理完了時に更新する。
5. フィードバック生成が完了した後、モック面接システムは候補者を `/mock-interview/[sessionId]/result` ページにリダイレクトする。

### 要件 5: フィードバック結果表示

**目的:** 候補者として、セッション終了後に形成的フィードバック画面を閲覧でき、5 次元ルーブリックに沿った成長示唆を確認できる。

#### 受け入れ条件

1. モック面接システムは、`/mock-interview/[sessionId]/result` ページで `mock_interview.formative_feedback` を取得して表示する。
2. モック面接システムは、フィードバックを 5 次元（真贋・判断力・射程・メタ認知・AI 活用リテラシー）ごとにセクション分けして表示する。
3. フィードバック結果ページには、選択パターン名・セッション日時・ターン数を補足情報として表示する。
4. モック面接システムは、フィードバックが未生成（`formative_feedback` が null）の状態でアクセスされた場合、「フィードバック生成中」のローディング表示を行い、生成完了後に自動更新する。
5. フィードバック結果ページに「新しい模擬面接を開始」リンクを表示し、候補者が `/mock-interview` に戻れるようにする。

### 要件 6: セッション認証ガードとデータ分離

**目的:** 候補者として、自分の模擬面接セッションのみにアクセスでき、他の候補者のセッションは参照・操作できない。

#### 受け入れ条件

1. モック面接システムの全ページ・API Route は `requireCandidate()` による認証ガードを行い、未認証の場合は `/sign-in` にリダイレクトする。
2. モック面接システムは、`mock_interview.candidate_profile_id` が認証済み候補者の `candidate_profile.id` と一致するレコードのみを取得・更新する。
3. `/mock-interview/[sessionId]` および `/mock-interview/[sessionId]/result` にアクセスした際、セッションの所有者でない候補者には 404 を返す。
4. `/api/mock-interview/turns/next` および `/api/mock-interview/finalize` は、リクエストボディの `sessionId` が認証済み候補者の所有セッションであることをサーバー側で検証する。

### 要件 7: LLM コスト記録

**目的:** 運営として、各模擬面接セッションで発生した LLM コスト推定値が `mock_interview.metadata` に記録され、`admin-operations` が集計できる。

#### 受け入れ条件

1. モック面接システムは、`conductMockInterview` および `generateFormativeFeedback` の各 LLM 呼び出しごとにトークン使用量（入力・出力）を記録する。
2. モック面接システムは、セッション終了時に累計トークン数と推定コスト（USD）を `mock_interview.metadata.llm_cost_estimate` に JSONB として保存する。
3. `metadata` は `{ llm_cost_estimate: { input_tokens: number, output_tokens: number, estimated_usd: number } }` の形式とする。

### 要件 8: `mock_interview` テーブルスキーマとデータ整合性

**目的:** データベース管理者として、模擬面接データが整合性を保った状態で永続化され、候補者プロフィールと正しく関連付けられる。

#### 受け入れ条件

1. `mock_interview` テーブルは、`candidate_profile.id` への外部キー制約（`ON DELETE CASCADE`）を持つ `candidate_profile_id` カラムを持つ。
2. `mock_interview` テーブルは、`pattern_code`（テキスト）・`started_at`（タイムスタンプ）・`ended_at`（nullable タイムスタンプ）・`turn_count`（整数、デフォルト 0）・`formative_feedback`（JSONB nullable）・`metadata`（JSONB nullable）カラムを持つ。
3. モック面接システムは、Drizzle ORM の migration ファイルとして `mock_interview` テーブルの DDL を生成・適用する。
4. `packages/db/src/schema/mock-interview.ts` がスキーマの単一の真実として機能し、`packages/db/src/schema/index.ts` のバレルから re-export される。

### 要件 9: `packages/ai/mock/` LLM 関数仕様

**目的:** 開発者として、`packages/ai/mock/` の 2 LLM 関数が `packages/ai/interview/` とは別系統として独立し、`generateObject` + Zod スキーマで構造化出力を保証する。

#### 受け入れ条件

1. `conductMockInterview` 関数は `generateObject` + Zod スキーマを使用し、次の質問テキストと現在の深掘り段階（1-4）を構造化出力として返す。
2. `generateFormativeFeedback` 関数は `generateObject` + Zod スキーマを使用し、5 次元ごとの成長示唆テキストを構造化出力として返す。
3. 両関数は `packages/ai/interview/` のパターン・ルーブリック定義（`assessment_pattern` のカラム: `level_1_intro`〜`level_4_focus`、`ai_perspective`、`signals`）を入力として受け取り、パターン準拠の質問・フィードバックを生成する。
4. 両関数の LLM 出力は Zod スキーマで検証し、検証失敗時はセーフフォールバック値を返す。
5. `packages/ai/mock/` は `packages/ai/interview/` の関数を import せず、データ（パターン定義）のみを受け取る設計とする（関数間循環依存の回避）。

### 要件 10: テキストチャット UI

**目的:** 候補者として、`/mock-interview/[sessionId]` ページでテキストチャット形式の模擬面接 UI を操作できる。

#### 受け入れ条件

1. チャット画面は、AI の質問と候補者の回答を時系列で表示する会話ビューを持つ。
2. 候補者は、テキスト入力欄にテキストを入力して「送信」ボタンまたは Enter キーで回答を送信できる。
3. 「面接を終了する」ボタンが常に表示され、候補者がいつでもセッションを終了できる。
4. チャット画面の URL は `/mock-interview/[sessionId]` 形式とし、ページリロード時は `mock_interview` テーブルからセッション情報を復元して表示する（会話履歴はサーバー側から取得する）。
5. 模擬面接チャット UI は `'use client'` の Client Component として実装し、入力状態・会話履歴をローカル state で管理する。
