// ---------------------------------------------------------------------------
// 強み / 伸びしろ / 成長アクションのリスト表示（共有コンポーネント）
//
// Zenith デザイン: 見出し（アイコン + タイトル）+ 各項目を左アクセント付きカードで表示。
// ---------------------------------------------------------------------------

export interface NarrativeSectionProps {
  title: string;
  items: string[];
  /** 各カード左端アクセントの色クラス（例: 'border-l-primary'） */
  accentBorderClass: string;
  /** Material Symbols のアイコン名（見出し表示時のみ使用） */
  symbol?: string;
  /** 見出しアイコンの色クラス（例: 'text-primary'） */
  iconClass?: string;
  /** false で内部見出しを描画しない（呼び出し側が独自見出しを持つ場合） */
  showHeading?: boolean;
}

export function NarrativeSection({
  title,
  items,
  accentBorderClass,
  symbol,
  iconClass,
  showHeading = true,
}: NarrativeSectionProps) {
  if (items.length === 0) return null;
  return (
    <section>
      {showHeading && (
        <div className="mb-4 flex items-center gap-2">
          {symbol && (
            <span className={`material-symbols-outlined ${iconClass ?? ''}`} aria-hidden="true">
              {symbol}
            </span>
          )}
          <h3 className="text-lg font-bold text-ink">{title}</h3>
        </div>
      )}
      <div className="space-y-4">
        {items.map((item, index) => (
          // 静的リストのため index を key に使用（回答は immutable）
          <div
            key={index}
            className={`rounded-card border border-l-4 border-hairline bg-card p-5 shadow-ambient ${accentBorderClass}`}
          >
            <p className="text-sm leading-relaxed text-body">{item}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
