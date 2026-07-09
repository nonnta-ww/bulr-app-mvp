# SUPERSEDED — class-catch-names

この spec は **`diagnosis-archetypes`（Wave 8「診断アーキタイプ体系」）に吸収・置換**されました。

## 経緯（2026-07-09）

- 当初、RPGクラス診断のクラス名に短い「キャッチ名（異名）」を付ける小改善として requirements / design を生成（未実装）。
- ブレスト中に「現実の職種 × 診断タイプ × キャリアランク」の3層で捉え直す外部アイデアを受け、主役の見せ方を刷新する方針に転換。
- 決め手＝(1)性別中立、(2)現実の開発チームで「あの人こういう人だよね」と通じるプロ・アーキタイプを主役に、(3)ゲーム風異名は"おまけ"、(4)タイプ別シンボル。
- 結果、単なる異名付与ではなく **12アーキタイプ体系＋導出＋提示＋シンボル** を扱う `diagnosis-archetypes` に発展・置換。

## 引き継いだ資産（diagnosis-archetypes で再利用）

- 導出は「表示時算出（derive-at-render）・マイグレーション不要」の方針を踏襲。
- ゲーム風異名の和風RPG語彙（剣士・魔導士・守護者・軍師 等、性別中立に監査済み）は"おまけ"表示として再利用可能。
- 性別中立の設計判断（単一命名セット・性別属性を使用/収集しない）。

## 参照

- ロードマップ: `.kiro/steering/roadmap.md` の「Wave 8 — 診断アーキタイプ体系」
- 置換先 brief: `.kiro/specs/diagnosis-archetypes/brief.md`

> この spec ディレクトリの requirements.md / design.md は履歴として残す。新規作業は `diagnosis-archetypes` で行う。
