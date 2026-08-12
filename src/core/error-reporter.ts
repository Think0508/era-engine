// 注释：统一错误上报接口
// 所有引擎代码通过此接口报错，禁止直接 console.error
// @ 前缀 debug 命令可用于查看错误，浏览器 console 用于调试
// errorReporter.getErrors() 查询全部错误列表

export interface ErrorReport {
  source: string
  severity: 'error' | 'warning'
  file?: string
  line?: number
  message: string
  suggestion?: string
}

class ErrorReporter {
  private errors: ErrorReport[] = []
  // 注释：订阅者（2026-08-12 round 13 接线修复）——UI 层经此显示游戏内警告
  // （AGENTS §7"弹红色警告"此前断链：错误只进 console，玩家无感知）
  private listeners: ((err: ErrorReport) => void)[] = []

  report(err: ErrorReport): void {
    this.errors.push(err)
    // 注释：同时输出到 console 供调试
    if (err.severity === 'error') {
      console.error(`[${err.source}] ${err.message}${err.suggestion ? `\n  建议：${err.suggestion}` : ''}`)
    } else {
      console.warn(`[${err.source}] ${err.message}${err.suggestion ? `\n  建议：${err.suggestion}` : ''}`)
    }
    // 注释：通知订阅者（隔离——订阅者抛错不得阻断上报）
    for (const cb of [...this.listeners]) {
      try {
        cb(err)
      } catch {
        // 订阅者异常不影响错误上报本身
      }
    }
  }

  // 注释：订阅错误上报（返回退订函数）
  onReport(cb: (err: ErrorReport) => void): () => void {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb)
    }
  }

  getErrors(): ErrorReport[] {
    return [...this.errors]
  }

  getErrorsBySource(source: string): ErrorReport[] {
    return this.errors.filter(e => e.source === source).map(e => ({ ...e }))
  }

  clear(): void {
    this.errors = []
  }
}

export const errorReporter = new ErrorReporter()
