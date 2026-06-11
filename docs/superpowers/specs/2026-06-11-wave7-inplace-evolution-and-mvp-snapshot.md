# Wave 7 への移行方針 — in-place 進化と MVP スナップショット

- 日付: 2026-06-11
- ステータス: 決定済み（タグ・ブランチ作成済み）
- 関連: `.kiro/specs/realtime-interview-capture/`（spec 一式）、[PR #7](https://github.com/nonnta-ww/bulr-app-mvp/pull/7)、`.kiro/steering/roadmap.md` Wave 7

## 背景

BrightHire / Metaview との競合ギャップ分析（2026-06-11 実施）の結論:

1. **キャプチャ層の UX が決定的に劣後している。** 現行の状態A/B ターン単位手動録音は、面接官に面接中の画面操作を強いる。競合はボットが会議に自動参加し操作ゼロが標準（Metaview は日本語含む 50+ 言語対応済みで、「日本語非対応の猶予」は存在しない）
2. **評価コンテンツは bulr 固有の moat。** 57 状況パターン × 4 段階深掘り × 5 次元スコアリングは競合が持たない資産であり、無改修で維持する
3. 汎用ノートテイキング（文字起こし+要約）は Zoom / Meet / Teams ネイティブ機能に吸収されつつあるコモディティ領域であり、勝負しない

この結論から Wave 7（realtime-interview-capture）を起案した。詳細は spec の requirements / design / research を参照。

## 決定: フォークせず、同一モノレポで in-place に進化させる

新バージョンは見た目上「作り直し」に近いが、実体は**キャプチャ層（面接中 UI + ターン処理 API）のみの置き換え**であり、以下は無改修で流用する:

- DB スキーマ（migration は 0015 の加算のみ、旧データは閲覧互換）
- LLM 5 関数（analyzeTurn / splitInterviewerCandidate / proposeNextQuestions / aggregatePatternCoverage / generateSessionReport）
- 認証・管理画面・候補者アプリ・エントリー連携（session-from-entry）

フォーク（別リポジトリ化）は、バグ修正・依存更新・migration の二重適用が発生するため棄却。tasks.md も Phase 1〜4 の in-place 移行（旧 UI は Phase 4 のタスク 8.1 まで共存、削除は revert 可能なコミットに分離）を前提に設計されている。

## MVP スナップショットの残し方

「現状の MVP を今後の参考として残したい」要望は、フォークではなく以下で満たす:

| 種別 | 名前 | 指す先 | 用途 |
| --- | --- | --- | --- |
| annotated tag | `v0-mvp` | `b6c3243`（PR #7 マージ直後の main） | コード参照の固定点。`git checkout v0-mvp` でいつでも当時の全体に戻れる |
| ブランチ | `legacy/mvp-v0` | 同上 | タグより発見しやすい入口。**メンテしない読み取り専用の標本**（コミットを積まない） |

`v0-mvp` 時点の内容: Stage 1 MVP（面接アシスタント、状態A/B UI）+ Stage 2 Wave 1〜5（3 アプリ分割・候補者プロダクト・自己分析）+ Wave 7 spec ドキュメント（実装は未着手）。

### 動く状態で残したい場合（任意・未実施）

旧 UI を実際に触れる標本が必要になったら:

1. Vercel に参照専用プロジェクトを 1 つ作成し、Production Branch を `legacy/mvp-v0` に固定
2. Neon の dev ブランチからフォークした専用 DB ブランチを接続（本番データと分離）
3. 「メンテしない・依存更新しない・デモ/比較検証専用」と割り切る

必要が生じた時点で実施すればよく、タグがある限り後からいつでも作れる。

## Wave 7 で置き換わるもの / 残るもの（境界の要約）

```
置き換え: 状態A/B ステートマシン UI、ターン単位録音、ターン毎 Whisper バッチ
新規:     ミーティングボット（Recall.ai）、リアルタイム文字起こし＋話者分離、
          transcript_segment / capture_recording、live-state ポーリング、
          操作レスサイドパネル
維持:     assessment_pattern 57 / interview_turn 以降の評価スキーマ /
          LLM 5 関数 / finalize のレポート生成 / 管理画面 / 候補者アプリ
```

接合点は「ライブトランスクリプト → 論理ターン → `interview_turn` 書き戻し」のアダプタ（design.md の Boundary Commitments 参照）。

## UI 刷新の方向（参考）

Wave 7 実装に合わせ、UI テーマを刷新する（Stitch でデザイン探索済み）:

- ライトモード基調。ベース: オフホワイト `#F7F8FA` + 黒に近いネイビー `#11162A`（テキスト・プライマリーボタン等の構造色）
- アクセント: 銅系アンバー `#C9803B`（細部のみ。indigo / blue 系は不使用）
- 実装時は `packages/ui` の shadcn テーマトークン（CSS variables）として定義する

## 参照

- spec: `.kiro/specs/realtime-interview-capture/`（requirements / design / tasks / research）
- 競合分析の根拠: research.md の Gap Analysis 章および設計判断 D-1〜D-14
- 実装開始: `/kiro-impl realtime-interview-capture`（事前に Recall.ai API キー取得が必要）
