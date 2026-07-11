// 命名空间搜索顺序
const SEARCH_ORDER = [
  'base', 'params', 'flags', 'talents', 'marks',
  'first_record', 'experience', 'social', 'economy', 'combat',
]

/** 判断一个对象是否可能是角色实体（有命名空间结构） */
function isEntity(obj: any): boolean {
  return obj && typeof obj === 'object' && (
    Array.isArray(obj.base) || 
    (obj.base && typeof obj.base === 'object')
  )
}

/** 跨命名空间读取属性值 */
export function getEntityAttr(entity: any, name: string): any {
  if (entity === null || entity === undefined) return 0

  // 直接属性（如 entity.name, entity.abilities）
  if (Object.prototype.hasOwnProperty.call(entity, name)) {
    const val = entity[name]
    if (val !== undefined) return val
  }

  // 搜索命名空间
  for (const ns of SEARCH_ORDER) {
    const container = entity[ns]
    if (container && typeof container === 'object') {
      const val = container[name]
      if (val !== undefined) return val
    }
  }

  return 0
}

/** 跨命名空间写入属性值 */
export function setEntityAttr(entity: any, name: string, value: any): boolean {
  if (!entity) return false

  // 直接属性
  if (Object.prototype.hasOwnProperty.call(entity, name)) {
    entity[name] = value
    return true
  }

  // 搜索命名空间写入
  for (const ns of SEARCH_ORDER) {
    const container = entity[ns]
    if (container && typeof container === 'object') {
      if (Object.prototype.hasOwnProperty.call(container, name)) {
        container[name] = value
        return true
      }
    }
  }

  return false
}

/** 解析嵌套路径（如 "params.恭顺" → entity.params.恭顺） */
export function getEntityPath(entity: any, path: string): any {
  const parts = path.split('.')
  let current = entity
  for (const part of parts) {
    if (current === null || current === undefined) return 0
    if (typeof current !== 'object') return 0
    current = current[part]
  }
  return current !== undefined ? current : 0
}

/** 设值嵌套路径（如 "params.恭顺" → entity.params.恭顺 = value） */
export function setEntityPath(entity: any, path: string, value: any): boolean {
  const parts = path.split('.')
  let current = entity
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) current[parts[i]] = {}
    current = current[parts[i]]
  }
  const last = parts[parts.length - 1]
  current[last] = value
  return true
}
