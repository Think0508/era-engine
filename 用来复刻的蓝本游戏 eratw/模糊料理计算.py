import os
import re
import glob
import sys
import subprocess
from collections import Counter

# ================= 0. 内嵌数据定义 =================

RACE_DEFINITIONS = {
    "人类": {1: "人类", 2: "仙人", 3: "天人", 4: "月人", 5: "魔界人", 6: "外界人"},
    "妖怪": {1: "妖怪", 2: "鬼", 3: "吸血鬼", 4: "河童", 5: "天狗", 6: "妖獣", 7: "妖鳥", 8: "妖蟲", 9: "悪魔", 10: "小人", 11: "座敷童子", 12: "山童"},
    "妖精": {1: "妖精"},
    "神霊": {1: "神霊", 2: "死神", 3: "閻魔"},
    "幽霊": {1: "幽霊", 2: "騒霊", 3: "亡霊", 4: "悪霊"},
    "付喪神": {1: "付喪神"},
    "人形": {1: "人形", 2: "机械", 3: "魔像", 4: "埴輪", 5: "僵尸", 99: "人形の乙女"},
    "追加種族": {1: "巫女", 2: "魔法使", 3: "女僕", 4: "蓬莱人"},
    "妄想的産物": {}, "人妻": {}, "風俗嬢": {}
}

# ================= 1. 输出控制工具 =================

class Logger:
    def __init__(self, filename="calculation_result.txt"):
        self.filename = filename
        self.buffer = []

    def log(self, text=""):
        print(text)
        self.buffer.append(text)

    def save_and_open(self):
        try:
            with open(self.filename, 'w', encoding='utf-8') as f:
                f.write("\n".join(self.buffer))
            print(f"\n[系统] 计算结果已保存至 {self.filename}")
            if sys.platform == "win32":
                os.startfile(self.filename)
            else:
                opener = "open" if sys.platform == "darwin" else "xdg-open"
                subprocess.call([opener, self.filename])
        except Exception as e:
            print(f"[错误] 无法打开文件: {e}")

logger = Logger()

# ================= 2. 核心逻辑：词条管理与交互 =================

class IngredientTagManager:
    @staticmethod
    def get_derived_tags(ingredient_name, current_dish_tags):
        tags = [] 
        if not ingredient_name or ingredient_name in ["汎用", "泛用"]: return tags
        if ingredient_name in ["普通的菌菇", "毒菌菇", "黏性菌菇", "冬虫夏草", "可疑菌菇", "魔法菌菇"]: tags.append("蘑菇")
        if ingredient_name in ["草莓", "西瓜", "仙桃", "树莓", "山葡萄"]:
            tags.append(ingredient_name); tags.append("果物")
            if ingredient_name in ["树莓", "山葡萄"]: tags.append("野趣")
        if ingredient_name == "卵":
            if "卵" not in current_dish_tags: tags.append("卵")
        elif ingredient_name == "奇妙な卵":
            if "卵" not in current_dish_tags: tags.append("卵")
            tags.append("怪诞")
        elif ingredient_name == "少女の卵":
             if "卵" not in current_dish_tags: tags.append("卵")
        if ingredient_name == "红酒": tags.append("家庭的")
        elif ingredient_name == "陈酿红酒": tags.append("上品")
        elif ingredient_name == "优质陈酿红酒": tags.append("上品"); tags.append("豪華")
        return tags

class RaceTagGenerator:
    YOUKAI_SET = set(RACE_DEFINITIONS["妖怪"].values()) | {"妖怪"}
    GOD_SET = set(RACE_DEFINITIONS["神霊"].values()) | {"神霊"}
    GHOST_SET = set(RACE_DEFINITIONS["幽霊"].values()) | {"幽霊"}

    @staticmethod
    def get_tags_from_race(race_str, talents=None):
        tags = []
        if not race_str: return tags
        races = race_str.split('/')
        if any(r in RaceTagGenerator.YOUKAI_SET for r in races): tags.append("妖力")
        if any(r in RaceTagGenerator.GOD_SET for r in races): tags.append("神力")
        if "巫女" in races: tags.append("神力")
        if any(r in RaceTagGenerator.GHOST_SET for r in races): tags.append("霊障")
        if "仙人" in races: tags.append("仙術")
        if "魔界人" in races: tags.append("魔力")
        if "外界人" in races: tags.append("外界風")
        if "天狗" in races: tags.append("天狗流")
        if "恶魔" in races or "悪魔" in races: tags.append("魔力")
        if "小人" in races: tags.append("小人族秘伝の味")
        if "妖精" in races: tags.append("生命力")
        if "付喪神" in races: tags.append("道具の共鳴")
        if "魔法使" in races: tags.append("魔力")
        if "女仆" in races or "女僕" in races: tags.append("女僕流")
        if talents and "母性" in talents: tags.append("母亲的味道")
        return list(set(tags))

class TagInteractionManager:
    @staticmethod
    def process_interactions(base_dish_tags, assistant_data):
        chara_tags = []
        if assistant_data:
            race_tags = RaceTagGenerator.get_tags_from_race(assistant_data.race, assistant_data.raw_talents)
            chara_tags.extend(race_tags)
            chara_tags.extend(assistant_data.tags)
        
        current_tags = list(base_dish_tags)
        
        def has_any(tags_to_check, tag_list): return any(t in tag_list for t in tags_to_check)
        def remove_all(tag, target_list): return [t for t in target_list if t != tag]
        def replace_tag(old_tag, new_tag, target_list): return [new_tag if t == old_tag else t for t in target_list]
        def add_tag(tag, target_list, times=1):
            for _ in range(times): target_list.append(tag)

        if "稗田家秘伝の味" in chara_tags and "和食" not in current_tags: chara_tags = [t for t in chara_tags if t != "稗田家秘伝の味"]
        if "切れ味" in chara_tags and not has_any(["野菜", "肉", "魚"], current_tags): chara_tags = [t for t in chara_tags if t != "切れ味"]
        if "美味的水" in chara_tags and not has_any(["鍋物", "汁物", "饮用", "扑鼻"], current_tags): chara_tags = [t for t in chara_tags if t != "美味的水"]
        if "大火力" in chara_tags and "冷" in current_tags: chara_tags = [t for t in chara_tags if t != "大火力"]
        if "氷結" in chara_tags and "温暖" in current_tags: chara_tags = [t for t in chara_tags if t != "氷結"]

        current_tags.extend(chara_tags)
        
        if "冥界風" in chara_tags and not has_any(["洋食", "中華"], current_tags): add_tag("和食", current_tags)
        if "地底風" in chara_tags and "冷" not in current_tags: add_tag("温暖", current_tags)
        if "月都風" in chara_tags and not has_any(["和食", "洋食"], current_tags): add_tag("中華", current_tags)
        if ("魔界風" in chara_tags or "夢幻風" in chara_tags) and not has_any(["和食", "中華"], current_tags): add_tag("洋食", current_tags)
        if "浓郁" in chara_tags and "濃厚" not in current_tags: add_tag("濃厚", current_tags)
        if "薄味" in chara_tags and "淡白" not in current_tags: add_tag("淡白", current_tags)
        if "大火力" in chara_tags and "冷" not in current_tags:
            add_tag("温暖", current_tags, 3); current_tags = remove_all("中立温度", current_tags)
        if "氷結" in chara_tags and "温暖" not in current_tags:
            add_tag("冷", current_tags, 3); current_tags = remove_all("中立温度", current_tags)

        if "天界風" in chara_tags:
            for k in ["質素", "野趣", "家庭的"]: current_tags = remove_all(k, current_tags)
        if "地獄風" in chara_tags or "畜生風" in chara_tags:
            for k in ["健康", "简易"]: current_tags = remove_all(k, current_tags)
        if "畜生風" in chara_tags:
            for k in ["淡白", "上品"]: current_tags = remove_all(k, current_tags)
        if "化学的" in chara_tags:
            for k in ["芸術的", "野趣"]: current_tags = remove_all(k, current_tags)
        if "稗田家秘伝の味" in chara_tags:
            for k in ["濃厚", "垃圾"]: current_tags = remove_all(k, current_tags)
        if "浓郁" in chara_tags: current_tags = remove_all("淡白", current_tags)
        if "薄味" in chara_tags: current_tags = remove_all("濃厚", current_tags)
        if "絢爛" in chara_tags:
            for k in ["質素", "野趣", "家庭的"]: current_tags = remove_all(k, current_tags)
        if "貧乏飯" in chara_tags:
            for k in ["上品", "新鲜", "豪華"]: current_tags = remove_all(k, current_tags)
        if "純化的味道" in chara_tags:
            for k in ["丰盛", "简易", "健康", "垃圾", "濃厚", "淡白"]: current_tags = remove_all(k, current_tags)

        if "心跳味" in chara_tags or "逆転" in chara_tags:
            if "甜" in current_tags: current_tags = replace_tag("甜", "辣", current_tags)
            elif "辣" in current_tags: current_tags = replace_tag("辣", "甜", current_tags)
            elif "咸" in current_tags: current_tags = replace_tag("咸", "酸", current_tags)
            elif "酸" in current_tags: current_tags = replace_tag("酸", "咸", current_tags)
        if "逆転" in chara_tags:
            pairs = [("简易", "丰盛"), ("健康", "垃圾"), ("濃厚", "淡白"), ("温暖", "冷")]
            for p1, p2 in pairs:
                if p1 in current_tags: current_tags = replace_tag(p1, p2, current_tags)
                elif p2 in current_tags: current_tags = replace_tag(p2, p1, current_tags)

        def reinforce(trigger, target, mult=1):
            if trigger in chara_tags and target in current_tags: add_tag(target, current_tags, mult)

        for t in ["健康", "家庭的", "上品", "芸術的"]: reinforce("女僕流", t)
        for t in ["和食", "質素", "野趣"]: reinforce("天狗流", t)
        for t in ["简易", "淡白"]: reinforce("冥界風", t)
        reinforce("地底風", "濃厚")
        if "地獄風" in chara_tags and "怪诞" in current_tags: add_tag("怪诞", current_tags, 2)
        for t in ["丰盛", "垃圾", "野趣", "豪快"]: reinforce("地獄風", t)
        for t in ["香料", "丰盛", "垃圾", "濃厚", "野趣", "豪快"]: reinforce("畜生流", t)
        for t in ["简易", "淡白"]: reinforce("月都風", t)
        for t in ["中華", "野菜"]: reinforce("玉兎流", t)
        for t in ["辣", "咸", "濃厚"]: reinforce("魔界風", t)
        for t in ["甜", "酸", "淡白"]: reinforce("夢幻風", t)
        for t in ["機能的", "垃圾"]: reinforce("外界風", t)
        for t in ["機能的", "垃圾", "健康"]: reinforce("化学的", t)
        for t in ["甜", "辣", "咸", "酸"]: 
            if "小人族秘伝の味" in chara_tags and t in current_tags: add_tag(t, current_tags, 2)
            if "純化的味道" in chara_tags and t in current_tags: add_tag(t, current_tags, 3)
            reinforce("心跳味", t)
        if "稗田家秘伝の味" in chara_tags and "健康" in current_tags: add_tag("健康", current_tags, 3)
        for t in ["和食", "淡白", "上品"]: reinforce("稗田家秘伝の味", t)
        if "母亲的味道" in chara_tags and "家庭的" in current_tags: add_tag("家庭的", current_tags, 3)
        for t in ["縁起物", "旬"]: reinforce("母亲的味道", t)
        for t in ["辣", "酸"]: 
            if "刺激的" in chara_tags and t in current_tags: add_tag(t, current_tags, 2)
        for t in ["新鲜", "豪華", "芸術的"]: reinforce("彩り", t)
        for t in ["上品", "新鲜", "豪華", "豪快"]: reinforce("絢爛", t)
        for t in ["質素", "野趣", "家庭的"]: reinforce("貧乏飯", t)

        return Counter(current_tags)

# ================= 3. 数据类定义 =================

class DishData:
    def __init__(self, id_num, name, dish_type, base_tags, allowed_ingredients, char_name=None):
        self.id = str(id_num)
        self.name = name
        self.type = dish_type
        self.base_tags = list(base_tags)
        self.allowed_ingredients = allowed_ingredients
        self.char_name = char_name 
        self.is_generic_type = (dish_type == "通用")

    def get_display_name(self):
        if self.type == "特制":
            c_name = self.char_name if self.char_name else "未知"
            # 修改：特制料理 ID + 400
            try:
                sp_id = int(self.id) + 400
            except:
                sp_id = self.id
            return f"[SP.{sp_id} {c_name}] {self.name}"
        return f"{self.id} {self.name}"

class AssistantData:
    def __init__(self, id_num, name, tags, race="未知", raw_talents=None):
        self.id = str(id_num)
        self.name = name
        self.tags = list(tags)
        self.race = race
        self.raw_talents = raw_talents if raw_talents else []

    def get_display_name(self):
        race_info = f"({self.race})" if self.race else ""
        return f"{self.name}{race_info}"

# ================= 4. 数据提取核心 =================

class RaceDataManager:
    def __init__(self):
        self.cwd = os.getcwd()
        self.char_csv_dir = os.path.join(self.cwd, "CSV", "Chara")
        self.race_map = RACE_DEFINITIONS

    def read_file_content(self, path):
        if not os.path.exists(path): return None
        for enc in ['utf-8', 'cp932', 'shift_jis', 'gbk']:
            try:
                with open(path, 'r', encoding=enc) as f: return f.read()
            except UnicodeDecodeError: continue
        return None

    def get_char_info(self, char_id):
        search_pattern = os.path.join(self.char_csv_dir, f"Chara{char_id} *.csv")
        files = glob.glob(search_pattern)
        if not files: files = glob.glob(os.path.join(self.char_csv_dir, f"Chara{char_id}*.csv"))
        if not files: return "未知", []
        content = self.read_file_content(files[0])
        if not content: return "读取失败", []

        races_found = []
        talents_found = []
        for line in content.splitlines():
            line = line.strip()
            if not line.startswith("素質"): continue
            parts = line.split(',') 
            if len(parts) < 3 and '\t' in line: parts = line.split('\t')
            if len(parts) >= 3:
                trait_name = parts[1].strip()
                try: trait_val = int(parts[2].split(';')[0].strip())
                except ValueError: continue
                if trait_val != 0: talents_found.append(trait_name)
                if trait_name in self.race_map:
                    sub_map = self.race_map[trait_name]
                    if trait_val in sub_map: races_found.append(sub_map[trait_val])
                    else: races_found.append(trait_name)
        if not races_found: return "不明", talents_found
        return "/".join(races_found), talents_found

class GameDataExtractor:
    def __init__(self):
        self.cwd = os.getcwd()
        self.cache_file = "料理列表和助手效果.txt"
        self.path_generic = os.path.join(self.cwd, "ERB", "コマンド関連", "COMF", "日常系", "DISHDATA.ERB")
        self.dir_char_data = os.path.join(self.cwd, "ERB", "キャラデータ")
        self.race_manager = RaceDataManager()
        
    def read_file_content(self, path):
        if not os.path.exists(path): return None
        for enc in ['utf-8', 'cp932', 'shift_jis', 'gbk']:
            try:
                with open(path, 'r', encoding=enc) as f: return f.read()
            except UnicodeDecodeError: continue
        return None

    def parse_tags(self, tag_str):
        if not tag_str: return []
        tag_str = tag_str.replace('"', '').replace("'", "").strip().replace(' + ', '')
        return [t.strip() for t in tag_str.split('/') if t.strip()]

    def parse_ingredients(self, call_str):
        if not call_str: return ["汎用"]
        clean_str = call_str.replace('"', '').replace("'", "").replace(" ", "")
        args = clean_str.split(',')
        ingredients = []
        arg1 = args[0] if len(args) > 0 else ""
        if arg1 in ["泛用", "汎用"]: ingredients.append("汎用")
        elif arg1 in ["鱼", "魚"]: ingredients.extend(["好吃的魚", "魚"])
        elif arg1 == "虫": ingredients.extend(["稀有昆虫", "虫"])
        elif arg1 == "卵": ingredients.extend(["卵", "奇妙な卵"])
        elif arg1 == "作成不能": return []
        else:
            for arg in args:
                if arg: ingredients.append(arg)
        return ingredients if ingredients else ["汎用"]

    def extract_generic_dishes(self):
        dishes = []
        content = self.read_file_content(self.path_generic)
        if not content: return dishes
        blocks = re.split(r'CASE\s+(\d+)', content)
        for i in range(1, len(blocks), 2):
            did = blocks[i]
            body = blocks[i+1]
            name_m = re.search(r'DISH_NAME\s*=\s*(.*)', body)
            if not name_m: continue
            taste_m = re.search(r'DISH_TASTE\s*=\s*(.*)', body)
            base_tags = self.parse_tags(taste_m.group(1)) if taste_m else []
            ing_m = re.search(r'CALL\s+材料設定\((.*)\)', body)
            ings = self.parse_ingredients(ing_m.group(1) if ing_m else "")
            dishes.append(DishData(did, name_m.group(1).strip(), "通用", base_tags, ings))
        return dishes

    def extract_char_data(self):
        special_dishes = []
        assistants = []
        if not os.path.exists(self.dir_char_data): return special_dishes, assistants
        files = glob.glob(os.path.join(self.dir_char_data, "*.ERB"))
        for filepath in files:
            content = self.read_file_content(filepath)
            if not content: continue
            filename = os.path.basename(filepath)
            f_match = re.search(r'(\d+)_(.+)\.ERB', filename, re.IGNORECASE)
            if not f_match: continue
            char_id = f_match.group(1)
            char_name = f_match.group(2)
            
            sp_menu_pattern = re.compile(r'@SPECIAL_MENU_(\d+)(.*?)DISH_COMMENT\s*=', re.DOTALL)
            for m in sp_menu_pattern.finditer(content):
                sp_id = m.group(1)
                body = m.group(2)
                name_m = re.search(r'DISH_NAME\s*=\s*(.*)', body)
                if not name_m: continue
                taste_m = re.search(r'DISH_TASTE\s*\+?=\s*(.*)', body)
                base_tags = self.parse_tags(taste_m.group(1)) if taste_m else []
                ing_m = re.search(r'CALL\s+材料設定\((.*)\)', body)
                ings = self.parse_ingredients(ing_m.group(1) if ing_m else "")
                special_dishes.append(DishData(sp_id, name_m.group(1).strip(), "特制", base_tags, ings, char_name))

            assist_pattern = re.search(r'CASE\s+"料理：助手効果"(.*?)CALLF\s+MAKE_STR\((.*)\)', content, re.DOTALL)
            if assist_pattern:
                args_part = assist_pattern.group(2)
                tag_match = re.search(r'"(.*?)"', args_part)
                if tag_match:
                    tags = self.parse_tags(tag_match.group(1))
                    if tags:
                        race, talents = self.race_manager.get_char_info(char_id)
                        assistants.append(AssistantData(char_id, char_name, tags, race, talents))
        return special_dishes, assistants

    def load_data(self):
        print("[系统] 开始从游戏源码提取数据...")
        g_dishes = self.extract_generic_dishes()
        s_dishes, assistants = self.extract_char_data()
        all_dishes = g_dishes + s_dishes
        
        def sort_key(obj):
            try: return int(obj.id)
            except: return 99999
        all_dishes.sort(key=sort_key)
        assistants.sort(key=sort_key)
        
        if all_dishes:
            print(f"[系统] 提取完成: 通用料理 {len(g_dishes)}, 特制料理 {len(s_dishes)}, 助手 {len(assistants)}")
            try:
                with open(self.cache_file, 'w', encoding='utf-8') as f:
                    f.write("=== [缓存] 料理列表和助手效果 ===\n\n")
                    f.write("--- 通用料理 ---\n")
                    for d in all_dishes:
                        if d.type == "通用": f.write(f"{d.id} {d.name} | {','.join(d.allowed_ingredients)} | {'/'.join(d.base_tags)}\n")
                    f.write("\n--- 特制料理 ---\n")
                    for d in all_dishes:
                        if d.type == "特制": f.write(f"{d.id} {d.char_name} | {d.name} | {','.join(d.allowed_ingredients)} | {'/'.join(d.base_tags)}\n")
                    f.write("\n--- 助手效果 ---\n")
                    for a in assistants:
                        derived = RaceTagGenerator.get_tags_from_race(a.race, a.raw_talents)
                        f.write(f"{a.id} {a.name} ({a.race}) | 助手效果:{'/'.join(a.tags)} | 种族效果:{'/'.join(derived)}\n")
                print(f"[系统] 数据已缓存至: {self.cache_file}")
            except Exception as e: print(f"[错误] 保存缓存失败: {e}")
        return all_dishes, assistants

# ================= 5. 计算主逻辑 =================

def calculate_score(dish, ingredient_name, assistant, target_set):
    base_tags = list(dish.base_tags)
    ing_tags = IngredientTagManager.get_derived_tags(ingredient_name, base_tags)
    base_tags.extend(ing_tags)
    final_stats = TagInteractionManager.process_interactions(base_tags, assistant)
    
    score = 0
    for target in target_set:
        if final_stats[target] > 0:
            score += 1
    return score

def solve_request(req_idx, target_tags_list, dishes, assistants):
    target_set = set(target_tags_list)
    logger.log(f"\n{'='*20} 委托 {req_idx} {'='*20}")
    logger.log(f"目标词条: {', '.join(target_set)}")
    
    # 临时字典用于聚合： Key=(DishID, Score)
    grouped_results = {}
    
    for dish in dishes:
        ingredients = dish.allowed_ingredients if dish.allowed_ingredients else ["汎用"]
        for ing in ingredients:
            # 1. 无助手
            s_no = calculate_score(dish, ing, None, target_set)
            if s_no > 0:
                k = (dish.id, s_no)
                if k not in grouped_results:
                    grouped_results[k] = {'dish': dish, 'score': s_no, 'ings': set(), 'assists': set()}
                grouped_results[k]['ings'].add(ing)
                grouped_results[k]['assists'].add("无") # 标记无助手
            
            # 2. 有助手
            for assist in assistants:
                s_yes = calculate_score(dish, ing, assist, target_set)
                if s_yes > 0:
                    k = (dish.id, s_yes)
                    if k not in grouped_results:
                        grouped_results[k] = {'dish': dish, 'score': s_yes, 'ings': set(), 'assists': set()}
                    grouped_results[k]['ings'].add(ing)
                    grouped_results[k]['assists'].add(assist.get_display_name())

    # 结果列表
    all_results = list(grouped_results.values())
    if not all_results:
        logger.log("[推荐]: 无符合条件的组合")
        return

    # 获取最高分
    max_score = max(r['score'] for r in all_results)
    
    # 辅助显示函数
    def print_item(res, indent="  "):
        d = res['dish']
        ings_str = ", ".join(sorted(list(res['ings'])))
        
        # 助手处理逻辑：如果包含 "无"，则说明不需要助手也能拿这个分
        assists_set = res['assists']
        if "无" in assists_set:
            assists_str = "无 (或任意)"
        else:
            assists_list = sorted(list(assists_set))
            assists_str = ", ".join(assists_list[:10])
            if len(assists_list) > 10:
                assists_str += f" ...等共{len(assists_list)}人"
                
        logger.log(f"{indent}★ {d.get_display_name()} [分:{res['score']}]")
        logger.log(f"{indent}   > 食材: {ings_str}")
        logger.log(f"{indent}   > 助手: {assists_str}")

    # === 第一部分：最佳选择 ===
    logger.log(f"\n一、最佳选择 (最高得分: {max_score})")
    # 筛选最高分
    best_list = [r for r in all_results if r['score'] == max_score]
    # 排序: 通用在前
    best_list.sort(key=lambda x: (x['dish'].is_generic_type, int(x['dish'].id) if x['dish'].id.isdigit() else 0), reverse=True)
    
    for res in best_list[:10]: # 限制显示数量，防止过多
        print_item(res)
    if len(best_list) > 10:
        logger.log(f"      ... (还有 {len(best_list)-10} 个同分方案)")

    # === 第二部分：非角色专属料理 (通用料理) ===
    # 逻辑：找出得分较高的通用料理 (Top 5)，排除已经在"最佳选择"中显示过的完全相同项吗？
    # 通常用户想看通用料理的排行，即使它在最佳里出现过，再列一次也无妨，或者列出次选。
    # 这里列出得分最高的5个通用料理组合
    
    logger.log(f"\n二、非角色专属料理 (Top 5)")
    generic_list = [r for r in all_results if r['dish'].is_generic_type]
    generic_list.sort(key=lambda x: x['score'], reverse=True)
    
    if not generic_list:
        logger.log("  无有效方案")
    else:
        shown_count = 0
        for res in generic_list:
            if shown_count >= 5: break
            print_item(res)
            shown_count += 1

    # === 第三部分：保底料理 ===
    # 逻辑：通用料理 + 汎用食材 + 无助手 + 得分最高
    logger.log(f"\n三、保底料理 (通用+汎用食材+无助手)")
    
    fallback_res = None
    fallback_score = -1
    
    # 重新在原始计算中找最纯粹的保底，或者在 grouped_results 中找
    # 在 grouped_results 中，key是(Dish, Score)。如果 'ings' 包含 '汎用' 且 'assists' 包含 '无'
    
    for res in all_results:
        if (res['dish'].is_generic_type and 
            "汎用" in res['ings'] and 
            "无" in res['assists']):
            
            if res['score'] > fallback_score:
                fallback_score = res['score']
                fallback_res = res
    
    if fallback_res:
        # 强制只显示汎用和无
        logger.log(f"  ★ {fallback_res['dish'].get_display_name()} [分:{fallback_res['score']}]")
        logger.log(f"     > 食材: 汎用")
        logger.log(f"     > 助手: 无")
    else:
        logger.log("  无完全匹配的保底方案")

# ================= 6. 主程序入口 =================

def main():
    logger.log("=== EraTW 料理计算器 (Pro版 v8 - 分块展示优化) ===\n")
    
    extractor = GameDataExtractor()
    dishes, assistants = extractor.load_data()
    
    if not dishes:
        logger.save_and_open()
        return

    log_file = None
    search_paths = ["*.log", "emuera*.log", "Log/*.log"]
    candidates = []
    for p in search_paths: candidates.extend(glob.glob(os.path.join(os.getcwd(), p)))
    if candidates: log_file = max(candidates, key=os.path.getmtime)

    if not log_file:
        logger.log("[错误] 未找到日志文件。")
        logger.save_and_open()
        return
        
    logger.log(f"[系统] 读取日志: {os.path.basename(log_file)}")
    
    requests = []
    try:
        with open(log_file, 'rb') as f: 
            raw = f.read()
            content = ""
            for enc in ['utf-8', 'cp932', 'gbk']:
                try: content = raw.decode(enc); break
                except: continue
            
            lines = content.splitlines()
            last_idx = -1
            for i, line in enumerate(lines):
                if "□ 日程表 □" in line: last_idx = i
            
            if last_idx != -1:
                for line in lines[last_idx:]:
                    if "要求的味道：" in line:
                        parts = line.split("要求的味道：")
                        if len(parts) > 1:
                            t_str = parts[1].replace('"', '').replace("'", "").strip()
                            requests.append([t.strip() for t in t_str.split('/') if t.strip()])
    except Exception as e:
        logger.log(f"[错误] 解析日志异常: {e}")

    if not requests:
        logger.log("[提示] 未在日志中找到有效委托。")
    else:
        for i, req in enumerate(requests):
            solve_request(i+1, req, dishes, assistants)
        
    logger.save_and_open()

if __name__ == "__main__":
    main()
