// 注释：结算门控统一检查——所有 settle_* 效果共用（避免各效果重复/不一致/静默跳过难排查）
// erArk 依据：
//   dead → 不结算（common_default.py:180-181 状态 / :548 好感信赖）
//   无意识/时停（sp_flag.unconscious_h===3，时停由 h-time-stop 置位）→ 不结算（:551-557）
//   （睡眠/无意识系统未实装 L1.7，届时补 unconscious_h 的其他取值）
// 被门控跳过时输出 console.debug（浏览器 console 调试可见，不污染叙事日志）——静默跳过必须有迹可查

export function isSettleGated(ch: any, context: string): boolean {
  if (ch?.dead) {
    console.debug(`[settle-gate] ${context}：角色已死亡，跳过结算`)
    return true
  }
  if (ch?.sp_flag?.unconscious_h === 3) {
    console.debug(`[settle-gate] ${context}：目标无意识（时停），跳过结算`)
    return true
  }
  return false
}
