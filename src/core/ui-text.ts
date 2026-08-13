// 注释：ui-text — 世界观文案机制（meta.toml [ui_text] 段）
// 引擎提供通用中文默认值，mod 按 key 覆盖（如 erArk 世界观文案："存档"→"神经连接柜"、
// 角色名后缀 →"博士"）。core 不认具体世界观词——默认值全部通用。
// 解析：mod-loader 把 meta.toml [ui_text] 表解析进 LoadedMod.uiTexts；
// 查询：getUIText(key) 优先 mod 覆盖，缺省回退默认表，再无 → 原 key。
// API：ctx.api.call('engine', 'uiText.get', key)

import { modLoader } from './mod-loader'

export const DEFAULT_UI_TEXTS: Record<string, string> = {
  // 存档面板（erArk"神经连接柜"世界观词 → 默认通用中文）
  'save.panel_title': '存档',
  'save.empty_slot': '空槽位',
  'save.loading': '加载中…',
  'save.action.load': '读取',
  'save.action.overwrite': '覆盖',
  'save.action.delete': '删除',
  'save.action.back': '返回',
  'save.action.cancel': '取消',
  'save.confirm.load': '确认读取存档',
  'save.confirm.overwrite': '确认覆盖存档',
  'save.confirm.delete': '确认删除存档',
  'save.label.game_time': '游戏时间:',
  'save.label.save_time': '存档时间:',
  // 注释：角色名后缀（erArk 用"博士"）——默认空字符串，mod 自行配置
  'save.label.character': '',
  'save.label.is_new': ' (新!)',
  'save.label.auto': '自动存档',
  'save.page_prev': '上一页',
  'save.page_next': '下一页',
  'save.import': '导入存档',
  'save.export': '导出存档',
  'save.confirm.import': '选择存档 JSON 文件导入',
  // 标题画面（erArk"初次唤醒/神经重载/接入协议/模组管理/断开连接"→ 默认通用中文）
  'title.new_game': '新的冒险',
  'title.continue': '继续冒险',
  'title.settings': '设置',
  'title.switch_mod': '切换模组',
  'title.exit': '退出',
}

export function getUIText(key: string): string {
  const mod = modLoader.getMod()
  const override = mod?.uiTexts?.[key]
  if (override !== undefined && override !== '') return override
  return DEFAULT_UI_TEXTS[key] ?? key
}
