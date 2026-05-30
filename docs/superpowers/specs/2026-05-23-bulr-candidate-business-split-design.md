# bulr 全体構成の再設計（候補者 / 企業 / 運営の3アプリ化）— 構想メモ

> **ステータス**: ブレインストーミング進行中（2026-05-23 時点 / 設計メモ ほぼ確定・ユーザーレビュー待ち）
> **目的**: 候補者向け bulr と企業向け bulr business を別サイト（別ドメイン）に分割する全体再設計と、候補者側プロダクトの再定義を記録する。
> **後続フロー**: 本メモ確定 → steering 更新（`product.md` / `structure.md` / `tech.md` / `roadmap.md` / `01-architecture-*.md`）→ Kiro spec 化（`/kiro-steering` → `/kiro-spec-batch` ほか）
> **関連**: `docs/bulr-product-direction.md` / `docs/bulr-prd-year1.md` / `docs/01-architecture-full.md` / `docs/backend-skills.csv`

---

## 1. 背景 — 2つの「再設計」

今回の再設計は、性質の異なる2つの変更を含む。

1. **アプリ／ドメイン分割** — 現状 `apps/web` 1つに同居する面接官UI・管理画面を、候補者向け（bulr）・企業向け（bulr business）・運営の **3アプリ（別ドメイン）** に分割する。`01-architecture-full.md` の3アプリ構成（bulr.net / bz.bulr.net / admin.bulr.net）と方向性は一致。今回 MVP で作った `apps/web` は「bulr business」側に相当する。

2. **候補者向けプロダクトの再定義** — 既存ドキュメントとの差分。従来 `bulr.net`（候補者向け）は「候補者が LLM と直接対話する問診」かつ Stage 3 送りだった。`bulr-prd-year1.md` は「候補者は bulr を直接使わない」と明言しつつ機能5「事前問診（候補者向け）」を持ち、揺れがあった。今回、候補者側を「履歴書＋スキルアンケートでエントリーし、さらに自己診断・模擬面接で単独の価値を持つ第一級プロダクト」へ格上げする。

## 2. 確定した方針（決定事項）

| 論点 | 決定 |
|---|---|
| スキルアンケートの形式 | 静的な構造化フォーム（選択式中心＋一部記述）。`backend-skills.csv` を素材。LLM 不要 |
| コードベース戦略 | 既存モノレポ（`bulr-app-mvp`）を拡張。候補者側を含め全体がまだ MVP という認識。売れると判断した時点でアーキテクチャ全体を再見直してリリースへ |
| 直近の優先領域 | アプリ分割・基盤整備（apps 分割＋ドメイン分離＋共有 packages 整備） |
| エントリーモデル | 案B：「募集（opening）」エンティティ軸 ＋ 当面は招待制運用 ＋ 候補者所有プロフィール |
| 設計方針 | 「将来像は見据えるが、実装は最小に留める」。本格的なマルチテナント／本番スケール対応は後回し |

## 3. 収益モデルの方針

- **コア収益**: ① BtoB SaaS（面接アシスタントの席数課金）→ ② BtoB スカウト課金（候補者プールへのアクセス課金）。
- **エージェント成功報酬（仲介手数料）はコアから外す** — bulr のコアの堀は「中立で信頼できる測定レイヤー」であること。成功報酬は評価に「通したい」インセンティブを乗せ、評価の信頼性＝商品価値を毀損する。有料職業紹介の許可・エージェント業界との競合も負担。
- **C（候補者）直接課金は賭けない** — 採用領域は「企業が払い、候補者は無料」が構造的慣行。プール形成期は無料であること自体が前提条件。
- **「BtoCtoB」の正しい形 = BtoB スカウト型** — 候補者には無料提供（だから集まる）、企業がプール検索・スカウトに課金。成果ではなくアクセスに課金するため中立性の毀損が小さい（届出型、要法務確認）。bulr の強み: Findy/LAPRAS が「何を作ったか（アウトプット）」を測るのに対し、bulr は「何を判断してきたか＋面接エビデンス」を持ち、アウトプットの無い実力者にリーチできる。
- **データ販売**（スキル市場のマクロデータ）はエージェント化せずプールを換金する経路として可。
- **マッチング**は「双方の適合を提示し、アクションは当事者が行う（アクセス課金）」に留める。「紹介＋仲介手数料」には踏み込まない。

## 4. アプリ／ドメイン構成

利用者は3タイプ（候補者 / 企業ユーザー / 運営スタッフ）。アプリも **3つ** に分割する。

| アプリ | ドメイン | 利用者 | 役割 |
|---|---|---|---|
| `apps/candidate` | `bulr.net` | 候補者 | 履歴書・職務経歴書・CV・レジュメ登録、スキルアンケート、自己診断、模擬面接、エントリー、エントリー状況確認 |
| `apps/business` | `bz.bulr.net` | 企業ユーザー | 現 `apps/web` を継承。募集管理・招待発行・エントリー一覧・面接セッション作成・面接アシスタント（状態A/B）・面接後レポート |
| `apps/admin` | `admin.bulr.net` | 運営スタッフ | サービス運営。検証パネル・企業管理・候補者管理・マスタCMS・コスト監視（`ADMIN_ALLOWED_EMAILS` ゲート） |

**運営 admin を独立アプリにする理由**: 再設計後、運営の操作対象は候補者側データ（`candidate_profile`・`skill_survey`・`mock_interview`）と企業側データの両方にまたがり、プラットフォーム全体を運用する性質に変わる。これを `apps/business` に同居させると、企業向けアプリのコードが候補者ドメインに手を伸ばし、2アプリの境界が崩れる。さらに admin は全データへ god-mode アクセスを持つため、企業向けアプリと同一デプロイに同居させると攻撃面が広がる。`apps/admin` は `packages/db`（全データの単一の真実）経由で両側を読み書きし、どちらのユーザー向けアプリも横断しない。

- 現 `apps/web` を `apps/business` にリネーム（中身は面接官UIなので名称を実体に合わせる）。
- `apps/admin` は Wave 1 で「シェル（動く最小の枠組み）＋既存検証パネルの移設」のみ。機能拡張は後続 Wave（Q3「最小に留める」と両立。いま分割手術中にシェルだけ置くことで、後の引き剥がし移行コストを回避）。
- ローカル: `:3000` candidate / `:3001` business / `:3002` admin。Vercel は3プロジェクト（同一リポジトリ参照・Root Directory 違い）。

## 5. モノレポ構造

現状の `apps/web` ＋ `packages/{db,types,lib,ai}` を、次の形に拡張する。

```
bulr-app-mvp/
├── apps/
│   ├── candidate/        bulr.net        候補者向け（★新規）
│   ├── business/         bz.bulr.net     企業向け（旧 apps/web をリネーム）
│   └── admin/            admin.bulr.net  運営向け（★新規・Wave1はシェル＋検証パネル移設）
├── packages/
│   ├── db/               DBスキーマの単一の真実（新エンティティ追加）
│   ├── auth/             ★切り出し：Better Auth 設定（全アプリ共有）
│   ├── ui/               ★切り出し：共通UIコンポーネント
│   ├── types/            共通型
│   ├── lib/              共通ユーティリティ
│   └── ai/               LLM関数（対象者別に再編）
├── scripts/              シード（57パターン＋skill_survey）
├── pnpm-workspace.yaml / turbo.json   ← 3アプリ対応に更新
```

**`apps/candidate`（bulr.net）:**
```
app/
├── (marketing)/      候補者向けLP
├── sign-in/          Magic Link サインイン
├── onboarding/       招待リンク受け取り → プロフィール初期化
├── profile/          candidate_profile 編集
├── resume/           履歴書・職務経歴書・CV・レジュメ 登録・管理
├── skill-survey/     スキルアンケート（静的構造化フォーム）＋ L1 棚卸し結果
├── mock-interview/   L4 模擬面接（テキストチャット）
├── entries/          エントリー一覧・状況確認
└── api/{auth, mock-interview, ...}
```

**`apps/business`（bz.bulr.net）** — 旧 `apps/web` を継承し、募集・招待・エントリーを追加:
```
app/
├── (interviewer)/{interviews,    既存：面接セッション
│                  openings,      ★新規：募集管理
│                  invitations,   ★新規：招待発行
│                  entries}       ★新規：エントリー一覧（履歴書＋アンケート確認）
└── api/{interview, auth, ...}
```

**`apps/admin`（admin.bulr.net）:**
```
app/
├── sign-in/
├── sessions/      既存：検証パネル（apps/business から移設）
├── companies/     企業管理（later）
├── candidates/    候補者管理（later）
├── masters/       skill_survey / assessment_pattern CMS（later）
└── monitoring/    LLMコスト・クォータ（later）
```

**`packages/ai` を対象者別に再編:**
```
packages/ai/src/
├── shared/      パターン・ルーブリック・プロンプト基盤（共有）
├── interview/   業務側：既存5関数（analyzeTurn 他）
└── mock/        ★新規：候補者向け模擬面接関数（面接官役＋形成的フィードバック）
```

`packages/i18n` は作らない（日本語のみ継続）。

## 6. データモデル

```
user (Better Auth)
 ├── candidate_profile (1:1) ── 候補者として ★候補者所有
 │     ├── resume_document (1:N)        履歴書/職務経歴書/CV/レジュメ（Vercel Blob）
 │     ├── skill_survey_response (1:N)  スキルアンケート回答
 │     ├── mock_interview (1:N)         AI模擬面接の記録（L4）
 │     └── entry (1:N)                  エントリー記録
 └── user_profile (1:1) ── 企業ユーザーとして
       └── company (N:1)

company ★新規（最小エンティティ。RBAC はまだ作らない）
 └── opening (1:N)  募集（MVP はプライベート＝招待リンク限定）
       ├── invitation (1:N)  招待リンク（トークン）
       └── entry (1:N)

entry ★新規（candidate_profile × opening のリンク記録。提出時点の resume/survey スナップショット参照＋ステータス）
 └── interview_session (1:N)
       ├── question_proposal / interview_turn / pattern_coverage / session_report  ← 既存そのまま

skill_survey ★新規マスタ（職種別・カテゴリ/サブカテゴリ/設問/選択肢）← backend-skills.csv シード
assessment_pattern  ← 既存マスタ（57パターン）
```

主な変化:
- 現 `candidate`（面接官が手入力する受動的マスタ）→ `candidate_profile`（候補者自身が所有・入力）に発展。
- `interview_session` は `candidate_id` ではなく `entry_id` を持ち、候補者情報・履歴書・アンケート回答を entry 経由で引き継ぐ。
- `interview_turn` / `pattern_coverage` / `session_report` は無変更（既存 assessment-engine そのまま）。

## 7. 認証

- Better Auth Magic Link（パスワードレス）を3タイプとも継続。
- `packages/auth` を切り出し（Stage 2 予定だったが、アプリ分割で必須化）。Better Auth 設定の単一の真実。
- `user` テーブルは Better Auth 管理を1つ共有。`candidate_profile` / `user_profile` のどちらが紐づくかで役割判別。各アプリの認証ガードで、候補者は `bulr.net`・企業ユーザーは `bz.bulr.net`・運営は `admin.bulr.net` のみ通す。
- 運営 admin は `ADMIN_ALLOWED_EMAILS` の許可メール検査を継続。
- SSO・クロスドメイン cookie 共有はしない（各タイプは別人格）。cookie は各ドメインにスコープ。
- 招待リンク（`invitation` トークン）→ 候補者 Magic Link サインイン → `entry` 作成、というオンボーディング動線。

## 8. エンド・ツー・エンドのフロー

```
【企業側 bz.bulr.net】
 1. 企業ユーザーが募集(opening)を作成
 2. 招待リンクを発行 → 候補者へ共有（メール等）

【候補者側 bulr.net】
 3. 候補者が招待リンクからサインイン（Magic Link）
 4. 履歴書・職務経歴書・CV・レジュメをアップロード（初回のみ。以降は再利用）
 5. スキルアンケート（静的構造化フォーム）に回答
 6. 募集へエントリー（= entry 作成、resume/survey スナップショット参照）

【企業側 bz.bulr.net】
 7. エントリー一覧で候補者の履歴書＋スキルアンケート結果を確認
 8. エントリーから面接セッションを作成
    - 候補者情報は entry から自動引き継ぎ（手入力を廃止）
    - スキルアンケート結果を基に深掘りパターンを選定（PRD 機能5「事前問診→パターン選択」の接続点）
 9. 面接アシスタント（状態A/B）で面接 ← 既存 assessment-engine そのまま
10. 面接後レポート ← 既存そのまま
```

※ 候補者は招待が無くても直接サインインし、L1（棚卸し）・L4（模擬面接）を単独で利用できる。エントリーやプールへの掲載はオプトイン。

ポイント: 既存の面接エンジンはほぼ無改修。変わるのは「セッション作成の入口」だけで、スキルアンケートが事前問診としてパターン選定に接続する。

## 9. 候補者側プロダクト — single-player hook

両面マーケットの cold-start を、候補者単独で価値が出る "single-player mode" で割る。候補者側機能を4層に仕分けた。

### L1. 棚卸し（自己診断）— ✅ 候補者MVP

職種別スキルアンケートを「エントリー前に、自分のために」受け、構造化されたスキル像が返る。素材（アンケート）は既存資産で追加コストはほぼゼロ。「書類では伝わらない実力を本人にすら見えるようにする」— ミッションのど真ん中。低リスク。scout 用プロフィールの素材も兼ねる。

### L2. AIキャリア相談（成長アドバイス）— L4 に吸収

アンケート結果をもとに「自分はどうすればいいか」を LLM が助言。`01-architecture-full.md` の候補者レポート構想（自己理解＋成長ガイド）と整合。ただし独立機能としては薄く、大半を L4 の事後フィードバックに吸収する。助言に留め、約束（「これをやれば受かる/上がる」）には踏み込ませない。

### L3. 年収査定・年収アッププラン — ⚠️ 保留

「裏付けの取れた信頼できる年収」を bulr が出せる唯一の方法は bulr 自身のデータ（実務判断力プロファイル × 実際の着地役割・年収レンジ）。これは BtoB 面接エンジンが回って初めて貯まる。いま並行で作るとデータが無く、他社同様の浅い市場統計ベースになり、望む版の劣化コピーにしかならない。**bulr 自身がデータを持つまで保留**。
※ `01-architecture-full.md` の候補者レポートは「数値スコア・年収・他者比較を出さない」と明記。年収査定はこれと矛盾するため、採用時は方針を意識的に再決定する。
※ 「年収を上げる→転職→紹介」はエージェント成功報酬モデルへの導線になりがち。中立性の線に注意。

### L4. AI 模擬面接 — ✅ 候補者MVP・engagement hook の本命

エンジニアは概して面接が苦手。bulr の `57 状況パターン × 4段階深掘り（経験有無→真贋→判断力→メタ認知）× 5次元ルーブリック` を活かした、エンジニア特化の模擬面接。汎用 ChatGPT 模擬面接を本当に超えられる差別化ネタ。コア資産（`packages/ai` の問診ロジック・`assessment_pattern`・ルーブリック）の再利用率が高い。

**重要な戦略的気づき** — これは `product-direction.md` で Stage 3 送りにした「選択肢A：候補者直接対話型」そのもの。だが Stage 3 送りの理由3つ（対話品質リスク／検証データの質／市場の AI 評価受容）は、すべて「AI対話を"採用評価"に使うときの懸念」。模擬面接（練習）では stakes が無く、候補者は上達目的で本気、誰も評価されない — 3つの懸念が無効化される。模擬面接は「選択肢A」を安全に前倒しし、将来の Stage 3（候補者直接評価）を de-risk する道。

flywheel:
- 模擬面接は 57 パターンとプロンプトの無料・大量テスト場。PRD 仮説1・2（問診パターンの妥当性検証）が候補者トラフィックで加速する。
- 練習した候補者は本番面接でちゃんと話せる → bulr business が受け取る面接データがクリーンになる（候補者側プロダクトが BtoB プロダクトの入力品質を上げる）。

**譲れない設計原則**: 出力が目に見えて「bulr 仕様」であること（57 パターン準拠の質問、4段階で深掘りしてくる挙動、bulr の語彙で返るフィードバック）。汎用の褒めるだけ面接 AI なら作る意味がない。

### 候補者MVP の結論

**候補者MVP = L1（棚卸し）＋ L4（模擬面接）**。L4 を engagement hook の本命に、L1 を scout 用プロフィール素材に据える。L2 は L4 に吸収、L3 は保留。

### 候補者側の設計判断

- 模擬面接は当面**テキストチャット先行**（LLM/Whisper コスト安・摩擦小・速い）。音声は fast-follow（bulr business の MediaRecorder＋Whisper 配管を再利用できる）。
- 無料模擬面接はコストが青天井になり得る → 月 N 回などの **LLM クォータが必須**。
- 模擬面接は候補者が対価を払ってもよい数少ない機能（有料の面接対策・コーチングは現に存在する）。当面は集客のため無料。将来の候補者側プレミアム候補（年収より健全な C課金の経路）。
- L1 の自己診断は「ツールを使う」≠「マーケットに載る」を分離（候補者所有プロフィール＋オプトインで discoverable）。無料で棚卸しだけしたい人も安心して使え、載せたい人だけプールに入る。

## 10. データオーナーシップの変更（steering 要更新）

現 steering は「データオーナー＝企業側」一本。新モデルは2層になる。

- **候補者プロフィール・履歴書・スキルアンケート回答・模擬面接データ ＝ 候補者所有**（再利用可能なポータブル資産）。
- **エントリー・面接セッション・本番面接データ ＝ 企業側**（従来どおり）。
- `entry` が両者の境界。候補者はプロフィールを更新でき、entry は提出時点のスナップショットを参照する。

## 11. ロードマップ／spec 分解

Kiro の spec 単位に分解し、依存関係の波（Wave）で並べる。**直近の優先＝ Wave 1（基盤分割）**。各 spec は `/kiro-spec-*` フローに乗せる。

### Wave 0（前提）— steering 更新

新アーキは現 steering（単一アプリ前提）と食い違うため、spec 生成の前に steering を更新する。本構想メモを基に `product.md`（収益モデル・データオーナーシップ）/ `structure.md`（3アプリ構成）/ `tech.md` / `roadmap.md` / `01-architecture-*.md` を整合。→ `/kiro-steering` 相当。

### Wave 1 — 基盤分割 ★直近着手

| spec | 内容 | ゴール |
|---|---|---|
| `monorepo-app-split` | `apps/web`→`apps/business` リネーム、`apps/candidate` スケルトン作成、`apps/admin` シェル作成＋既存 `admin/` 検証パネルの移設、`packages/auth`＋`packages/ui` 切り出し、turbo/pnpm 設定 | 3アプリが build/typecheck/lint 通過 |
| `multi-app-deployment` | Vercel 3プロジェクト化、ドメイン（bulr.net / bz.bulr.net / admin.bulr.net）、.env 分割、Preview 自動デプロイ | 3アプリが各ドメインでデプロイ |

### Wave 2 — 候補者プロダクト基盤（Wave 1 完了後）

| spec | 内容 |
|---|---|
| `candidate-auth-onboarding` | 候補者 Magic Link、`candidate_profile` テーブル、招待リンク受け取り動線 |
| `resume-registration` | `resume_document` テーブル、履歴書・職務経歴書・CV・レジュメのアップロード・管理（Vercel Blob） |
| `skill-survey` | `skill_survey` マスタ（職種別・`backend-skills.csv` シード）＋`skill_survey_response`＋静的フォームUI＋L1棚卸し結果 |

### Wave 3 — エントリー連携（Wave 2 完了後）

| spec | 内容 |
|---|---|
| `company-and-opening` | `company` エンティティ、`opening`（募集）、`invitation` 発行（企業側UI） |
| `entry-flow` | `entry` エンティティ、候補者のエントリー完了、企業側エントリー一覧 |
| `session-from-entry` | 面接セッション作成を `entry` から引き継ぐよう assessment-engine を改修（候補者情報手入力を廃止）＋アンケート結果からのパターン選定支援 |

### Wave 4 — 候補者 engagement hook ＋ 運営機能（Wave 2／3 完了後）

| spec | 内容 |
|---|---|
| `mock-interview` | L4。`mock_interview` テーブル、`packages/ai/mock` の候補者向け関数、テキストチャットUI、LLMクォータ |
| `admin-operations` | `apps/admin` の機能拡張：企業管理・候補者管理・マスタCMS（skill_survey / assessment_pattern）・LLMコスト監視 |

### Wave 5+ — Later（保留／将来）

スカウト層（プール検索＋企業のスカウト課金）／L3 年収（bulr 自身のデータ蓄積後）／マッチング／模擬面接の音声対応／マルチテナント本格化。

### 依存と順序の補足

- Wave 3 と Wave 4 はどちらも Wave 2 のみに依存するので並列可能。推奨順は **Wave 3（エントリー連携）→ Wave 4（模擬面接ほか）**。理由：エントリー連携が3アプリの中核ループ（候補者がエントリー→企業が面接）を完成させ、北極星（BtoB Net Active Interviews）に直結するため。模擬面接は候補者プール獲得の hook で、ループが回ってから効いてくる。
- ただしこれは優先順位の選択。候補者集客を先に立ち上げたいなら Wave 3 と 4 を入れ替え可能。
- マスタ（`skill_survey` / `assessment_pattern`）は `admin-operations` の CMS を待たず、当面シードスクリプトで投入できる（`assessment-pattern-seed` と同じ手法）。Wave 2/3 が admin UI を待つ必要はない。
- 注意すべき seam: `session-from-entry` は既存 assessment-engine を改修、`candidate-auth-onboarding` は既存 authentication の成果を拡張、`packages/auth` 切り出しは Wave 1 で全 spec の前提を作る。

## 12. アーキテクチャへの影響まとめ

- エントリーモデル B により、求人ボード化・スカウト・複数社エントリーは作り直しなしで後付け可能。
- 候補者アプリは LLM アプリになる（当初の「候補者側は LLM 不要」から変更）。`packages/ai` に候補者向け関数セット（面接官役を演じる＋形成的フィードバック）が増える。パターン／ルーブリックの知識は共有、関数セットは対象者ごとに分離。
- `packages/auth` `packages/ui` をモノレポから切り出し（structure.md の「2アプリ以上で参照する瞬間」が到来）。
- 運営 admin を独立アプリ（`apps/admin`）化。Wave 1 でシェル＋既存パネル移設、機能拡張は Wave 4。

## 13. 未決事項 / TODO

- [ ] 本設計メモのユーザーレビュー
- [ ] steering 更新（`product.md` 収益モデル・データオーナーシップ、`structure.md` 3アプリ構成、`tech.md`、`roadmap.md`、`01-architecture-*.md`）→ `/kiro-steering`
- [ ] 各 Wave の Kiro spec 化 → `/kiro-spec-batch` ほか
- [ ] 模擬面接の音声 vs テキスト（テキスト先行を推奨、未確定）
- [ ] LLM コストクォータの具体設計（模擬面接の月次上限など）

## 付録: 検討した代替案

**エントリーモデル**

- 案A 招待制エントリー（最小）— 候補者プロフィールが企業に紐づき再利用しにくい。将来の拡張で作り直しが発生。却下。
- 案C 求人ボード型（フル）— スコープ過大。求人検索・応募管理をいま作る必要があり、Findy/HERP と競合（PRD が「やらない」とした大規模ソーシング）。却下。
- → 案B 採用（募集エンティティ軸＋招待制運用＋候補者所有プロフィール）。実装コストは A とほぼ同等で、求人ボード・スカウト・複数社エントリーへ作り直しなしで拡張できる。

**収益モデル**

- C 直接課金 — 採用慣行（企業が払う）・プール形成期の無料前提により、コア収益としては却下。
- エージェント成功報酬 — 中立性の毀損・有料職業紹介の許可・エージェント業界との競合により、コアから除外。

**運営 admin の配置**

- embedded（`apps/business/admin` 同居）— 再設計後の admin は候補者側データも操作するため、企業向けアプリが候補者ドメインに越境し境界が崩れる。攻撃面も拡大。却下。
- → 独立アプリ `apps/admin` 採用。Wave 1 はシェル＋既存パネル移設のみ、機能拡張は段階的。
