// 注释：权重区间随机（erArk value_handle.get_rand_value_for_value_region，等价 random.choices）
// 口上/地文权重选择共用（T8 审查：消除 dialogue-system 与 talk-common-system 的重复实现）
// 2026-08-15 审查 C3：新增数组重载（items+weights），合并 h-npc-ai/npc-ai-system 的 4 处副本

export interface WeightedRandomOptions {
  /** 全 0/负权重时的回退策略：'first'（默认，返回第一项）| 'uniform'（均匀随机） */
  zeroFallback?: 'first' | 'uniform'
}

/** pair 形式：{item, weight}[] → item（空列表抛错，与原行为一致） */
export function weightedRandom<T>(items: Array<{ item: T; weight: number }>, opts?: WeightedRandomOptions): T
/** 数组形式：items + weights 平行数组 → item（空列表返回 null） */
export function weightedRandom<T>(items: T[], weights: number[], opts?: WeightedRandomOptions): T | null
export function weightedRandom<T>(
  itemsOrPairs: T[] | Array<{ item: T; weight: number }>,
  weightsOrOpts?: number[] | WeightedRandomOptions,
  opts?: WeightedRandomOptions,
): T | null {
  let items: T[]
  let weights: number[]
  let options: WeightedRandomOptions
  if (Array.isArray(weightsOrOpts)) {
    items = itemsOrPairs as T[]
    weights = weightsOrOpts
    options = opts ?? {}
    // 注释：数组形式（原 active-h 语义）：空 → null；单元素短路不消耗 random
    if (items.length === 0) return null
    if (items.length === 1) return items[0]
  } else {
    const pairs = itemsOrPairs as Array<{ item: T; weight: number }>
    if (pairs.length === 0) throw new Error('weightedRandom: 空列表')
    items = pairs.map(p => p.item)
    weights = pairs.map(p => p.weight)
    options = weightsOrOpts ?? {}
    // 注释：pair 形式保持原行为——单元素也走 random（确定性 mock 序列依赖原调用数）
  }

  // 注释：负权重钳 0（与原实现的静默跳过等价——原 total 含负数但负权项永不命中；
  // 钳位后 total 更保守，选择结果与原实现一致）
  const clamped = weights.map(w => Math.max(w, 0))
  const total = clamped.reduce((s, w) => s + w, 0)
  // 注释：全 0/负权重防御（2026-08-13 审计）——原实现 total<=0 时 r=0 恒不命中，
  // 静默返回最后一项（偏差）；显式回退并保持语义可预期
  if (!(total > 0)) {
    if (options.zeroFallback === 'uniform') return items[Math.floor(Math.random() * items.length)]
    return items[0]
  }
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= clamped[i]
    if (r < 0) return items[i]
  }
  return items[items.length - 1]
}
