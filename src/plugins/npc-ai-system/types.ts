// 注释：npc-ai-system 数据接口（插件层定义——core 不认知任何具体字段名）
// 数据文件：ai-behaviors.toml（行为规格）/ ai-targets.toml（目标）/
//           ai-work.toml（工种）/ ai-entertainment.toml（娱乐类型）
// 插件默认层（data/default/）+ mod definitions/ 覆盖（loadMerged 机制）

// ── 运行时行为块（存于 char.ai_behavior，引擎独占字段）──
// erArk 对应物：character_data.behavior（game_type.py:969 Behavior）
export interface BehaviorBlock {
  /** 行为规格 ID（ai-behaviors.toml 键名）——决策结果的可读身份 */
  id: string
  /** 行为类型（处理器注册表 key）——由行为规格的 type 字段解析 */
  type: string
  /** 行为开始（游戏总分钟数，gameTimeToTotalMinutes） */
  start_time: number
  /** 行为时长（分钟） */
  duration: number
  /** 目标地点 ID（move/work/entertainment）或角色 ID（socialize） */
  target?: string
  /** move 行为路径（含起点，顺序经过）——erArk behavior.move_target */
  move_path?: string[]
  /** move 行为最终目的地——erArk behavior.move_final_target */
  move_final_target?: string
  /** 处理器写入的额外参数（如 work_type/entertainment_type） */
  params?: Record<string, any>
}

// ── 行为规格（ai-behaviors.toml [behaviors.xxx]）──
// 缝切方案：固定常量（时长/效果/显示名）在数据层（mod 可覆盖），
// 状态依赖计算（sleep 算起床/work 算班末/move 算路径）在处理器层
export interface BehaviorSpec {
  /** 行为类型（处理器注册表 key）——需要计算的时长由处理器覆盖 spec.duration */
  type: string
  /** 显示名（UI/条件字段展示用） */
  name: string
  /** 固定或随机时长（分钟）——处理器不覆盖时使用 */
  duration?: { fixed?: number; min?: number; max?: number }
  /** 行为完成时执行的效果（effectTypeRegistry，data 驱动） */
  on_complete_effects?: any[]
  /** 行为开始叙事模板（{name} 占位 = 角色名；仅玩家同地点时输出） */
  narrative?: string
}

// ── 目标定义（ai-targets.toml [[targets]]）──
// erArk 对应物：config_target（前提集合 + state_machine_id）
export interface AITargetDef {
  /** 目标唯一 ID */
  id: string
  /** 显示名（调试/手册用） */
  name?: string
  /** 优先级层（升序搜索，首个有候选的层胜出——erArk config_target_type_index 分层） */
  layer: number
  /** 前提 ID 列表（premiseRegistry，权重求和语义 getWeightSum——erArk search_target） */
  premises?: string[]
  /** 可选布尔条件（现有条件引擎；mod 作者友好通道，不参与权重） */
  condition?: string
  /** 决策结果：{ type: <行为规格ID>, params }——处理器按规格解析 */
  behavior: { type: string; params?: Record<string, any> }
  /** 本层只取第一个通过目标（erArk get_first_only=True 层语义） */
  get_first_only?: boolean
}

// ── 工种（ai-work.toml [[work_types]]）──
// erArk 对应物：config_work_type（place/place_tag/auto_ai）
export interface WorkTypeDef {
  id: string
  name?: string
  /** 工作地点（location ID） */
  place: string
  /** 上班时段（小时闭区间，如 [[8,12],[14,18]]） */
  time_slots: [number, number][]
  /** auto_ai：到点自动工作（在岗免决策，直接继续工作；不在岗自动前往）——erArk auto_ai */
  auto_ai: boolean
}

// ── 娱乐类型（ai-entertainment.toml [[entertainment_types]]）──
// erArk 对应物：config_entertainment + judge_entertainment_time（game_time.py：
// 1=上午 9-12，2=下午 14-18，3=晚上 19-22，0=无）
export type EntertainmentPeriod = 'morning' | 'afternoon' | 'evening'

export interface EntertainmentTypeDef {
  id: string
  name?: string
  place: string
  /** 时段槽（每天一个槽——erArk CHARA_ENTERTAINMENT.entertainment_type 三槽） */
  period: EntertainmentPeriod
}

// ── NPC 行为作者数据（char.behavior，AGENTS §23 扩展）──
export interface CharacterBehaviorData {
  /** 活跃度 0-1（闲逛目标权重系数；0 = 不闲逛/不主动移动） */
  activity?: number
  /** 常驻出没点（地点 ID → 权重）——闲逛目标的地点池 */
  home_locations?: Record<string, number>
  /** 时间规律（时段 → 地点）——个人排班，优先于目标搜索 */
  time_rules?: { hour_range: [number, number]; target: string; weight?: number }[]
  /** 工种（ai-work.toml 的 id）——erArk CHARA_WORK.work_type */
  work?: { work_type: string }
  /** 娱乐（按时段槽选类型）——erArk CHARA_ENTERTAINMENT.entertainment_type[3] */
  entertainment?: { types: Record<EntertainmentPeriod, string> }
}
