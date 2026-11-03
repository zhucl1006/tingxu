/** 仅返回计数，不记录或打印输入文本。归一化规则由调用者/评测清单冻结。 */
export function characterErrorRate(reference: string, hypothesis: string): number | null {
  const a = Array.from(reference), b = Array.from(hypothesis);
  if (!a.length) return b.length ? null : 0;
  let previous = b.map((_, i) => i + 1);
  previous.unshift(0);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[b.length] / a.length;
}

export function changedCharacters(previous: string, next: string): number {
  const a = Array.from(previous), b = Array.from(next);
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  return a.length - prefix;
}
