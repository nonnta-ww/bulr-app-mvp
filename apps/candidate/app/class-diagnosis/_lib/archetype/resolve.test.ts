/**
 * archetype/resolve.ts の単体テスト（純関数・決定論・カバレッジ・命名品質）。
 *
 * spec: diagnosis-archetypes
 *  - master/signature/order の12件網羅・非空（R1.1/R1.2）
 *  - best-match の代表一致・反復一致（決定論, R2.1/R2.2）
 *  - 常に非空・固定 tiebreak（R2.3/R2.4）
 *  - graceful degradation: sage/strategist 職掌0・志向未提供で researcher/strategist が選ばれない（R3.1）
 *  - 前方互換: 志向を与えると選択が変わる（R3.3）
 *  - 命名品質: 数字なし・気質16型異名と非重複・性別禁則語なし（R8.1/R8.4）
 */

import { describe, expect, it } from "vitest";

import type {
  ClassResult,
  TemperamentAxis,
  TemperamentPole,
  TemperamentSummary,
  Vocation,
  VocationVector,
} from "@bulr/types";

import { TEMPERAMENT_ARCHETYPES } from "../../../_lib/temperament/archetypes";
import { ARCHETYPES, ARCHETYPE_ORDER, type ArchetypeId } from "./definitions";
import { ARCHETYPE_SIGNATURES } from "./signature";
import type { DispositionScores } from "./dispositions";
import { resolveArchetype, scoreArchetype } from "./resolve";

// ── テストヘルパ ────────────────────────────────────────────────

function vv(partial: Partial<Record<Vocation, number>>): VocationVector {
  return {
    vanguard: 0,
    rearguard: 0,
    guardian: 0,
    sage: 0,
    commander: 0,
    strategist: 0,
    ranger: 0,
    ...partial,
  };
}

function summary(
  poles: Partial<Record<TemperamentAxis, TemperamentPole>>,
): TemperamentSummary {
  const determined = Object.keys(poles).length;
  return {
    poles,
    balancedAxes: [],
    code: null,
    completeness: determined === 0 ? "none" : determined === 4 ? "full" : "partial",
  };
}

function makeResult(over: Partial<ClassResult>): ClassResult {
  return {
    primaryVocation: "vanguard",
    subVocations: [],
    vocationVector: vv({}),
    temperament: null,
    title: "apprentice",
    representativeVocation: "vanguard",
    className: "テスト",
    confidence: "normal",
    ...over,
  };
}

const ALL_POLES: Partial<Record<TemperamentAxis, TemperamentPole>> = {
  explorationDeepening: "deepener",
  soloCollaboration: "solo",
  planningImprovisation: "planner",
  stabilityChallenge: "stabilizer",
};

// ── 網羅・非空（R1.1/R1.2）─────────────────────────────────────

describe("master / signature / order の網羅", () => {
  it("ARCHETYPE_ORDER は12件・重複なし", () => {
    expect(ARCHETYPE_ORDER).toHaveLength(12);
    expect(new Set(ARCHETYPE_ORDER).size).toBe(12);
  });

  it("ARCHETYPES は全 id で非空の name/tagline/gameAlias を持つ", () => {
    for (const id of ARCHETYPE_ORDER) {
      const a = ARCHETYPES[id];
      expect(a.id).toBe(id);
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.handle.length).toBeGreaterThan(0);
      expect(a.tagline.length).toBeGreaterThan(0);
      expect(a.gameAlias.length).toBeGreaterThan(0);
    }
  });

  it("ARCHETYPE_SIGNATURES は全 id 分ある", () => {
    for (const id of ARCHETYPE_ORDER) {
      expect(ARCHETYPE_SIGNATURES[id]).toBeDefined();
    }
  });
});

// ── best-match（R2.1）＋決定論（R2.2）────────────────────────

describe("best-match の代表一致", () => {
  const cases: { name: string; result: ClassResult; expected: ArchetypeId }[] = [
    {
      name: "守護スキル＋堅実/深化 → Guardian",
      result: makeResult({
        vocationVector: vv({ guardian: 90 }),
        temperament: summary({
          explorationDeepening: "deepener",
          stabilityChallenge: "stabilizer",
        }),
      }),
      expected: "guardian",
    },
    {
      name: "指揮スキル → Commander",
      result: makeResult({ vocationVector: vv({ commander: 90 }) }),
      expected: "commander",
    },
    {
      name: "前衛/後衛スキル＋即興/挑戦 → Builder",
      result: makeResult({
        vocationVector: vv({ vanguard: 80, rearguard: 70 }),
        temperament: summary({
          planningImprovisation: "improviser",
          stabilityChallenge: "challenger",
        }),
      }),
      expected: "builder",
    },
    {
      name: "遊撃スキル＋探索/挑戦 → Innovator",
      result: makeResult({
        vocationVector: vv({ ranger: 70 }),
        temperament: summary({
          explorationDeepening: "explorer",
          stabilityChallenge: "challenger",
        }),
      }),
      expected: "innovator",
    },
    {
      name: "深化/堅実/個人 → Craftsman",
      result: makeResult({
        vocationVector: vv({ rearguard: 60 }),
        temperament: summary(ALL_POLES),
      }),
      expected: "craftsman",
    },
    {
      name: "賢者スキル（sage survey 到来後）→ Researcher",
      result: makeResult({
        vocationVector: vv({ sage: 90 }),
        temperament: summary({
          explorationDeepening: "explorer",
          soloCollaboration: "solo",
        }),
      }),
      expected: "researcher",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(resolveArchetype(c.result)).toBe(c.expected);
    });
  }

  it("同一入力で常に同一結果（決定論）", () => {
    const r = makeResult({
      vocationVector: vv({ guardian: 90 }),
      temperament: summary(ALL_POLES),
    });
    expect(resolveArchetype(r)).toBe(resolveArchetype(r));
  });
});

// ── 常に非空・固定 tiebreak（R2.3/R2.4）──────────────────────

describe("非空と tiebreak", () => {
  it("信号が皆無でも非空（ARCHETYPE_ORDER 先頭へフォールバック）", () => {
    const r = makeResult({ vocationVector: vv({}), temperament: null });
    expect(resolveArchetype(r)).toBe(ARCHETYPE_ORDER[0]);
  });

  it("全 score 同点のとき ARCHETYPE_ORDER 先頭が勝つ", () => {
    const scores = scoreArchetype(makeResult({}));
    // 信号皆無なら全 score 0（同点）
    for (const id of ARCHETYPE_ORDER) {
      expect(scores[id]).toBe(0);
    }
    expect(resolveArchetype(makeResult({}))).toBe(ARCHETYPE_ORDER[0]);
  });

  it("非先頭同士が同点でも ARCHETYPE_ORDER の先の方が勝つ", () => {
    // commander(0.9) と strategist(0.9) を同値にする入力。両者とも 50×0.9=45。
    const r = makeResult({
      vocationVector: vv({ commander: 50, strategist: 50 }),
    });
    const scores = scoreArchetype(r);
    expect(scores.commander).toBe(scores.strategist);
    // commander は ARCHETYPE_ORDER 上 strategist より前 → commander が勝つ。
    expect(ARCHETYPE_ORDER.indexOf("commander")).toBeLessThan(
      ARCHETYPE_ORDER.indexOf("strategist"),
    );
    expect(resolveArchetype(r)).toBe("commander");
  });
});

// ── graceful degradation（R3.1）──────────────────────────────

describe("段階導入のフォールバック", () => {
  it("sage/strategist が0・志向未提供なら researcher/strategist は選ばれない", () => {
    const realisticInputs: ClassResult[] = [
      makeResult({
        vocationVector: vv({ vanguard: 80 }),
        temperament: summary({ planningImprovisation: "improviser", stabilityChallenge: "challenger" }),
      }),
      makeResult({
        vocationVector: vv({ guardian: 85 }),
        temperament: summary({ explorationDeepening: "deepener", stabilityChallenge: "stabilizer" }),
      }),
      makeResult({
        vocationVector: vv({ rearguard: 70 }),
        temperament: summary(ALL_POLES),
      }),
    ];
    for (const r of realisticInputs) {
      const id = resolveArchetype(r);
      expect(id).not.toBe("researcher");
      expect(id).not.toBe("strategist");
    }
  });
});

// ── 前方互換（R3.3）──────────────────────────────────────────

describe("志向信号で選択が変わる", () => {
  const base = makeResult({
    vocationVector: vv({ rearguard: 50, guardian: 40 }),
    temperament: summary({
      explorationDeepening: "deepener",
      stabilityChallenge: "stabilizer",
    }),
  });

  it("志向なしでは Optimizer にならない", () => {
    expect(resolveArchetype(base)).not.toBe("optimizer");
  });

  it("改善志向を与えると Optimizer が選ばれる", () => {
    const dispositions: DispositionScores = { improvement: 90 };
    expect(resolveArchetype(base, dispositions)).toBe("optimizer");
  });
});

// ── 命名品質（R8.1/R8.4）─────────────────────────────────────

describe("命名品質", () => {
  const strings = ARCHETYPE_ORDER.flatMap((id) => {
    const a = ARCHETYPES[id];
    return [a.name, a.tagline, a.gameAlias];
  });

  it("名称・説明・異名に数字を含まない", () => {
    for (const s of strings) {
      expect(s).not.toMatch(/[0-9０-９]/);
    }
  });

  it("ゲーム風異名は気質16型アーキタイプ異名と重複しない", () => {
    const temperamentNames = new Set(
      Object.values(TEMPERAMENT_ARCHETYPES).map((a) => a.name),
    );
    for (const id of ARCHETYPE_ORDER) {
      expect(temperamentNames.has(ARCHETYPES[id].gameAlias)).toBe(false);
    }
  });

  it("性別を含意する禁則語を含まない", () => {
    const forbidden = ["将", "総帥", "総大将", "守将", "一番槍", "男", "女", "姫", "王子"];
    for (const s of strings) {
      for (const w of forbidden) {
        expect(s.includes(w)).toBe(false);
      }
    }
  });
});
