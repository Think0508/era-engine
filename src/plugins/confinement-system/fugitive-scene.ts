// 注释：追捕 scene 构造（阶段B）——独立文件打破 state.ts ↔ escape.ts 循环依赖
// 2026-08-14 四轮审查：state.ts import escape.ts（buildFugitiveScene）+ escape.ts import
// state.ts（getState）构成循环——ESM live binding 下当前安全，但模块顶层访问 state 值会
// TDZ 炸；抽离后 state.ts 不再 import escape.ts，依赖链单向化（escape → state ✓）
export interface FugitiveScene {
  id: string
  title: string
  type: string
  display: string
  steps: unknown[]
}

// 注释：追捕 scene 构造（单一数据源——createFugitiveCommission 与读档重建共用）
export function buildFugitiveScene(fugitiveId: string, hideout: string): FugitiveScene {
  const sceneId = `capture_${fugitiveId}`
  return {
    id: sceneId,
    title: `追捕逃犯`,
    type: 'event',
    display: 'log',
    steps: [
      {
        id: 'find', type: 'objective',
        objective: { type: 'reach_location', target: hideout },
        next: 'fight',
      },
      {
        id: 'fight', type: 'combat',
        enemies: [fugitiveId],
        on_win: 'recapture', on_lose: 'retry',
      },
      {
        id: 'recapture', type: 'reward',
        effects: [{ type: 'confinement_recapture', params: { fugitive: fugitiveId } }],
      },
      { id: 'retry', type: 'goto', target: 'find' },
    ],
  }
}
