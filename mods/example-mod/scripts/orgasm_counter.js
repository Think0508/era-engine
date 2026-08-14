// 通用高潮计数：目标角色在一次 H 会话内高潮 N 次
// 注意：h:orgasm 事件 = 部位级高潮（一次结算中每部位一条事件，payload.count 当前恒 1）；
// 若未来 h-core 的 payload.count > 1（一次结算多部位并发高潮），此处应累计 payload.count 而非每次 +1
if (payload.character !== params.target) return 'pending'
const cur = (getVar('orgasm_count') ?? 0) + 1
setVar('orgasm_count', cur)
return cur >= params.count ? 'done' : 'pending'
