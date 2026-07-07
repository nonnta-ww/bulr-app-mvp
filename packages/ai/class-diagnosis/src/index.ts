// @bulr/ai-class-diagnosis
// クラスフレーバー文の自然言語生成パッケージ（契約型は @bulr/types 由来）

// 生成関数 + 純粋プロンプトビルダー
export {
  generateClassFlavor,
  buildClassFlavorSystemPrompt,
  buildClassFlavorPrompt,
} from './generate-class-flavor';

// Zod スキーマ
export { classFlavorSchema } from './schema';

// 型
export type { ClassFlavorInput, ClassFlavorGenResult } from './schema';
