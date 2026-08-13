// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { getUIText, DEFAULT_UI_TEXTS } from './ui-text'
import { modLoader } from './mod-loader'

// 注释：ui-text 测试——引擎默认通用中文，mod [ui_text] 覆盖优先，空值回退默认

describe('ui-text', () => {
  beforeEach(async () => {
    ;(modLoader as any).loadedMod = null
  })

  it('无 mod 时返回引擎默认（通用中文，不含世界观词）', () => {
    expect(getUIText('save.panel_title')).toBe('存档')
    expect(getUIText('save.empty_slot')).toBe('空槽位')
    expect(getUIText('save.label.character')).toBe('')
    expect(getUIText('title.continue')).toBe('继续冒险')
    // 未知 key 回退原 key
    expect(getUIText('unknown.key')).toBe('unknown.key')
  })

  it('默认表覆盖所有存档/标题 key', () => {
    for (const key of [
      'save.panel_title', 'save.empty_slot', 'save.loading',
      'save.action.load', 'save.action.overwrite', 'save.action.delete', 'save.action.back', 'save.action.cancel',
      'save.confirm.load', 'save.confirm.overwrite', 'save.confirm.delete',
      'save.label.game_time', 'save.label.save_time', 'save.label.character', 'save.label.is_new',
      'save.label.auto', 'save.page_prev', 'save.page_next', 'save.import', 'save.export',
      'title.new_game', 'title.continue', 'title.settings', 'title.switch_mod', 'title.exit',
    ]) {
      expect(key in DEFAULT_UI_TEXTS).toBe(true)
    }
  })

  it('mod [ui_text] 覆盖优先', async () => {
    await modLoader.loadMod('test-mod')
    expect(getUIText('save.panel_title')).toBe('神经连接柜')
    expect(getUIText('save.label.character')).toBe('博士')
    // 未覆盖 key 仍回退默认
    expect(getUIText('save.empty_slot')).toBe('空槽位')
  })
})
