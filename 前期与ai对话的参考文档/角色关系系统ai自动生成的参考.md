角色关系系统：内核做基础支撑，可选扩展，全场景可当条件
1. 定位与设计原则
关系是底层基础能力，但绝对不强制：
引擎内核只提供「关系存储、读取、计算」的基础接口，不强制任何模组必须用
模组作者想做丰富人际互动就配置，不想做就完全不用管，不会多出任何冗余字段
所有关系值都可以直接当条件用，无缝接入现有的条件表达式体系，口上、移动、剧情、战斗全能用
2. 存放位置
分两层，都在现有目录里，不新增复杂结构：

1. 全局关系类型定义：放在 definitions/relations.toml，定义有哪些关系种类（比如好感、师徒、仇恨、信任）

# definitions/relations.toml
types:
  favor:
    name: 好感度
    min: 0
    max: 100
    default: 30
  master_student:
    name: 师徒值
    min: 0
    max: 100
  hostility:
    name: 仇恨值
    min: 0
    max: 100

2. 单个角色的关系值：放在角色 base.toml 的 relations 字段里，和属性放在一起

# linghuchong/base.toml
base:
  hp: 500
  attack: 35
relations:
  岳不群:
    master_student: 80
    favor: 60
  岳灵珊:
    favor: 75
  田伯光:
    favor: 40
    hostility: 10

3. 怎么用？直接写进条件里

所有关系值都可以直接用在口上、行为、剧情、战斗的触发条件里，和属性判断写法完全一致，不用学新规则：

# 口上触发条件示例
conditions:
  - relation.岳不群.favor > 60  # 和岳不群好感高于60
  - location.id == "huashan_dating"

# 移动结伴条件示例
conditions:
  - relation.岳灵珊.favor >= 60
  - character.岳灵珊.current_location == current_location

4. 关键优势

可选不强制：不配置 relations 字段，游戏完全正常运行，不会报错、不会多出多余内容
全场景通用：一套关系值，口上、移动、剧情、战斗 AI 都能用，不用在多个地方重复配置
双向自动同步：引擎可以自动处理双向关系（比如你给令狐冲加了对岳灵珊的好感，岳灵珊那边自动同步对应数值），不用写两遍