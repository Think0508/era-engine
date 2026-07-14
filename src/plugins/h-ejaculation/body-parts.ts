// 身体部位编号（对齐 erArk game_config config_body_part）
// 条件表达式中可用中文名称替代数字编号：
//   selected.body_semen.阴道.1 > 50   ← 等价于 selected.body_semen.6.1 > 50
//   selected.body_semen.肛.1 > 0      ← 等价于 selected.body_semen.8.1 > 0
//   selected.body_semen.后穴.1 > 0    ← 同上
export const BODY_PART_CID: Record<string, number> = {
  '头发': 0,
  '面': 1,
  '脸': 1,
  '嘴': 2,
  '口腔': 2,
  '口': 2,
  '胸': 3,
  '胸部': 3,
  '乳房': 3,
  '乳': 3,
  '阴蒂': 4,
  '蒂': 4,
  '手': 5,
  '阴道': 6,
  '穴': 6,
  '子宫': 7,
  '宫': 7,
  '肛': 8,
  '后穴': 8,
  '菊花': 8,
  '脚': 9,
  '尿道': 10,
  '腿': 11,
  '腰': 12,
  '腰部': 12,
  '臀部': 13,
  '臀': 13,
  '屁股': 13,
  '背': 14,
  '胃': 15,
  '肚子': 15,
  '腹': 15,
  '耳': 16,
  '腋': 17,
  '腋下': 17,
  '全身': 18,
  '体内': 20,
}

// 逆映射：CID → 主要中文名
export const CID_TO_NAME: Record<number, string> = {}
for (const [name, cid] of Object.entries(BODY_PART_CID)) {
  if (!CID_TO_NAME[cid]) CID_TO_NAME[cid] = name
}
