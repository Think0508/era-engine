// 通用高潮计数：目标角色在一次 H 会话内高潮 N 次
if (payload.character !== params.target) return 'pending'
const cur = (getVar('orgasm_count') ?? 0) + 1
setVar('orgasm_count', cur)
return cur >= params.count ? 'done' : 'pending'
