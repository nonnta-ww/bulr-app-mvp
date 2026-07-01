# 最近のEngineering方向性について

今の流れは、単なる **Prompt Engineering** から、AIエージェントを「安全に・再現性高く・業務に組み込んで動かす」ための周辺設計に広がっています。

ざっくり言うと、最近エンジニアに期待されるのは **“AIにうまく聞く人”ではなく、“AIが成果物を出せる環境・文脈・検証・運用ループを設計できる人”** です。

## まず押さえたい主要キーワード

| 用語                                     | 何を設計するか        | エンジニアに期待される力                            |
| -------------------------------------- | -------------- | --------------------------------------- |
| **Prompt Engineering**                 | AIへの指示         | 目的、制約、出力形式を明確に伝える力                      |
| **Context Engineering**                | AIに渡す前提情報      | 仕様、コード構造、設計思想、業務ルールを整理して渡す力             |
| **Harness Engineering**                | AIを動かす実行環境     | ツール、権限、ログ、テスト、検証、状態管理を組み込む力             |
| **Loop Engineering**                   | AIの反復プロセス      | 生成→実行→検証→修正のループを設計する力                   |
| **Eval Engineering**                   | AI成果物の評価       | 正解基準、テスト、ベンチマーク、品質評価を作る力                |
| **Workflow Engineering**               | 人間＋AIの業務フロー    | AIをどの工程に入れ、どこで人間が判断するか設計する力             |
| **Agent Engineering**                  | 自律的に動くAIエージェント | ツール呼び出し、状態保持、失敗回復、タスク分解を設計する力           |
| **Observability Engineering for AI**   | AIの挙動監視        | 失敗原因、ログ、トレース、コスト、品質劣化を追えるようにする力         |
| **Tool Engineering / MCP Engineering** | AIが使う道具        | API、社内ツール、DB、CLI、MCPサーバーなどをAIから使える形にする力 |
| **Specification Engineering**          | 機械が読める仕様       | 人間向け仕様書ではなく、AIが迷わず実行できる仕様を書く力           |

## 1. Prompt Engineering

これは従来の「AIにどう指示するか」です。

ただ、2026年現在は単体スキルとしての重要度は少し下がっていて、**Promptだけで何とかする時代から、Context / Harness / Eval とセットで考える時代**になっています。実際、最近の議論でも「Prompt = instructions、Context = knowledge、Harness = execution system」という整理がされています。([Medium][1])

エンジニアに期待されるのは、
「いい感じに書いて」ではなく、

```text
目的
前提
制約
禁止事項
出力形式
評価基準
失敗時の振る舞い
```

まで構造化して指示できることです。

## 2. Context Engineering

かなり重要です。
AIに「何を知った状態で作業させるか」を設計する能力です。

たとえば Claude Code / Cursor / Codex 系の開発では、AIにただ「この機能作って」と頼むのではなく、

```text
プロジェクト構成
設計方針
命名規則
テスト方法
使ってはいけないライブラリ
既存の実装パターン
DB設計
API仕様
運用上の制約
```

を適切に渡す必要があります。

OSS開発においても、AGENTS.md のようなAI向け設定ファイルが使われ始めており、AIエージェントにプロジェクト固有の文脈を渡す研究も出ています。そこでは、AIエージェントにも人間と同じように、アーキテクチャ、インターフェース、コーディング規約、ワークフロー、プロジェクトポリシーといった文脈が必要だとされています。([arXiv][2])

個人的には、これからのエンジニアは **「コードを書く人」＋「AIに渡す文脈を整備する人」** になると思います。

## 3. Harness Engineering

これはかなり新しめですが、実務では超重要です。
Harness は、AIエージェントを包む **実行基盤・作業環境・安全装置** みたいなものです。

具体的には、

```text
AIが使えるツール
ファイル編集権限
コマンド実行環境
テスト実行
ログ収集
状態管理
失敗時のリトライ
人間への確認ポイント
差分レビュー
セキュリティ制約
```

を設計します。

2026年の論文では、AI Harness Engineering を「モデル・ハーネス・環境のシステム」として捉え、タスク仕様、コンテキスト選択、ツールアクセス、プロジェクトメモリ、状態管理、観測性、失敗原因の特定、検証、権限、介入記録などを責務として整理しています。([arXiv][3])

つまり、AIの性能だけでなく、**AIが働く足場をどれだけちゃんと作るか** が成果を左右する、という考え方です。

## 4. Loop Engineering

これも今後かなり大事です。
AIに一発で正解を出させるのではなく、**試す→検証する→直す→また試す** というループを設計することです。

たとえば開発なら、

```text
要件を読む
実装する
テストを書く
テストを実行する
失敗ログを読む
修正する
再実行する
差分を説明する
レビュー待ちにする
```

この一連の流れをAIが回せるようにする。

最近の coding agent は、単発の補完ではなく、こうした反復的な agent loop を前提に動く方向へ進んでいます。Harness を自動改善する研究でも、観測、経験の蓄積、意思決定の検証を使った closed loop が提案されています。([arXiv][4])

ここで大事なのは、AIに「頑張って直して」ではなく、
**どの条件を満たしたら完了か**
**どの失敗なら戻るか**
**どこで人間に止めるか**
を決めることです。

## 5. Eval Engineering

個人的には、採用・育成でかなり重視すべきです。
AI時代のエンジニアには、作る力以上に **評価する力** が求められます。

たとえば、

```text
このAIの回答は正しいか
このコードは既存仕様を壊していないか
この自動修正は安全か
このエージェントは本番投入できる品質か
どのケースで失敗するか
```

を測る仕組みを作る力です。

LLM / AI Agent の運用では、評価と observability を組み合わせて、本番環境での失敗を避ける必要があるという実務向けの整理も出ています。([The JetBrains Blog][5])

従来のテストエンジニアリングに近いですが、AIの場合は出力が揺れるので、

```text
正確性
安全性
再現性
コスト
レイテンシ
根拠の妥当性
人間のレビュー負荷
失敗時の影響範囲
```

まで見る必要があります。

## 6. Workflow Engineering

これは非エンジニア領域にも近いですが、プロダクトエンジニアには必須になりそうです。

AIを導入するときに大事なのは、
「AIで何ができますか？」ではなく、
**「既存業務のどこにAIを入れると、品質を落とさず時間を短縮できるか」** です。

たとえば開発組織なら、

```text
仕様整理
設計レビュー
実装
テスト生成
コードレビュー
リファクタ
障害調査
ドキュメント更新
問い合わせ対応
```

のどこをAIに任せるか、どこは人間が見るかを設計する。

これは採用現場でも大事で、「AIツール使えます」よりも、**AIを使って開発プロセス全体をどう改善したか** を話せる人が強いです。

## 7. Agent Engineering

Agent Engineering は、AIが自分でタスクを分解し、ツールを使い、状態を持ち、失敗から回復する仕組みを作ることです。

普通のチャットAIではなく、

```text
GitHubを見る
Issueを読む
該当コードを探す
修正する
テストを走らせる
PR説明を書く
必要なら人間に確認する
```

みたいなことをするAIを作る・運用する能力です。

最近の文脈では、Agentic AI Engineer は「モデルを訓練する人」ではなく、モデルが次に何をするか判断し、ツールを呼び、状態を保持し、失敗から回復するシステムを作る人、という整理もされています。([Medium][6])

## 8. Observability Engineering for AI

AI時代の運用では、ログやメトリクスだけでは足りません。

必要なのは、

```text
AIが何を見たか
なぜその判断をしたか
どのツールを呼んだか
どのコンテキストを使ったか
どこで失敗したか
トークンコストはいくらか
品質がいつ劣化したか
```

を追えることです。

AI observability 系のスタートアップやツールも増えており、AI駆動のエンジニアリングチーム向けに、ログやデバッグ、リアルタイム監視を提供する動きが出ています。([Business Insider][7])

これからのSRE / Platform Engineer は、通常のアプリ監視に加えて、**AIの判断過程・コスト・失敗パターンの監視** も扱うことになりそうです。

## 9. Tool Engineering / MCP Engineering

地味ですが、かなり実務的に価値が高いです。

AIが本当に仕事をするには、社内のツールやデータにアクセスできる必要があります。
そのために、

```text
社内API
DB
検索基盤
ドキュメント
GitHub
Slack
Notion
Google Drive
CI/CD
管理画面
```

などを、AIが安全に使える形にする。

最近だと MCP、つまり Model Context Protocol 周辺の実装もこの領域です。
「AIに何を使わせるか」「どこまで権限を渡すか」「結果をどう検証するか」を設計する力ですね。

## 10. Specification Engineering

これも今後かなり来ると思います。

AIに作業させるには、人間がなんとなく読めば分かる仕様ではなく、**AIが誤解しにくい仕様** が必要です。

たとえば、

```text
曖昧な要求をなくす
入力・出力を明確にする
例外条件を書く
禁止事項を書く
受け入れ条件を書く
テスト可能な形にする
業務ルールを構造化する
```

という力です。

Context Engineering の発展形として、企業ポリシーや標準を機械可読な仕様コーパスにして、マルチエージェントが自律的に動けるようにする Specification Engineering という整理も出ています。([arXiv][8])

要するに、**仕様書を書く力が、AI時代にむしろ復権している** 感じです。

# 採用・育成で見るなら、この10個が重要

エンジニアに期待されるものとしてピックアップするなら、私はこう整理します。

| 優先度 | 領域                            | 見るべき能力               |
| --- | ----------------------------- | -------------------- |
| S   | **Context Engineering**       | AIに渡す前提情報を整備できる      |
| S   | **Eval Engineering**          | AIの成果物を評価・検証できる      |
| S   | **Workflow Engineering**      | AIを業務プロセスに組み込める      |
| A   | **Harness Engineering**       | AIが安全に作業できる実行環境を作れる  |
| A   | **Loop Engineering**          | 生成・検証・修正の反復を設計できる    |
| A   | **Agent Engineering**         | ツール利用型AIエージェントを設計できる |
| A   | **Tool / MCP Engineering**    | AIに社内ツールを安全に使わせられる   |
| B   | **Prompt Engineering**        | 明確な指示・制約・出力形式を作れる    |
| B   | **Observability Engineering** | AIの挙動・品質・コストを監視できる   |
| B   | **Specification Engineering** | AIが誤解しにくい仕様を作れる      |

# 実務で一番強い人材像

今後強いエンジニアは、たぶんこのタイプです。

> **AIに作業を丸投げする人ではなく、AIが迷わず作業できる文脈・道具・評価基準・改善ループを設計できる人。**

もう少し職務要件っぽく言うなら、

```text
AI coding agent や LLM を活用し、仕様整理・実装・テスト・レビュー・ドキュメント更新までの開発プロセスを設計・改善できる。
単なるプロンプト作成ではなく、Context Engineering、Eval Engineering、Workflow Engineering、Agent / Harness 設計を通じて、AI活用の再現性・品質・安全性を高められる。
```

です。

なので、採用面接で見るなら「Cursor使ってますか？」より、

```text
AIに渡すプロジェクトコンテキストをどう整えていますか？
AI生成コードの品質をどう評価していますか？
AIに任せてよい作業と、人間が見るべき作業をどう分けていますか？
AIが失敗したとき、原因をどう特定していますか？
チームでAI活用を再現可能にするために何を整備しましたか？
```

を聞いた方が、かなり本質に近いと思います。

[1]: https://medium.com/%40visrow/harness-engineering-vs-prompt-engineering-vs-context-engineering-explained-0423b692c87d?utm_source=chatgpt.com "Harness Engineering vs Prompt Engineering vs Context ..."
[2]: https://arxiv.org/abs/2510.21413?utm_source=chatgpt.com "Context Engineering for AI Agents in Open-Source Software"
[3]: https://arxiv.org/abs/2605.13357?utm_source=chatgpt.com "AI Harness Engineering: A Runtime Substrate for Foundation-Model Software Agents"
[4]: https://arxiv.org/abs/2604.25850?utm_source=chatgpt.com "Agentic Harness Engineering: Observability-Driven Automatic Evolution of Coding-Agent Harnesses"
[5]: https://blog.jetbrains.com/pycharm/2026/05/llm-evaluation-and-ai-observability-for-agent-monitoring/?utm_source=chatgpt.com "LLM Evaluation and AI Observability for Agent Monitoring"
[6]: https://medium.com/data-science-collective/the-agentic-ai-engineer-roadmap-for-2026-skills-stack-and-order-fc1dfa17948d?utm_source=chatgpt.com "The Agentic AI Engineer Roadmap for 2026: Skills, Stack ..."
[7]: https://www.businessinsider.com/pitch-deck-sazabi-ai-observability-8-million-y-combinator-2026-6?utm_source=chatgpt.com "See the pitch deck AI observability startup Sazabi used to raise $8 million seed round from YC and J2 Ventures"
[8]: https://arxiv.org/abs/2603.09619?utm_source=chatgpt.com "Context Engineering: From Prompts to Corporate Multi-Agent Architecture"



# Agentic Engineering

はい、**Agentic Engineering という言葉はあります**。
そして、あなたの理解している **「最終目標だけを与えて、自律的に完遂させるシステムの設計」** という捉え方はかなり近いです。

ただし、**Agent Engineering と完全に同義というより、Agent Engineering を含む上位概念** と見た方が自然です。

## ざっくり結論

| 用語                               | ニュアンス                                          |
| -------------------------------- | ---------------------------------------------- |
| **Agent Engineering**            | AIエージェント単体、またはエージェント機能を設計・実装すること               |
| **Agentic Engineering**          | エージェントが自律的に成果を出すための開発プロセス・環境・評価・人間の関与まで含めた設計思想 |
| **Agentic Software Engineering** | ソフトウェア開発全体を、AIエージェント前提で再設計する領域                 |

なので、

> Agent Engineering = エージェントを作る技術
> Agentic Engineering = エージェントが仕事を完遂できるように、仕事の進め方そのものを設計する技術

という感じです。

## Agentic Engineering は何を指すか

最近の使われ方では、**vibe coding の次の段階**として語られることが多いです。
Business Insider は、Andrej Karpathy が「agentic engineering」を新しい概念として紹介し、AIエージェントが自律的にコードを生成する方向性だと説明しています。IBMも、Karpathy が coined した語として、vibe coding との差分を説明しています。([Business Insider][1])

ただし、単に「AIが勝手にコードを書く」だけではありません。
LangChain は Agentic Engineering を、複数のAIエージェントがデジタルチームメンバーのように動き、それぞれ役割、共有メモリ、観測基盤を持ちながら、ソフトウェアのデリバリーパイプライン全体を進めるモデルと説明しています。([LangChain][2])

つまり、ポイントはこのあたりです。

```text
最終目標を与える
↓
エージェントが計画する
↓
必要なツールを使う
↓
コードを書く / 調査する / テストする
↓
失敗したら修正する
↓
証拠やログを残す
↓
人間にレビュー可能な成果物として出す
```

この一連の仕組みを設計するのが **Agentic Engineering** です。

## Agent Engineering との違い

**Agent Engineering** は、どちらかというとエージェントそのものを作る話です。

たとえば、

```text
LLMにどのツールを使わせるか
タスク分解をどうさせるか
メモリをどう持たせるか
Planner / Executor をどう分けるか
エージェント間通信をどうするか
失敗時にどうリトライさせるか
```

これは Agent Engineering です。

一方で **Agentic Engineering** は、もう少し広くて、

```text
そもそもどの業務をエージェント化するか
人間はどこで介入するか
仕様をどうAI向けに構造化するか
どの品質基準で合格にするか
ログ・監査・証跡をどう残すか
エージェントが安全に動ける環境をどう作るか
チームの開発フローをどう変えるか
```

まで含みます。

なので、前回の整理に当てはめるなら、**Agentic Engineering は以下を束ねる上位概念** です。

```text
Prompt Engineering
Context Engineering
Agent Engineering
Harness Engineering
Loop Engineering
Eval Engineering
Workflow Engineering
Observability Engineering
Tool / MCP Engineering
Specification Engineering
```

かなりラスボス感あります。名前が強い。

## 「最終目標だけを与えて完遂」は合っている？

方向性としては合っています。
ただ、実務的には **“最終目標だけ” では足りず、制約・文脈・評価基準・介入条件もセットで渡す** のが Agentic Engineering です。

たとえば悪い依頼はこれです。

```text
ユーザー登録機能を作って。
```

Agentic Engineering 的に良い依頼はこうです。

```text
目的：
ユーザーがメールアドレスとパスワードで登録できる機能を実装する。

制約：
既存の認証方式に合わせる。
DBスキーマは既存 users テーブルを優先する。
新しいライブラリは追加しない。
既存テストを壊さない。

完了条件：
登録成功時に確認メールを送る。
重複メールはエラーにする。
バリデーションテストを追加する。
既存の認証テストがすべて通る。
PR説明に変更点と確認方法を書く。

人間確認：
DBマイグレーションが必要な場合は実行前に確認する。
セキュリティ仕様に迷う場合は質問する。
```

つまり、Agentic Engineering の本質は、

> **AIに自由にやらせることではなく、AIが自律的に動いても破綻しない作業環境を作ること**

です。

## 近い言葉との関係

| 用語                               | 関係                                  |
| -------------------------------- | ----------------------------------- |
| **Agentic AI**                   | 自律的に目標達成するAIシステムそのもの                |
| **AI Agent**                     | タスクを実行する個々の主体                       |
| **Agent Engineering**            | そのエージェントを設計・実装する技術                  |
| **Agentic Engineering**          | エージェント前提で開発・業務遂行を設計する実践             |
| **Agentic Software Engineering** | ソフトウェア開発領域に特化した Agentic Engineering |

MIT Sloan は Agentic AI を、複数の異なるエージェントが協調してタスクを進めるシステムとして説明しており、IBMも Agentic AI を「限定的な監督で特定の目標を達成できるAIシステム」と説明しています。([MIT Sloan][3])

この **Agentic AI を実務・開発プロセスに落とし込む設計行為** が、Agentic Engineering と考えると分かりやすいです。

## 採用要件に入れるならこう言うとよさそう

「Agentic Engineering」という言葉をそのまま使うなら、少し定義を添えた方がいいです。まだ用語として完全に標準化されているわけではなく、人によって範囲がブレます。

職務要件なら、例えばこうです。

```text
AI coding agent / LLM agent を活用し、最終目標・制約・文脈・評価基準を与えたうえで、調査、設計、実装、テスト、レビュー準備までを自律的に進められる開発環境・ワークフローを設計できること。

単なる Prompt Engineering ではなく、Context Engineering、Agent Engineering、Harness Engineering、Eval Engineering、Observability を含む Agentic Engineering の実践経験を重視する。
```

面接質問なら、こう聞くとかなり見えます。

```text
AIエージェントにどこまで自律実行させていますか？
エージェントに渡すコンテキストはどう整備していますか？
エージェントが失敗したとき、原因をどう特定しますか？
AI生成コードの受け入れ基準はどう設計していますか？
人間が介入すべきポイントをどう決めていますか？
```

## 私ならこう整理します

**Agent Engineering** は技術領域。
**Agentic Engineering** は開発・業務遂行のパラダイム。

なので、前回の一覧に追加するなら、こうです。

| 領域                               | 位置づけ                          |
| -------------------------------- | ----------------------------- |
| **Agent Engineering**            | エージェント単体・マルチエージェントの設計         |
| **Agentic Engineering**          | エージェントを使って仕事を自律遂行させるための全体設計   |
| **Agentic Software Engineering** | ソフトウェア開発工程全体をエージェント前提で再構築すること |

一言でまとめるなら、

> **Agentic Engineering は、Agent Engineering を含みつつ、Context、Harness、Loop、Eval、Workflow までまとめて設計する“AI時代の実務エンジニアリング”です。**

です。

[1]: https://www.businessinsider.com/agentic-engineering-andrej-karpathy-vibe-coding-2026-2?utm_source=chatgpt.com "The guy who coined 'vibe-coding' says the next big thing is 'agentic engineering'"
[2]: https://www.langchain.com/blog/agentic-engineering-redefining-software-engineering?utm_source=chatgpt.com "How Swarms of AI Agents Are Redefining Software ..."
[3]: https://mitsloan.mit.edu/ideas-made-to-matter/agentic-ai-explained?utm_source=chatgpt.com "Agentic AI, explained"
