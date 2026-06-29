// 注释：asset-resolver 图片路径解析器
// 用 Vite import.meta.glob 扫描 mods 下图片，建路径→URL 映射表
// Portrait/Sidebar 组件调 resolveAsset(path) 获取 URL

// 注释：eager: true 在构建时扫描，建立路径→URL 映射
const assetMap = import.meta.glob('/mods/**/assets/**/*.{png,jpg,jpeg,webp,gif,svg}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

// 注释：构建路径→URL 的查找表
// 路径格式如 "assets/char/player.png" → Vite 返回的 URL
const pathToUrl = new Map<string, string>()
for (const [fullPath, url] of Object.entries(assetMap)) {
  // 注释：从完整路径 /mods/{mod}/assets/xxx 提取 assets/xxx 部分
  const match = fullPath.match(/^\/mods\/[^/]+\/(assets\/.+)$/)
  if (match) {
    pathToUrl.set(match[1], url)
  }
  // 注释：也存完整路径
  pathToUrl.set(fullPath, url)
}

export function resolveAsset(path: string): string | null {
  if (!path) return null
  // 注释：先尝试直接查
  if (pathToUrl.has(path)) return pathToUrl.get(path)!
  // 注释：尝试查完整路径
  return pathToUrl.get(path) ?? null
}

// 注释：检查资源是否存在（不返回 URL，只判断有没有）
export function hasAsset(path: string): boolean {
  return resolveAsset(path) !== null
}
