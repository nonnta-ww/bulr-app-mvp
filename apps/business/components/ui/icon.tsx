/**
 * Icon — Material Symbols Outlined を描画する薄いラッパ
 *
 * デザイン (docs/design) は Google の Material Symbols アイコンフォントを使用する。
 * <Icon name="add" /> のように使い、fill で塗りつぶしバリアントに切り替える。
 */

type Props = {
  name: string;
  className?: string;
  fill?: boolean;
  /** font-size(px)。指定しない場合は CSS 既定(20px)。 */
  size?: number;
};

export function Icon({ name, className, fill, size }: Props) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined${fill ? ' fill' : ''}${className ? ` ${className}` : ''}`}
      style={size ? { fontSize: size } : undefined}
    >
      {name}
    </span>
  );
}
