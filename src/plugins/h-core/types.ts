// 注释：身体物品槽——HP 药物/玩具/避孕套等在角色身上
// body_items 存在角色实体上，key=槽位编号(string), value=BodyItemSlot
export interface BodyItemSlot {
  itemId: string     // items.toml 中的物品 ID
  active: boolean    // 是否激活（插入/服用中）
  expiry?: number    // 到期游戏时间戳（分钟），仅 body_auto_remove=expiry 时有
}

// 注释：H 身体状态——只在 H 会话内有意义，H 结束重置

export interface H_STATE {
  // 插入位置 -1=未插入 0=V 1=A 2=U 3=W 4=M
  insert_position: number
  // 当前体位 ID 1-12
  current_sex_position: number
  // 各部位绝顶计数 [partId]: [当前H内累计, 总累计]
  orgasm_count: Record<number, number[]>
  // 各部位绝顶等级（0=small 1=normal 2=strong，循环）
  orgasm_level: Record<number, number>
  // 寸止状态 0=无 1=寸止中 2=解放 3=强制定
  orgasm_edge: number
  // 忍耐射精次数
  endure_not_shoot_count: number
  // 本次 H 射精总量 ml
  shoot_semen_amount: number
  // 刚射精标记 0=未 1=刚射 2=已清理
  just_shoot: number
  // 精力剂使用标记（首次射精量 ×2）
  used_semen_energy_agent: boolean
  // 浓厚精液标记（射精量 ×2）
  thick_semen: boolean
  // 紧缚类型 0=无
  bondage_type: number
  // 避孕套计数 [使用个数, 总精液ml]
  condom_count: [number, number]
  // 震动棒档位 0=OFF 1=弱 2=中 3=强
  sex_toy_level: number
  // 是否在 H 中
  is_h: boolean
  // H 内行为次数
  turn_count: number
}

export function createHState(): H_STATE {
  return {
    insert_position: -1,
    current_sex_position: 0,
    orgasm_count: {},
    orgasm_level: {},
    orgasm_edge: 0,
    endure_not_shoot_count: 0,
    shoot_semen_amount: 0,
    just_shoot: 0,
    used_semen_energy_agent: false,
    thick_semen: false,
    bondage_type: 0,
    condom_count: [0, 0],
    sex_toy_level: 0,
    is_h: true,
    turn_count: 0,
  }
}
