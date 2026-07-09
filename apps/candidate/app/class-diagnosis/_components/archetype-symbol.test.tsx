// @vitest-environment jsdom
/**
 * ArchetypeSymbol UI テスト（spec: diagnosis-archetypes, R6）
 *
 * 検証:
 *  - 12アーキタイプすべてで役割属性（role="img"）＋タイトル（代替テキスト）が描画される（R6.1/R6.4）。
 *  - 外部ネットワーク参照（http(s):// や xlink 外部）を含まない自己完結 SVG である（R6.3）。
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { ArchetypeSymbol } from "./archetype-symbol";
import { ARCHETYPE_ORDER, ARCHETYPES } from "../_lib/archetype/definitions";

afterEach(cleanup);

describe("ArchetypeSymbol", () => {
  it("12アーキタイプすべてで role=img とタイトルを描画する", () => {
    for (const id of ARCHETYPE_ORDER) {
      const { container, unmount } = render(<ArchetypeSymbol id={id} />);
      const svg = container.querySelector('svg[role="img"]');
      expect(svg).not.toBeNull();
      const title = container.querySelector("title");
      expect(title?.textContent).toContain(ARCHETYPES[id].name);
      unmount();
    }
  });

  it("外部ネットワーク参照を含まない（自己完結）", () => {
    for (const id of ARCHETYPE_ORDER) {
      const { container, unmount } = render(<ArchetypeSymbol id={id} />);
      const html = container.innerHTML;
      expect(html).not.toMatch(/https?:\/\//);
      expect(html).not.toMatch(/xlink:href\s*=\s*["']https?:/);
      unmount();
    }
  });

  it("size プロパティを反映する", () => {
    const { container } = render(<ArchetypeSymbol id="builder" size={96} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("96");
  });
});
