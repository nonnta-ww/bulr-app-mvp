# Research Log — diagnosis-archetypes

## Discovery Scope

- 分類: **Extension（既存 RPGクラス診断への提示層＋導出層の追加）**。survey/スコアリング engine は再利用、スキーマ変更なし。
- 手法: 軽量（統合点の確認・既存パターン踏襲）。外部リサーチ不要。

## Key Findings（統合点）

1. **導出入力は既存 `ClassResult` に揃っている**:
   - `vocationVector: Record<Vocation, number>`（7職掌の 0..100・全キー常在）、`temperament: TemperamentSummary | null`（`poles: Partial<Record<TemperamentAxis, TemperamentPole>>`, `code`, `completeness`）、`title`（称号）、`confidence: 'low'|'normal'`。
   - → アーキタイプは表示時に導出でき、型追加もマイグレーションも不要（R9）。

2. **重みテーブル方式が既存にある**: `definitions.ts` の `CATEGORY_AFFINITY`（`Record<string, Partial<Record<Vocation, number>>>`）＋ resolver が確立済み。アーキタイプ signature も同じ「重みベクトル＋決定論的解決」パターンで実装でき、コードベースと整合。

3. **提示の反映先は既存2箇所**: `class-card.tsx`（h2 ヒーロー）と `share-panel.tsx`（`toShareText`）。`class-catch-names` の設計（ヒーロー刷新＋className 副題化＋toShareText 先頭差し替え）をそのまま拡張。

4. **一部アーキタイプは現行データで届かない**（R3 の段階導入）:
   - sage / strategist 職掌は survey 未整備 → `vocationVector` の該当値がほぼ 0 → Researcher / Strategist は当面勝ちにくい。
   - 改善/障害対応/育成/調整/新技術の「志向」信号は現4気質軸に無い → Optimizer / Firefighter / Mentor / Integrator は当面判別が弱い。
   - → signature を「利用可能な信号のみで加点」する設計にすれば、未充足タイプは自然に選ばれにくく、survey 追加で開放される（graceful degradation）。

## Design Decisions

- **導出 = signature best-match（argmax）**。各アーキタイプに (vocation 重み × pole 重み × disposition 重み) の signature を持たせ、本人スコアとの内積で最大のものを主アーキタイプに。tiebreak は 12タイプの固定表示順。常に非空（R2）。
- **disposition 信号は前方互換の任意入力**。`DispositionScores`（改善/障害対応/育成/調整/新技術）を optional 引数にし、未提供時は 0 寄与。`worklife-disposition-survey` が将来供給する契約（下流 spec が参照）。
- **表示時算出（derive-at-render）**。`packages/types` 変更なし・マイグレーションなし・authoring 即反映（R9）。business/Phase2 は将来同じ純関数を再利用。
- **シンボル = 自己完結インライン SVG エンブレム**。共通フレーム（六角/盾）＋タイプ別グリフ＋デザインシステムのトークン配色。外部依存なし（CSP 整合, R6.3）、`role="img"`＋タイトルでアクセシブル（R6.4）。ラスタ画像/AI生成は不採用（ストレージ・非決定・CSP の懸念）。
- **class-catch-names を吸収**。ゲーム風異名（和風RPG語彙・性別中立監査済）を"おまけ"表示として再利用（R5）。

## Coverage Matrix（現行データでの到達性）

| 状態 | アーキタイプ | 開放条件 |
|---|---|---|
| ✅ 現行で到達可 | Builder / Architect / Guardian / Innovator / Commander / Craftsman | 既存 職掌+気質 |
| ⚠️ 部分的（弱信号） | Optimizer / Mentor / Firefighter / Integrator | worklife-disposition-survey で判別強化 |
| 🔒 survey 待ち | Researcher（sage-survey）/ Strategist（pdm-strategist-survey） | 職掌開放で到達 |

## Risks

- **signature の重み校正**: 初期値は設計値。実データ校正は後続（旧#6 と同様）。テーブルを1ファイルに集約し調整容易に。
- **境界の曖昧さ**（Builder↔Firefighter↔Integrator は improviser/challenger で近い）: disposition 信号が入るまで overlap し得る。coverage matrix と低信頼注記（R3.2）で緩和。
- **12シンボルの品質**: 統一フレーム＋グリフで一貫性を担保。実装時に全12を authoring（設計では体系＋代表数点を提示）。
