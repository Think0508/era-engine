// 注释：权重区间随机（erArk value_handle.get_rand_value_for_value_region，等价 random.choices）
// 口上/地文权重选择共用（T8 审查：消除 dialogue-system 与 talk-common-system 的重复实现）

export function weightedRandom<T>(items: Array<{ item: T; weight: number }>): T {
  if (items.length === 0) throw new Error('weightedRandom: 空列表')
  const total = items.reduce((s, x) => s + x.weight, 0)
  // 注释：全 0/负权重防御（2026-08-13 审计）——原实现 total<=0 时 r=0 恒不命中，
  // 静默返回最后一项（偏差）；显式取第一项并保持语义可预期
  if (!(total > 0)) return items[0].item
  let r = Math.random() * total
  for (const x of items) {
    r -= x.weight
    if (r < 0) return x.item
  }
  return items[items.length - 1].item
}
