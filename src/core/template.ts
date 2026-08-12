import type { EntityData } from './types'

// 注释：结构化深拷贝（保持 null/undefined 语义）——模板解析结果必须与模板缓存零共享
// （audit-a C1：deepMerge 的浅拷贝/数组浅拷贝会让同模板角色共享嵌套对象引用，
// 运行时互相污染 + 模板缓存被改写。注意 null 是合法数据（"删除字段"语义），undefined 保留原键）
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.map(item => deepClone(item)) as unknown as T
  }
  const out: Record<string, any> = {}
  for (const key of Object.keys(value as Record<string, any>)) {
    out[key] = deepClone((value as Record<string, any>)[key])
  }
  return out as T
}

export function deepMerge(parent: EntityData, child: EntityData): EntityData {
  const result: EntityData = { ...parent }

  for (const key of Object.keys(child)) {
    const childVal = child[key]
    const parentVal = parent[key]

    if (childVal === null) {
      delete result[key]
    } else if (typeof childVal === 'object' && !Array.isArray(childVal)) {
      const base =
        typeof parentVal === 'object' &&
        !Array.isArray(parentVal) &&
        parentVal !== null
          ? parentVal
          : {}
      result[key] = deepMerge(base, childVal)
    } else if (Array.isArray(childVal)) {
      result[key] = [...childVal]
    } else {
      result[key] = childVal
    }
  }

  return result
}

export function resolveTemplate(
  templateId: string,
  templates: Map<string, EntityData>,
  visited: Set<string> = new Set(),
): EntityData {
  if (visited.has(templateId)) {
    const chain = [...visited, templateId].join(' → ')
    throw new Error(`循环继承检测: ${chain}`)
  }

  const template = templates.get(templateId)
  if (!template) {
    throw new Error(`模板 '${templateId}' 不存在`)
  }

  const nextVisited = new Set(visited)
  nextVisited.add(templateId)

  const extendsId = template.extends
  if (!extendsId) {
    // 注释：audit-a C1——返回前结构化深拷贝，保证实体与模板缓存零共享
    // （deepMerge 数组分支是浅拷贝，数组内对象元素会直接引用模板原始对象）
    return deepClone(deepMerge({}, template))
  }

  if (!templates.has(extendsId)) {
    throw new Error(
      `父模板 '${extendsId}' 不存在 (模板 '${templateId}' 的 extends 指向了不存在的模板)`,
    )
  }

  const parent = resolveTemplate(extendsId, templates, nextVisited)
  // 注释：audit-a C1——深拷贝同 no-extends 分支（parent 虽为每次调用独立副本，
  // 但 deepMerge 的浅 spread 仍会让结果引用 parent 的嵌套对象；克隆保证绝对零共享）
  return deepClone(deepMerge(parent, template))
}
