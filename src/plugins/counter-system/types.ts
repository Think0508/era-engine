// 计数器系统（counter-system）——统一计数器插件
// 2026-08-17 grill 定稿（ADR-0016）：
//   - 混合边界：存量机制（experience/body_semen/first_records/h_state/各 H 内 record）
//     保持散装不动；纯统计/记录进本系统。存量通过"视图"（只读映射）统一暴露，不双写。
//   - 三种类型：number（数值）/ list（去重名单+初始数字）/ group_table（嵌套分组表：
//     dim1 → dim2 → 字段；存储不限深度，维度由声明 dims 定义）
//   - 事件驱动为主：监听标准事件（h:shoot/h:start/relation:*），旧指令零改动；
//     复杂判定（性别过滤/谁发起）走内置监听器，声明 DSL 只做简单映射（防膨胀，见 ADR）
//   - 声明式：definitions/counters.toml（插件默认层 + mod override，mod-parse 合并）
//   - 惰性创建：角色实体 counters 字段首次计数/调用时才创建（500 NPC 零预置开销）
//   - 初始值：创建时快照自角色可选字段（__meta 保留键），读数两个：
//     总数（含初始）/ 真实值（减初始，具名初始去重）
//   - 半成品：字段声明 pending=true（依赖未实现事件）→ 加载 warning + 条件不注册 + 监听跳过
//   - 条件接入：core condition-engine 代理域 'counters'（registerProxyDomain）——
//     counters.{charId}.{counterOrView}.{dims...} / ...real.{dims...}（真实值）

import type { CounterDef, CounterViewDef } from '../../core/mod-types'

// ============ 存储形状 ============
// 挂角色实体 .counters 字段（惰性）：
//   number:        { [counterId]: number }
//   list:          { [counterId]: { initial: number, list: string[] } }
//   group_table:   { [counterId]: {
//                     __meta?: { [dim1]: { count?, named?, field_init? } },  // 初始值快照（保留键）
//                     [dim1]: { [dim2]: { [field]: number } }
//                   } }
// 条件路径（代理域 counters.{charId}.{key}）：
//   number:        counters.李秋水.xxx > 5
//   list:          counters.李秋水.h_partners.count / .list / .real
//   group_table:   counters.李秋水.male_stats.6.玩家id.semen
//   count():       count(counters.李秋水.male_stats.6) > 3  （数 dim2 条目，不含 __meta）
//   view:          counters.李秋水.semen_total.6 / counters.李秋水.semen_total.real.6
// 实体直读（condition-engine 原生导航，不经代理）同样可用：
//   character.{id}.counters.male_stats.6.玩家id.semen / selected.counters.xxx

/** 保留键：分组表根部的初始值快照（部位 dim1 → meta）。角色 id / 部位 id 永不用此名（约定） */
export const META_KEY = '__meta'
/** 真实值（减初始）路径段：counters.{charId}.{key}.real.{dims...} */
export const REAL_SEG = 'real'

// ============ 事件绑定（编译结果）============
export type BindingKind = 'number' | 'list' | 'group_field'

export interface CompiledBinding {
  counterId: string
  kind: BindingKind
  field?: CounterFieldRef      // group_field 用
}

export interface CounterFieldRef {
  id: string
  add: string | number
}

/** 插件内部定义——defs/views 注册表（mod 重载时替换） */
export interface CounterRegistry {
  defs: Record<string, CounterDef>
  views: Record<string, CounterViewDef>
  /** 事件名 → 绑定列表（编译结果，events.ts 消费） */
  bindingsByEvent: Map<string, CompiledBinding[]>
}