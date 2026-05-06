// NT$ 金額格式化工具
export function fmt(
  n: number | null | undefined,
  opts: { sign?: boolean; plus?: boolean } = {},
): string {
  if (n === null || n === undefined || isNaN(n)) return '$0';
  const abs = Math.abs(Math.round(n));
  const str = abs.toLocaleString('en-US');
  if (n === 0) return '$0';
  if (n < 0) return `-$${str}`;       // 負值永遠顯示負號
  if (opts.plus && n > 0) return `+$${str}`;
  return `$${str}`;
}
