// 通用奖励脚本：发物品 / 加天赋 / 输出台词（params 驱动，可复用）
if (params.item) {
  await api.call('inventory', 'addItem', sourceId, params.item, 1)
}
if (params.set_talent) {
  const t = params.set_talent
  const targetIds = t.target === 'player' ? [sourceId] : [t.target]
  await api.call('effect-system', 'execute',
    [{ type: 'set_field', target: targetIds[0], params: { path: t.path, value: t.value } }],
    { sourceId, _targetIds: targetIds })
}
for (const line of params.lines ?? []) {
  say(null, line)
}
return undefined
