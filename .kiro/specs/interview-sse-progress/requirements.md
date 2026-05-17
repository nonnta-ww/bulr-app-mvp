# Requirements Document

## Project Description (Input)

インタビュー「次へ」処理のSSEストリーミング進捗表示 — POST /api/interview/turns/next をServer-Sent Eventsに変更し、音声アップロード・文字起こし・LLM分析・次質問生成の各ステップ完了をリアルタイムにクライアントへ通知して待機画面に進捗を表示する

## Introduction

面接官が「次の質問へ」ボタンを押した後、音声アップロード・文字起こし・LLM 分析・次質問生成という複数の処理ステップが順次実行されるが、現状は単純なスピナー（「処理中...」）しか表示されないため、処理の進行状況が面接官にわからない。本機能は、各ステップの完了をリアルタイムで面接官に伝える進捗表示を実現する。

## Boundary Context

- **In scope**: 「次の質問へ」ボタン押下後の待機画面における進捗ステップ表示、各ステップの完了通知、失敗発生時の通知と録音状態への復帰、再試行時の冪等な振る舞い
- **Out of scope**: 録音中のリアルタイム文字起こし表示、面接終了処理および候補質問再生成処理の進捗表示、処理中のキャンセル機能、候補者向け UI
- **Adjacent expectations**: 既存の3画面遷移（録音画面 → 待機画面 → 候補選択画面）は維持される。本機能は待機画面のみを対象とし、候補選択画面に遷移後に表示されるデータ（直前ターンの文字起こし・LLM 分析サマリー・3 候補）は現行と同一内容である必要がある

## Requirements

### Requirement 1: 処理ステップの進捗表示

**Objective:** As a 面接官, I want 「次の質問へ」ボタンを押した後に何の処理が行われているかをリアルタイムで確認したい, so that 処理が止まっているのか進んでいるのかを判断でき、不安なく待てる

#### Acceptance Criteria

1. When 面接官が「次の質問へ」ボタンを押下した後に待機画面が表示されるとき, the Interview Processing Screen shall 以下の 4 ステップをこの順序でリスト形式に表示する: (1) 音声のアップロード, (2) 音声の文字起こし, (3) 回答の分析, (4) 次の質問の準備
2. When 各処理ステップがサーバー側で完了したとき, the Interview Processing Screen shall 該当ステップを「完了」状態（チェックマーク等）に更新し、次のステップを「処理中」状態に切り替える
3. While いずれかのステップが処理中である間, the Interview Processing Screen shall 該当ステップを視覚的に他ステップと識別可能な状態で表示する
4. When 全ステップが完了したとき, the Interview Processing Screen shall 候補選択画面に自動的に遷移する
5. When 同じ録音データに対する処理がサーバー側で既に完了済みである場合（再試行や接続復旧時）, the Interview Processing Screen shall 4 ステップ全てを「完了」状態として表示した上で候補選択画面に遷移する

### Requirement 2: 候補選択画面に進めない失敗の通知と再試行

**Objective:** As a 面接官, I want 候補選択画面に進めない失敗が発生したときに通知を受け、同じ録音で再試行できる, so that 録音をやり直さずに面接を継続できる

#### Acceptance Criteria

1. If 処理が候補選択画面に進めない状態で終了したとき（サーバー側からの失敗通知、または応答が完了しないまま接続が断たれた場合を含む）, the Interview Processing Screen shall 失敗が発生したことを面接官に通知する
2. When 上記の失敗が発生したとき, the Interview Processing Screen shall 同じ録音データを保持したまま録音画面に復帰する
3. When 面接官が失敗後に「次の質問へ」を再度押下したとき, the Interview Processing Screen shall 同じ録音データで処理を再実行する（既存の冪等性保証により、サーバー側で重複登録は発生しない）

### Requirement 3: 候補選択画面のデータ整合性と部分失敗の許容

**Objective:** As a 面接官, I want 進捗表示の追加によって候補選択画面の表示内容が変わらず、また次質問生成の部分失敗で待機画面が止まらない, so that 既存の面接フローへの影響を受けずに使える

#### Acceptance Criteria

1. When 全ステップが完了して候補選択画面に遷移したとき, the Interview System shall 現行実装と同一内容の文字起こし、LLM 分析サマリー、次質問の 3 候補を表示する
2. When 「次の質問の準備」ステップが部分的に失敗しても、それより前のステップ（音声のアップロード・文字起こし・回答の分析）が全て成功している場合, the Interview Processing Screen shall 候補選択画面への遷移を妨げず、現行と同等の挙動（候補が生成できていない場合は候補選択画面側で再生成を促す）を維持する
