// 注释：五度属性——统一累加通道（2026-08-21，机制通电小步）
// 设计依据：docs/five-degrees-attributes.md（镜像总账 / 桥契约 / 单调不降）
// 单一累加点：将来 settle 发射镜像挂钩 / combat:end 挂钩 / 角色性格系数，全部只调这一个函数
// → 桥 = 单一通道，作者零散写；本文件是"度"数值的唯一写入口（init 除外：default 由
//   attributes.toml default=0 落位）。

import { eventBus } from '../../../core/event-bus'

// 换算系数槽（pending：数值规律/性格系数系统落地前恒恒 1）
// TODO(五度，docs/five-degrees-attributes.md §八)：数值规律 = 角色性格系数系统决定各度换算。
// signature：(amount, char) => number；未登记 = 恒等。
const DEGREE_CONVERSIONS: Record<string, (amount: number, ch: any) => number> = {}

/**
 * 向指定角色累加一个「度」（单调不降，只增不减）。
 * 只写 social 命名空间（attributes.toml category=social，与 好感度/信赖度 同层）。
 * @param ch 角色实体
 * @param degree 度名（如 屈服度/软弱度/欲望度——数据驱动，不作 ATTR 常量）
 * @param amount 增量（非负；负值由调用方拦截并告警，本函数兜底忽略）
 */
export function accumulateDegree(ch: any, degree: string, amount: number): void {
  if (!ch || degree == null) return
  const raw = Number.isFinite(amount) ? amount : 0
  // 单调铁律兜底：负值/0 在调用方（accumulate_degrees effect）已拦截告警；此处再防直接调用者误用
  if (raw <= 0) return
  const conv = DEGREE_CONVERSIONS[degree]
  const delta = Math.floor(conv ? conv(raw, ch) : raw)
  if (delta <= 0) return
  if (!ch.social) ch.social = {}
  ch.social[degree] = (ch.social[degree] ?? 0) + delta
  eventBus.emit('character:changed', { id: ch.id })
}
