#!/usr/bin/env python3
"""提取erArk指令数据并生成Markdown文档。

读取CSV配置文件，为每条指令生成格式化的API条目，
输出到 docs/systems/06-08 目录下的对应文件。

用法:
    python extract_instructions.py

输入:
    data/csv/InstructConfig.csv      — 全部指令定义
    data/csv/InstructJudge.csv       — 实行判定阈值
    data/csv/Behavior_Effect.csv     — 行为→效果映射
    data/csv/InstructType.csv        — 指令类型名
    data/csv/Instruct_Sex_Type.csv   — H子类型名

输出:
    docs/systems/06-指令集-攻略期.md
    docs/systems/07-指令集-猥亵期.md
    docs/systems/08-指令集-H内.md
"""

import csv
import os
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_DIR = os.path.join(BASE_DIR, "data", "csv")
OUT_DIR = os.path.join(BASE_DIR, "docs", "systems")


def read_csv(filename):
    """读取CSV, 跳过注释行(第2-4行), 返回list of dict."""
    path = os.path.join(CSV_DIR, filename)
    rows = []
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        lines = list(reader)
    # 第0行: cid, ...
    # 第1-3行: 中文注释/类型/占位
    # 第4行: "指令配置表" 或类似标题
    # 第5行+: 数据
    header = lines[0]
    data_start = 5  # 第5行开始是数据
    for line in lines[data_start:]:
        if not line or not line[0] or line[0] == "0":
            continue  # 跳过空行和cid=0的行
        row = {}
        for i, h in enumerate(header):
            if i < len(line):
                row[h] = line[i]
            else:
                row[h] = ""
        rows.append(row)
    return rows


def load_lookup_tables():
    """加载类型名查找表"""
    instruct_types = {}
    for row in read_csv("InstructType.csv"):
        instruct_types[row["cid"]] = row["name"]

    sex_types = {}
    for row in read_csv("Instruct_Sex_Type.csv"):
        sex_types[row["cid"]] = row["name"]

    # Behavior → Effect 映射 (key: uppercase behavior_id)
    behavior_effects = defaultdict(list)
    for row in read_csv("Behavior_Effect.csv"):
        key = row["behavior_id"].upper()
        behavior_effects[key].append(row["effect_id"])

    # InstructJudge 查找
    instruct_judge = {}
    for row in read_csv("InstructJudge.csv"):
        instruct_judge[row["instruct_name"]] = {
            "need_type": row["need_type"],
            "value": row["value"],
        }

    return instruct_types, sex_types, behavior_effects, instruct_judge


def get_h_filename(sub_type_cid, instruct_types_lookup):
    """根据指令类型/子类型确定输出文件名."""
    type_name = instruct_types_lookup.get(sub_type_cid, "未知")
    return {
        "日常": "06-指令集-攻略期.md",
        "娱乐": "06-指令集-攻略期.md",
        "工作": "06-指令集-攻略期.md",
        "猥亵": "07-指令集-猥亵期.md",
        "性爱": "08-指令集-H内.md",
    }.get(type_name)


# 类型名硬编码映射
INSTRUCT_TYPE_NAMES = {
    "SYSTEM": "系统(0)", "DAILY": "日常(1)", "PLAY": "娱乐(2)",
    "WORK": "工作(3)", "ARTS": "技艺(4)", "OBSCENITY": "猥亵(5)", "SEX": "性爱(6)",
}
SEX_SUBTYPE_NAMES = {
    "0": "基础(0)", "FOREPLAY": "前戏(1)", "WAIT_UPON": "侍奉(2)",
    "DRUG": "药物(3)", "ITEM": "道具(4)", "INSERT": "插入(5)", "SM": "SM(6)", "ARTS": "技艺(7)",
}


def split_effects(effect_str):
    """'21 - 12 - CVE_A2_E|80_G_1' → ['21', '12', 'CVE_A2_E|80_G_1']"""
    if not effect_str or effect_str == "9999":
        return []
    return [e.strip() for e in effect_str.split(" - ") if e.strip() != "9999"]


def generate_instruction_entry(row, behavior_effects, instruct_judge, instruct_types, sex_types):
    """为一条指令生成Markdown条目."""
    instruct_id = row["instruct_id"]
    name = row["name"]
    instruct_type = row["instruct_type"]
    instruct_sub_type = row["instruct_sub_type"]
    premise_set = row["premise_set"]
    behavior_id = row["behavior_id"]
    body_parts = row.get("body_parts", "")

    type_str = INSTRUCT_TYPE_NAMES.get(instruct_type, instruct_type)
    if instruct_sub_type != "0":
        sub_name = SEX_SUBTYPE_NAMES.get(instruct_sub_type, instruct_sub_type)
        type_str += f" / {sub_name}"

    # 前提条件
    premises = []
    if premise_set:
        premises = premise_set.split("|")

    # 行为效果
    raw_effect = behavior_effects.get(behavior_id.upper(), [""])[0] if behavior_effects.get(behavior_id.upper()) else ""
    effects = split_effects(raw_effect) if raw_effect else []

    # 实行判定
    judge_entry = instruct_judge.get(name)
    judge_info = ""
    if judge_entry:
        judge_info = f"{judge_entry['need_type']}类, 基准需求值 {judge_entry['value']}"

    lines = []
    lines.append(f"### {name} ({instruct_id})")
    lines.append(f"  - **指令ID**: `{instruct_id}`")
    lines.append(f"  - **类型**: {type_str}")
    if behavior_id:
        lines.append(f"  - **行为ID**: `{behavior_id}`")
    if body_parts:
        lines.append(f"  - **关联身体部位**: {body_parts}")

    lines.append(f"  - **前置条件**:")
    if premises:
        for p in premises:
            lines.append(f"    - `{p}`")
    else:
        lines.append(f"    - (无)")

    lines.append(f"  - **实行判定**: {judge_info if judge_info else '(无特殊判定)'}")

    lines.append(f"  - **结算效果ID**: {effects if effects else '(无)'}")

    if judge_info:
        target = ""
        if "06-指令集-攻略期" in "":
            target = "攻略"
        elif "07-指令集-猥亵期" in "":
            target = "猥亵"
        else:
            target = "H内"
        if "D" in (judge_entry.get("need_type", "") if judge_entry else ""):
            lines.append(f"  - **结算**: 参见 [公式手册](./00-公式手册.md) 公式#3(实行判定), 好感/信赖/状态修正，并结合行为效果ID对应的结算函数")
        else:
            lines.append(f"  - **结算**: 参见 [公式手册](./00-公式手册.md) 公式#1(好感度)/#3(实行判定)/#7(HPMP)/#8(状态值), 并结合行为效果ID对应的结算函数")
    else:
        lines.append(f"  - **结算**: 根据行为效果ID调用对应的结算函数")

    # 口上
    if behavior_id:
        lines.append(f"  - **口上**: `Character_Talk.json` behavior_id=`{behavior_id}`")

    lines.append("")
    return "\n".join(lines)


def write_output_file(filename, title, section_title, entries):
    """写入最终的Markdown文件."""
    path = os.path.join(OUT_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"# {title}\n\n")
        f.write(f"> 本文档由 `extract_instructions.py` 自动生成。\n")
        f.write(f"> 每条指令的结算公式和状态修正系数见 [公式手册](./00-公式手册.md)。\n")
        f.write(f">\n")
        f.write(f"> **结算效果ID说明**: 效果ID对应 `Script/Settle/default.py` 中注册的行为效果函数。\n")
        f.write(f"> 大致范围: 0-99=基础属性(HP/MP/好感), 100-199=状态调整, 500-599=特殊指令(H结束/隐奸等),\n")
        f.write(f"> 800-899=H体位, 1400-1499=H属性变化。`CVE_` 前缀=综合数值结算(Comprehensive Value Effect)。\n")
        f.write(f"> 实现代码路径: `Script/Settle/default.py`(10625行), `Script/Settle/common_default.py`(960行),\n")
        f.write(f"> `Script/Settle/Second_effect.py`(二段行为), `Script/Settle/item_effect.py`(道具效果)。\n\n")
        f.write(f"## {section_title}\n\n")
        for entry in entries:
            f.write(entry)
    print(f"  输出: {path} ({len(entries)} 条指令)")


def main():
    print("提取指令数据...")
    instruct_types, sex_types, behavior_effects, instruct_judge = load_lookup_tables()

    all_instructs = read_csv("InstructConfig.csv")

    # 分类: 攻略期(DAILY/PLAY/WORK/ARTS/SYSTEM), 猥亵期(OBSCENITY), H内(SEX)
    groups = {
        "06-指令集-攻略期.md": ("攻略期指令", "日常/娱乐/工作/技艺/系统", []),
        "07-指令集-猥亵期.md": ("猥亵期指令", "猥亵(OBSCENITY)", []),
        "08-指令集-H内.md": ("H内指令", "性爱(SEX)", []),
    }

    for row in all_instructs:
        instruct_type = row["instruct_type"]

        entry = generate_instruction_entry(
            row, behavior_effects, instruct_judge, instruct_types, sex_types
        )
        entry = entry + "\n"

        if instruct_type in ("DAILY", "PLAY", "WORK", "ARTS", "SYSTEM"):
            groups["06-指令集-攻略期.md"][2].append(entry)
        elif instruct_type == "OBSCENITY":
            groups["07-指令集-猥亵期.md"][2].append(entry)
        elif instruct_type == "SEX":
            groups["08-指令集-H内.md"][2].append(entry)

    for filename, (title, section_title, entries) in groups.items():
        write_output_file(filename, title, section_title, entries)

    print(f"\n完成! 共生成 {sum(len(v[2]) for v in groups.values())} 条指令条目")


if __name__ == "__main__":
    main()
