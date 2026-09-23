// 注释：经验曲线（2026-09-23 秘籍-技能系统）——**叶子模块**，core 与各插件共用的唯一一份算式。
//
// 为什么是 core 而不是某个插件：秘籍（花经验买层）与技能（用技能涨经验）用的是同一条几何曲线，
// 而"插件之间禁止直接 import"（AGENTS 架构铁律）——共用算式只能下沉到 core。
// core 不认任何属性名/品级名：这里只有 base/ratio/index 三个数字。

/** 项目级几何曲线公比约定：第 n 级所需 = base × ratio^(n−1)。 */
export const DEFAULT_XP_RATIO = 1.15

/** 浮点归整：`200 × 1.15 = 229.99999999999997` 这类噪声会让"刚好打满"差一个 ε，
 *  升级后残留 `2.8e-14` 点经验（UI/条件里看得见）。归整不动曲线形状，只去噪声。 */
export function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6
}

/** 几何曲线取值：`levelIndex` 为 0 基（0 → base，1 → base×ratio，…）。
 *  ratio 非有限/非正 → 退回 `DEFAULT_XP_RATIO`（不产出 NaN/负数）。 */
export function geometricCost(base: number, ratio: number | undefined, levelIndex: number): number {
  const b = typeof base === 'number' && Number.isFinite(base) && base > 0 ? base : 0
  const r = typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 ? ratio : DEFAULT_XP_RATIO
  const i = Math.max(0, Math.floor(levelIndex))
  return round6(b * Math.pow(r, i))
}
