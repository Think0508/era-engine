// 注释：data-dependencies 负责插件 data_dependencies 的 topo-sort
// 插件在 plugin.toml 声明 [data_dependencies] provides 和 depends_on
// resolveDataDependencies 返回 onEnable 顺序（被依赖的在前）
// 无 data_dependencies 的插件按原顺序排在前（不阻塞有依赖的）

export interface DataDependencyInfo {
  pluginId: string
  provides: string[]
  dependsOn: string[]
}

// 注释：topo-sort——被依赖的在前，依赖者在后
// 返回有序的 pluginId 数组
export function resolveDataDependencies(
  plugins: DataDependencyInfo[],
): string[] {
  // 注释：构建 provides → pluginId 映射
  const providesMap = new Map<string, string>()
  for (const p of plugins) {
    for (const cap of p.provides) {
      providesMap.set(cap, p.pluginId)
    }
  }

  // 注释：构建依赖图——pluginId → 依赖的 pluginId 列表
  const depGraph = new Map<string, string[]>()
  const pluginIds = new Set<string>()
  for (const p of plugins) {
    pluginIds.add(p.pluginId)
    const deps: string[] = []
    for (const dep of p.dependsOn) {
      const depPluginId = providesMap.get(dep)
      if (depPluginId && depPluginId !== p.pluginId) {
        deps.push(depPluginId)
      }
    }
    depGraph.set(p.pluginId, deps)
  }

  // 注释：Kahn 算法 topo-sort
  const sorted: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  function visit(id: string): void {
    if (visited.has(id)) return
    if (visiting.has(id)) {
      // 注释：循环依赖——跳过断链，不崩
      return
    }
    visiting.add(id)
    const deps = depGraph.get(id) ?? []
    for (const dep of deps) {
      visit(dep)
    }
    visiting.delete(id)
    visited.add(id)
    sorted.push(id)
  }

  for (const id of pluginIds) {
    visit(id)
  }

  return sorted
}
