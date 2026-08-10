// 注释：跳过注册表——通用机制：判定"某实体是否应被跳过（不参与某系统活动）"
// 形状与 premise-registry 一致（core 提供通用注册机制，具体谓词由插件注册）。
// npc-ai-system 用它判定 NPC 是否跑 AI（内建：死亡/离线/无意识）；
// combat-base 注册"战斗中"谓词（战斗参与者冻结 AI）——插件间不直接 import，
// 走本注册表（core 中介，符合"唯一通信路径"铁律）。

type SkipPredicate = (entityId: string, entity: any) => boolean

const rules = new Map<string, SkipPredicate>()

/** 注册跳过谓词——重复注册 = 覆盖（插件重载/HMR 场景，与 premise-registry 2026-08-10 决策一致） */
export function registerSkipRule(id: string, fn: SkipPredicate): void {
  rules.set(id, fn)
}

/** 是否应被跳过（任一谓词为真）——谓词自身异常不拖垮调用方（跳过该谓词） */
export function isSkipped(entityId: string, entity: any): boolean {
  for (const fn of rules.values()) {
    try {
      if (fn(entityId, entity)) return true
    } catch {
      // 谓词异常不允许影响判定结果——跳过该谓词
    }
  }
  return false
}

/** 清空谓词（测试/重载用） */
export function clearSkipRules(): void {
  rules.clear()
}

/** 已注册的谓词 ID 列表（调试/文档） */
export function getSkipRuleIds(): string[] {
  return [...rules.keys()]
}
