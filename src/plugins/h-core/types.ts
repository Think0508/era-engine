// 注释：身体物品槽——HP 药物/玩具/避孕套等在角色身上
// body_items 存在角色实体上，key=槽位编号(string), value=BodyItemSlot
export interface BodyItemSlot {
  itemId: string     // items.toml 中的物品 ID
  active: boolean    // 是否激活（插入/服用中）
  expiry?: number    // 到期游戏时间戳（分钟），仅 body_auto_remove=expiry 时有
}

// 注释：H 身体状态——只在 H 会话内有意义，H 结束重置

export interface H_STATE {
  // H 交互对象（对方角色 ID，无对象=自己/自慰）——erArk target_character_id
  target_character_id?: string
  // 插入位置 -1=未插入 0=V 1=A 2=U 3=W 4=M 5=发 6=脸 7=胸 8=腋 9=手 10=腿 11=足 12=深喉
  // （5-12 为 wait_upon 侍奉位；erArk insert_position 0/1/2/3/4/5/10/11/15 的引擎映射）
  insert_position: number
  // 当前体位 ID -1=无体位 1-12（erArk "仅博士有的数据"——引擎按被结算角色 h_state 存；
  // 默认 -1 对齐 erArk game_type.py:463）
  current_sex_position: number
  // 切换体位前的体位记录（erArk pre_sex_position；面板/口上展示用）
  pre_sex_position?: number
  // 当前子宫性交位置 0=未插入 1=子宫口插入 2=子宫奸（仅发起者/玩家有，erArk game_type.py:467）
  current_womb_sex_position: number
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
  // ===== 二段结算字段（对齐 erArk h_state，orgasm_settle 使用）=====
  // 各部位额外高潮累计快感（10级后）
  extra_orgasm_feel?: Record<number, number>
  // 额外高潮总次数
  extra_orgasm_count?: number
  // 各部位寸止累计次数（平方和用于成功率）
  orgasm_edge_count?: Record<number, number>
  // 各部位时停中绝顶计数
  time_stop_orgasm_count?: Record<number, number>
  // 时停解放状态（时停关闭绝顶解放结算后置 true，下次行动开始重置——erArk time_stop_release）
  time_stop_release?: boolean
  // 多重绝顶部位集合（本次同时绝顶的部位）
  plural_orgasm_set?: number[]
  // 射精位置（体内部位 body_part cid，用于饮精绝顶判定 2=口 15=胃）
  shoot_position_body?: number
  // 本次指令待结算的快感变化量累积（[partId] → 数值变化，二段结算消耗后清空）
  pending_orgasm_feel?: Record<number, number>
}

export function createHState(): H_STATE {
  return {
    insert_position: -1,
    current_sex_position: -1,
    current_womb_sex_position: 0,
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
    extra_orgasm_feel: {},
    extra_orgasm_count: 0,
    orgasm_edge_count: {},
    time_stop_orgasm_count: {},
    time_stop_release: false,
    plural_orgasm_set: [],
    shoot_position_body: -1,
    pending_orgasm_feel: {},
  }
}
