import type { EntityData } from './types'

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
    return deepMerge({}, template)
  }

  if (!templates.has(extendsId)) {
    throw new Error(
      `父模板 '${extendsId}' 不存在 (模板 '${templateId}' 的 extends 指向了不存在的模板)`,
    )
  }

  const parent = resolveTemplate(extendsId, templates, nextVisited)
  return deepMerge(parent, template)
}
