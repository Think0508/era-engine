// 注释：confinement-system 全局状态——囚犯列表/监狱长/设置/设施（save provider）
// 数据模型（grill Q3 定案）：
//   角色字段（sp_flag，随实体存档）：imprisonment/escaping/be_bagged/bagging_chara_id/pre_dormitory
//   全局状态（本 provider）：prisoners/wardenId/settings/facilityLevels
// 位掩码：unnormal_flag 位2（0x04）= AI 行动停止（erArk 位2；监禁/临盆/产后）
// 铁律：所有 sp_flag 读取用 ?? 默认，缺失字段按 erArk 语义给安全默认值，绝不抛错

import { registerGameStateProvider } from '../../core/save-system'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { apiSystem } from '../../core/api'
// 注释：buildFugitiveScene 在独立文件（fugitive-scene.ts）——打破 state ↔ escape 循环依赖
// （2026-08-14 四轮审查）
import { buildFugitiveScene } from './fugitive-scene'

// 注释：unnormal_flag 位2（0x04）——AI 行动基本停止（erArk 位2：临盆/产后/监禁）
export const UNNORMAL_BIT_2 = 0x04

// 注释：囚犯记录——[关押时间, 逃脱概率]（erArk current_prisoners 同构）
export interface PrisonerRecord {
  imprisonedAt: { minute: number; hour: number; day: number; month: number; year: number }
  escapeProbability: number // 0-100
}

// 注释：监禁调教设置（erArk Confinement_Training_Setting.csv）
export interface ConfinementSettings {
  training: number        // 1 囚犯训练管理：0不训练/1部位快感/2部位扩张/3苦痛快感/4性爱技巧/5身体锻炼/6心理服从
  clothing: number        // 2 囚犯服装：0全裸/1囚服/2正常衣服
  underwear: number       // 3 内衣袜子：0无/1情趣内衣袜子/2正常内衣袜子
  living_condition: number // 4 生活条件：0艰苦/1标准/2舒适
  prep_clean: boolean     // 11 调教前清洗
  prep_lube: boolean      // 11 调教前润滑
  prep_tools: Record<string, boolean> // 11 调教前道具（道具 id → 开关）
  assistant: number       // 12 调教助手：0关/1同部位/2异部位/3指定列表
  assistant_list: string[]  // 12 指定指令列表
  assistant_ban: string[]   // 12 禁止指令列表
  target: number          // 13 调教目标：0仅囚犯/1全员
}

export interface ConfinementState {
  prisoners: Record<string, PrisonerRecord>
  wardenId: string | null
  settings: ConfinementSettings
  // 设施接口预留（grill Q5 定案）：A 阶段恒空，公式留 facilityEfficiency 变量。
  // 未来 mod 数据可写入 { 设施id: 等级 }，escape.ts 按等级查效果表。
  facilityLevels: Record<string, number>
  // 逃犯记录（阶段B 追捕委托）——charId → { 藏匿点, 逃逸时刻（总分钟数） }
  // ⚠️ 2026-08-14 审查修复：escapedDay（day 序号）跨月重置导致超时判定失效，改存总分钟数
  fugitives: Record<string, { hideout: string; escapedAt: number }>
}

// 注释：默认设置（插件层默认值，mod 可 override——data/default/settings.toml 加载后覆盖）
export const DEFAULT_SETTINGS: ConfinementSettings = {
  training: 0,
  clothing: 1,
  underwear: 0,
  living_condition: 1,
  prep_clean: false,
  prep_lube: false,
  prep_tools: {},
  assistant: 0,
  assistant_list: [],
  assistant_ban: [],
  target: 0,
}

// 注释：模块级运行时状态（唯一权威——存档 provider 序列化/恢复它）
const state: ConfinementState = {
  prisoners: {},
  wardenId: null,
  settings: { ...DEFAULT_SETTINGS, prep_tools: {} },
  facilityLevels: {},
  fugitives: {},
}

// ── sp_flag 读取（全部 ?? 默认，缺失安全）──

export function isImprisoned(charId: string): boolean {
  const c = entitySystem.get('character', charId) as any
  return c?.sp_flag?.imprisonment === true
}

export function isEscaping(charId: string): boolean {
  const c = entitySystem.get('character', charId) as any
  return c?.sp_flag?.escaping === true
}

export function isBeBagged(charId: string): boolean {
  const c = entitySystem.get('character', charId) as any
  return c?.sp_flag?.be_bagged === true
}

// 注释：玩家正在搬运的角色 id（空串 = 无）
export function getBaggingCharaId(): string {
  const playerId = gameContext.getContext().player?.id
  if (!playerId) return ''
  const c = entitySystem.get('character', playerId) as any
  return c?.sp_flag?.bagging_chara_id ?? ''
}

export function setBaggingCharaId(charId: string): void {
  const playerId = gameContext.getContext().player?.id
  if (!playerId) return
  const c = entitySystem.get('character', playerId) as any
  if (!c?.sp_flag) c.sp_flag = {}
  c.sp_flag.bagging_chara_id = charId
}

export function getPreDormitory(charId: string): string {
  const c = entitySystem.get('character', charId) as any
  return c?.sp_flag?.pre_dormitory ?? ''
}

export function setPreDormitory(charId: string, locationId: string): void {
  const c = entitySystem.get('character', charId) as any
  if (!c?.sp_flag) c.sp_flag = {}
  c.sp_flag.pre_dormitory = locationId
}

// ── 全局状态访问 ──

export function getState(): ConfinementState {
  return state
}

export function getPrisoners(): Record<string, PrisonerRecord> {
  return state.prisoners
}

export function getWardenId(): string | null {
  return state.wardenId
}

export function getSettings(): ConfinementSettings {
  return state.settings
}

// 注释：重置运行时状态（模组切换/测试用）
export function resetConfinementState(): void {
  state.prisoners = {}
  state.wardenId = null
  state.settings = { ...DEFAULT_SETTINGS, prep_tools: {} }
  state.facilityLevels = {}
  state.fugitives = {}
}

// 注释：存档 provider（quest-system 同模式）——囚犯列表/监狱长/设置随存档
export function registerConfinementSaveProvider(): void {
  registerGameStateProvider({
    id: 'confinement-system',
    serialize: () => ({
      prisoners: state.prisoners,
      wardenId: state.wardenId,
      settings: state.settings,
      facilityLevels: state.facilityLevels,
      fugitives: state.fugitives,
    }),
    restore: (data) => {
      state.prisoners = data?.prisoners ?? {}
      state.wardenId = data?.wardenId ?? null
      state.settings = {
        ...DEFAULT_SETTINGS,
        ...(data?.settings ?? {}),
        prep_tools: { ...((data?.settings?.prep_tools as Record<string, boolean>) ?? {}) },
        assistant_list: [...((data?.settings?.assistant_list as string[]) ?? [])],
        assistant_ban: [...((data?.settings?.assistant_ban as string[]) ?? [])],
      }
      state.facilityLevels = data?.facilityLevels ?? {}
      state.fugitives = data?.fugitives ?? {}
      // 注释：读档校验（erArk save_handle.py:348）——imprisonment 但不在囚犯列表 → 补入
      for (const char of entitySystem.getAll('character')) {
        const c = char as any
        if (c?.sp_flag?.imprisonment && !state.prisoners[c.id]) {
          state.prisoners[c.id] = {
            imprisonedAt: { ...gameContext.getContext().time },
            escapeProbability: 0,
          }
        }
      }
      // ⚠️ 修复（2026-08-14 审查）：读档后重建追捕动态 scene——activeScenes 随存档恢复
      // 但 dynamicScenes 表（quest-system 模块级）不随存档序列化；不重建则 getScene 返回
      // undefined、追捕任务卡死（ADR 0012 注明的"注册方负责 restore 后重建"此前未实现）。
      // 2026-08-14 二次审查：改为同步注册（共享 buildFugitiveScene，消除 fire-and-forget
      // 时序隐患——读档后立刻触发 scene 推进时表已就绪）
      for (const [fugitiveId, info] of Object.entries(state.fugitives)) {
        const scene = buildFugitiveScene(fugitiveId, info.hideout)
        try {
          void apiSystem.call('quest', 'registerDynamicScene', scene.id, scene)
        } catch { /* quest 未加载（插件顺序）→ 跳过，正常路径会再触发 */ }
      }
    },
  })
}
