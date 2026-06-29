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

  report(err: ErrorReport): void {
    this.errors.push(err)
    // 注释：同时输出到 console 供调试
    if (err.severity === 'error') {
      console.error(`[${err.source}] ${err.message}${err.suggestion ? `\n  建议：${err.suggestion}` : ''}`)
    } else {
      console.warn(`[${err.source}] ${err.message}${err.suggestion ? `\n  建议：${err.suggestion}` : ''}`)
    }
  }

  getErrors(): ErrorReport[] {
    return [...this.errors]
  }

  getErrorsBySource(source: string): ErrorReport[] {
    return this.errors.filter(e => e.source === source)
  }

  clear(): void {
    this.errors = []
  }
}

export const errorReporter = new ErrorReporter()
