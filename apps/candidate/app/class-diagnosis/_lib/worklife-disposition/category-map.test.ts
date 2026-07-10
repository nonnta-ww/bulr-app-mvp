import { describe, it, expect } from "vitest";

import { WORKLIFE_DISPOSITION_CATEGORY_MAP } from "./category-map";

describe("WORKLIFE_DISPOSITION_CATEGORY_MAP", () => {
  it("5カテゴリを DispositionKey へ写像する", () => {
    expect(WORKLIFE_DISPOSITION_CATEGORY_MAP).toEqual({
      改善志向: "improvement",
      障害対応志向: "incident",
      育成志向: "mentoring",
      "調整・橋渡し志向": "coordination",
      新技術採用志向: "newTech",
    });
  });

  it("値は5志向（improvement/incident/mentoring/coordination/newTech）で重複しない", () => {
    const values = Object.values(WORKLIFE_DISPOSITION_CATEGORY_MAP);
    expect(new Set(values)).toEqual(
      new Set(["improvement", "incident", "mentoring", "coordination", "newTech"]),
    );
    expect(values).toHaveLength(5);
  });
});
