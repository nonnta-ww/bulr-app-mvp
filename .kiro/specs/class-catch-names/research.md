# Research Log — class-catch-names

## Discovery Scope

- 分類: **Extension / Simple Addition**（既存 RPGクラス診断への表示・純関数追加。スキーマ変更・外部依存・マイグレーションなし）
- ディスカバリ手法: 軽量（コードベース統合点の確認のみ。外部リサーチ不要）

## Key Findings（コードベース統合点）

1. **契約型は既に十分**（`packages/types`）:
   - `ClassResult.primaryVocation: Vocation`（7値 union）、`temperament: TemperamentSummary | null`、`className: string`。
   - `TemperamentSummary.completeness: 'none'|'partial'|'full'`、`code: TemperamentCode | null`、`poles: Partial<Record<TemperamentAxis, TemperamentPole>>`。
   - `TemperamentCode = '${ExplorationPole}-${SocialPole}-${ProcessPole}-${RiskPole}'`。`ExplorationPole='explorer'|'deepener'`, `SocialPole='solo'|'collab'`。
   - → キャッチ名は既存フィールドのみから導出でき、**型追加もマイグレーションも不要**。

2. **象限（4）は先頭2軸から cast なしで取得可能**:
   - `temperament.completeness==='full'` のとき `poles.explorationDeepening` と `poles.soloCollaboration` は必ず determined。
   - リテラル絞り込み（`e==='explorer'||e==='deepener'` 等）で `TemperamentQuadrant = '${ExplorationPole}-${SocialPole}'`（4値）へ安全に写像。`any`／unsafe cast 不要。

3. **表示の反映先は2箇所のみ**:
   - `class-card.tsx` の `h2`（現在 `result.className` をヒーロー表示, L110）。
   - `share-panel.tsx` の純関数 `toShareText`（現在 `result.className` を先頭行に使用, L37-47）。
   - standalone `playstyle-diagnosis/page.tsx` は職掌を持たないため無影響。

4. **既存命名資産との衝突リスク**:
   - 気質16型アーキタイプ異名（`_lib/temperament/archetypes.ts` の `name`）は探索/クエスト語彙（地図職人・開拓者・放浪者・冒険者・水先案内人・遠征隊長…）。
   - キャッチ名は**軍事/ドメイン語彙**（剣士・魔導士・守護者・賢者・軍師・遊撃手・研ぎ師・門番…）に統一し、`隊長`など既存異名と被る語を避けることで、ヒーロー＋副題の同時表示でも冗長化しない。

## Design Decisions

- **導出方式は「表示時算出（derive-at-render）」を採用**（persist しない）:
  - Pros: 型変更・マイグレーション・バックフィル不要、authoring 編集が再診断なしで即反映、既存レコードも自動適用。
  - Cons: business/Phase2 が使うには同じ純関数を再利用する必要（今回スコープ外なので許容）。
  - 却下案: `ClassResult` に `catchName` を persist → 型変更＋旧レコードのフォールバック実装が必要になり YAGNI に反する。

- **命名粒度は Option 3 完全個別（7×4=28 + 職掌単独7）**。ブレストでテンプレート基調（Option 1/2）ではなく完全個別を選択。

- **配置は app-local**（`apps/candidate/app/class-diagnosis/_lib/catch-name.ts`）。`app → @bulr/types` の単方向依存のみ。`definitions.ts`（職掌/称号マスタ）と同じ層に、命名テーブルと純関数を新設。

## 性別中立の判断（Option A 採用）

- 懸念: 軍事語彙が男性像に偏り、女性・ノンバイナリのユーザーが自分事にしにくい可能性。
- 事実確認: candidate profile に**性別属性は存在しない**（`grep -niE 'gender|性別|sex'` でヒットなし）。既存の気質16型異名も中立語（地図職人・開拓者…）で、プロダクト既定トーンは中立。
- **却下: 性別バリアント（2セット出し分け）**。理由: 採用/スキル系プロダクトで性別 PII を新規収集し、それで出力を変えることは差別の観点でリスクが高い。命名の倍増・データ依存も発生。
- **採用: 性別中立の単一セット（Option A）**。日本語職業名詞は大半が文法的に中立。男性像に強く寄る武将系語のみ中立語へ置換:
  - 一番槍→急先鋒 / 守将→守り手 / 将→指揮官 / 総帥→采配者 / 総大将→盟主（置換は指揮(EM)に集中）。
  - `騎士` は日本語RPGで中立として許容。
- 要件へ反映: R6.4（性別中立・単一セット）、R6.5（性別属性を使用/収集しない）。

## Risks

- **命名品質のブレ**: 35名を統一トーンで維持する必要。→ テーブルを1ファイルに集約し、レビュー/差し替えを容易にする。`Record` 型でキー網羅をコンパイル時保証。
- **象限の粗さ**: 計画/即興・堅実/挑戦の2軸はキャッチ名に出ない（副題の16型異名でカバー）。合意済みの意図的トレードオフ。
