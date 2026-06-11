/**
 * ProposalMatcher 単体テスト — TDD RED→GREEN
 *
 * 検証観点（design.md: ProposalMatcher、Req 3.6 / 3.7）:
 *   1. 完全一致 → selectedIndex が正確に返る
 *   2. 言い換え（軽微な表現差）→ 同一インデックスにマッチ
 *   3. 閾値未満（無関係な自由質問）→ manual（Req 3.7 フリー質問入口）
 *   4. null proposal → manual
 *   5. 正規化確認（句読点・全角/半角差異を吸収）
 *   6. 最高スコア選択の正確性（正しいインデックスが選ばれる）
 *
 * テスト用候補は面接で実際に使われる
 * 深掘り / メタ認知 / 次パターン質問の典型例。
 */

import { describe, it, expect } from "vitest";
import { match } from "./proposal-matcher";

// ──────────────────────────────────────────────────────────────────────────────
// テスト用候補セット（深掘り / メタ認知 / 次パターン移行）
// ──────────────────────────────────────────────────────────────────────────────
const CANDIDATES: [string, string, string] = [
  "そのとき、どのような判断基準で決断されましたか？",            // 0: 深掘り
  "その経験から、自分のどのような強みや弱みに気づきましたか？",  // 1: メタ認知
  "次に同じような状況に直面した場合、何を変えたいと思いますか？", // 2: 次パターン
];

// ──────────────────────────────────────────────────────────────────────────────
// 1. 完全一致 (exact match)
// ──────────────────────────────────────────────────────────────────────────────
describe("ProposalMatcher — 完全一致 (exact match)", () => {
  it("候補 0 と完全一致する発話は selectedIndex:0 を返す", () => {
    const result = match({
      interviewerText: CANDIDATES[0],
      proposal: { candidates: CANDIDATES },
    });
    expect(result).toEqual({ source: "proposal", selectedIndex: 0 });
  });

  it("候補 1 と完全一致する発話は selectedIndex:1 を返す", () => {
    const result = match({
      interviewerText: CANDIDATES[1],
      proposal: { candidates: CANDIDATES },
    });
    expect(result).toEqual({ source: "proposal", selectedIndex: 1 });
  });

  it("候補 2 と完全一致する発話は selectedIndex:2 を返す", () => {
    const result = match({
      interviewerText: CANDIDATES[2],
      proposal: { candidates: CANDIDATES },
    });
    expect(result).toEqual({ source: "proposal", selectedIndex: 2 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. 言い換え (paraphrase) — 共通語幹を保ちつつ助詞・表現が変化
// ──────────────────────────────────────────────────────────────────────────────
describe("ProposalMatcher — 言い換え (paraphrase)", () => {
  it("候補 0 の軽い言い換えでも selectedIndex:0 を返す（語尾・助詞変化）", () => {
    // 「どのような」→「どういう」、「されましたか」はそのまま
    const result = match({
      interviewerText: "そのとき、どういう判断基準で決断されましたか？",
      proposal: { candidates: CANDIDATES },
    });
    expect(result).toEqual({ source: "proposal", selectedIndex: 0 });
  });

  it("候補 1 の言い換え（類似語に置換）でも selectedIndex:1 を返す", () => {
    // 「自分のどのような強みや弱みに気づきましたか」
    //  → 「どのような強みや弱みを感じましたか」（「その経験を通じて」に変化）
    const result = match({
      interviewerText: "その経験を通じて、どのような強みや弱みを感じましたか？",
      proposal: { candidates: CANDIDATES },
    });
    expect(result).toEqual({ source: "proposal", selectedIndex: 1 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. 閾値未満 → manual（Req 3.7 フリー質問入口）
// ──────────────────────────────────────────────────────────────────────────────
describe("ProposalMatcher — 閾値未満 (manual: free question)", () => {
  it("57 パターンと無関係な独自質問は manual を返す (Req 3.7)", () => {
    // 「キャリア」「今後」などキャプチャ候補にない語彙中心
    const result = match({
      interviewerText: "今後のキャリアについて、どのようにお考えですか？",
      proposal: { candidates: CANDIDATES },
    });
    expect(result).toEqual({ source: "manual" });
  });

  it("非常に短い発話（フィラー）は閾値未満で manual を返す", () => {
    const result = match({
      interviewerText: "なるほど",
      proposal: { candidates: CANDIDATES },
    });
    expect(result).toEqual({ source: "manual" });
  });

  it("全候補とまったく語彙が異なる発話は manual を返す", () => {
    // 自己紹介系の発話
    const result = match({
      interviewerText: "本日はお越しいただきありがとうございます。よろしくお願いします。",
      proposal: { candidates: CANDIDATES },
    });
    expect(result).toEqual({ source: "manual" });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. null proposal → manual
// ──────────────────────────────────────────────────────────────────────────────
describe("ProposalMatcher — null proposal", () => {
  it("proposal が null のとき manual を返す", () => {
    const result = match({
      interviewerText: CANDIDATES[0],
      proposal: null,
    });
    expect(result).toEqual({ source: "manual" });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. 正規化確認 (normalization)
//    句読点・記号・全角/半角の差異を正規化後に吸収し一致すること
// ──────────────────────────────────────────────────────────────────────────────
describe("ProposalMatcher — 正規化 (normalization)", () => {
  it("句読点なし発話でも正規化により候補 0 にマッチする", () => {
    // 候補は「、」「？」あり、発話は句読点を除去した形
    const result = match({
      interviewerText: "そのときどのような判断基準で決断されましたか",
      proposal: { candidates: CANDIDATES },
    });
    expect(result).toEqual({ source: "proposal", selectedIndex: 0 });
  });

  it("全角数字・記号が混在しても NFKC 正規化で候補にマッチする", () => {
    // 「第１回」→ NFKC → 「第1回」のような変換が行われても共通語幹で照合できる
    const c2Fullwidth = "次に同じような状況に直面した場合、何を変えたいと思いますか？" as const;
    // 候補 2 と同じ内容だが全角スペースを余分に含む
    const result = match({
      interviewerText: "次に同じような状況に直面した場合、　何を変えたいと思いますか？",
      proposal: { candidates: [CANDIDATES[0], CANDIDATES[1], c2Fullwidth] },
    });
    expect(result).toEqual({ source: "proposal", selectedIndex: 2 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. 最高スコア選択の正確性 — 候補 2 が選ばれるべきケース
// ──────────────────────────────────────────────────────────────────────────────
describe("ProposalMatcher — 最高スコア選択 (correct index)", () => {
  it("候補 2 の言い換えは selectedIndex:2 を返す（他候補より高スコア）", () => {
    // 「何を変えたいと思いますか」→「何を変えたいですか」語尾変化
    const result = match({
      interviewerText: "次に同じような状況に直面した場合、何を変えたいですか？",
      proposal: { candidates: CANDIDATES },
    });
    expect(result).toEqual({ source: "proposal", selectedIndex: 2 });
  });

  it("2 候補が似ていても最高スコアの候補インデックスを正確に返す", () => {
    // 候補 0 の核心語（そのとき・どのような・判断基準・決断）を保持した言い換え。
    // 候補 1 や候補 2 に対しても「そのとき」「どのような」等の共通 bigram があるが、
    // 候補 0 との Dice が最大になるため selectedIndex:0 が選ばれる。
    const result = match({
      interviewerText: "そのとき、どのような基準で判断して決断されたのでしょうか？",
      proposal: { candidates: CANDIDATES },
    });
    expect(result).toEqual({ source: "proposal", selectedIndex: 0 });
  });
});
