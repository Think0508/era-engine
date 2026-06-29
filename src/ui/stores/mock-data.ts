// 注释：mock-data 供组件开发期间（Task 5.4-5.14）填充 game-store
// 数据来源：test-mod 的 TOML 文件内容手抄为 TS 常量（不依赖 mod-loader，纯前端测试用）
// Task 5.15 bridge 替换为真实 core 数据后，mock-data 不再用于生产，但保留供测试

import type { EntityData, LocationData, GameTimeData } from '../../core/types'
import type { CalendarConfig, EquipmentSlot } from './game-store'

export const mockPlayer: EntityData = {
  id: 'player',
  name: '玩家',
  template: 'test-hero',
  base: { hp: 200, mp: 80, attack: 15, defense: 5, speed: 5 },
  equipment: { upper_body: '布衣', lower_body: '长裤' },
  assets: { portrait: 'assets/char/player.png' },
}

export const mockInnkeeper: EntityData = {
  id: 'innkeeper',
  name: '酒馆老板',
  template: 'base-human',
  base: { hp: 80, mp: 50, attack: 5, defense: 5, speed: 5 },
  behavior: { activity: 0, home_locations: { tavern: 1.0 } },
  current_location: 'tavern',
  equipment: { upper_body: '布衣', lower_body: '长裤' },
  assets: { portrait: 'assets/char/innkeeper.png' },
}

export const mockGuard: EntityData = {
  id: 'guard',
  name: '卫兵',
  template: 'base-human',
  base: { hp: 120, mp: 50, attack: 12, defense: 5, speed: 5 },
  behavior: { activity: 0.3, home_locations: { town_square: 0.7, tavern: 0.3 } },
  current_location: 'town_square',
  equipment: { upper_body: '布衣', lower_body: '长裤' },
  assets: { portrait: 'assets/char/guard.png' },
}

export const mockTownSquare: LocationData = {
  id: 'town_square',
  name: '城镇广场',
  parent: null,
  type: 'building',
  tags: ['has_shop'],
  exits: [{ target: 'tavern', name: '去酒馆', time_cost: 5 }],
}

export const mockTavern: LocationData = {
  id: 'tavern',
  name: '酒馆',
  parent: 'town_square',
  type: 'building',
  tags: ['has_drink'],
  exits: [{ target: 'town_square', name: '去广场', time_cost: 5 }],
}

export const mockTime: GameTimeData = { minute: 33, hour: 10, day: 9, month: 9, year: 1 }

export const mockCharactersAtTownSquare: EntityData[] = [mockGuard]
export const mockCharactersAtTavern: EntityData[] = [mockInnkeeper]

export const mockCalendar: CalendarConfig = {
  month_names: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
  weekday_names: ['日', '一', '二', '三', '四', '五', '六'],
  hour_names: ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'],
}

export const mockEquipmentSlots: EquipmentSlot[] = [
  { id: 'upper_body', name: '上身', category: 'clothing' },
  { id: 'lower_body', name: '下身', category: 'clothing' },
  { id: 'accessory', name: '饰品', category: 'accessory' },
]
