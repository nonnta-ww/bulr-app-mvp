import { Card, CardContent, CardHeader, CardTitle } from '@bulr/ui';

// ---------------------------------------------------------------------------
// 強み/弱み/成長アクションのリスト表示（共有コンポーネント）
// ---------------------------------------------------------------------------

export interface NarrativeSectionProps {
  title: string;
  items: string[];
  accentClass: string;
}

export function NarrativeSection({ title, items, accentClass }: NarrativeSectionProps) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className={`text-base font-semibold ${accentClass}`}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((item, index) => (
            // 静的リストのため index を key に使用（回答は immutable）
            <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="mt-1 shrink-0 text-gray-400">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
