# 位置 tag 对照总表（location-tags）

> L1.6 指令复刻配套文档。规则（spec §6/§7 + SOP §4/§7）：
> - 只有 erArk 指令自带 `IN_*` / `POSITION_IN_*` 位置前提的才需要 tag；**没有位置前提的指令默认全地点可用，不写**
> - 位置前提**一律**从 premises 移除 → 改 `condition = "location.tags.has_xxx == true"`，**禁止**注册 IN_* handler
> - `PLACE_FURNITURE_GE_N`（家具数）/ `PLACE_DOOR_*`（门）→ 保留地点字段（furniture_count/door），**不** tag 化
> - 写地点 TOML 时（武侠 mod 地图），按本表给地点打 tag
>
> 本表由 InstructConfig.csv premise_set 全量扫描生成（2026-08-07）。

## 对照表

| erArk 位置前提 | 建议 tag | 使用指令（cid） | 保留状态 |
|---------------|----------|-----------------|----------|
| IN_BATHROOM | `has_bathroom` | 1015 淋浴 / 5019 邀浴 / 5049 浴室H | 保留（B1/B2） |
| IN_KITCHEN | `has_kitchen` | 1035 | 待批次核对 |
| IN_KITCHEN_OR_IN_DR_ROOM_AND_DR_ROOM_LEVEL_GE_2 | `has_kitchen`（DR_ROOM_LEVEL 条件无法 tag 化，批次降级处理）| 1009 做饭 | 保留（B1） |
| IN_DORMITORY_OR_HOTEL | `has_bedroom` | 1013 / 1014 睡觉 | 保留（B1，L1.7） |
| IN_H_SHOP | `has_h_shop` | 1016 购买成人用品 | 保留（B1） |
| IN_FOOD_SHOP | `has_food_shop` | 1017 购买食物 | 保留（B1，CSV 核对） |
| IN_TAKE_FOOD | `has_canteen` | 1011 放入自制食物 | 保留（B1） |
| IN_TOILET_MAN | `has_toilet` | 1029 | 待批次核对 |
| IN_LOVE_HOTEL | `has_love_hotel` | 1032 / 5048 | 待批次核对 |
| IN_LIBRARY | `has_library` | 3006 | 保留（B1，CSV 核对） |
| IN_GYM_ROOM | `has_gym` | 3005 锻炼 | 保留（B1） |
| IN_BAR | `has_bar` | 2036 调酒 / 3018 | 保留（B1） |
| IN_HUMILIATION_ROOM | `has_humiliation_room` | 6508/6509 灌肠 / 6512 滴蜡 / 6513 鞭子 / 6514 | 保留（sex 批） |
| IN_HUMILIATION_ROOM_OR_DR_ROOM | `has_humiliation_room` | 6422/6423 搾乳机 / 6504/6505 眼罩 / 6506/6507 口球 / 6424 | 保留（sex 批） |
| IN_PRISON | `has_prison` | 5038 / 5039 | 砍掉（监狱系统未做） |
| IN_LOCKER_ROOM_OR_DORMITORY | `has_locker_room` | 5040 | 未保留 |
| IN_ONSEN | `has_onsen` | 3029 | 未保留（PLAY 仅留 5 条） |
| IN_SAUNA | `has_sauna` | 3027 | 未保留 |
| IN_SWIMMING_POOL | `has_pool` | 3017 | 未保留 |
| IN_FOOT_BATH | `has_foot_bath` | 3026 | 未保留 |
| IN_SPA_ROOM | `has_spa` | 3028 | 未保留 |
| IN_CAFÉ | `has_cafe` | 3020（编码损坏条目）| 砍掉（编码损坏） |
| IN_BOARD_GAMES_ROOM | `has_board_games` | 3011/3012 下棋/3013/3014 | 保留（B1，3012） |
| IN_FAIRY_BANQUET | `has_banquet` | 3015 | 未保留 |
| IN_TEAHOUSE | `has_teahouse` | 3019 | 未保留 |
| IN_WALYRIA_CAKE_SHOP | `has_cake_shop` | 3021 | 未保留 |
| IN_RESTAURANT | `has_restaurant` | 3022 | 未保留 |
| IN_GOLDEN_GAME_ROOM | `has_gambling_room` | 3023 | 未保留 |
| IN_HAIR_SALON | `has_hair_salon` | 3024 | 未保留 |
| IN_STYLING_STUDIO | `has_styling_studio` | 3025 | 未保留 |
| IN_AVANT_GARDE_ARCADE | `has_arcade` | 3016 | 未保留 |
| IN_MULTIMEDIA_ROOM | `has_multimedia_room` | 3008 | 未保留 |
| IN_PHOTOGRAPHY_STUDIO | `has_photo_studio` | 3009 | 未保留 |
| IN_AQUAPIT_EXPERIENTIORIUM | `has_aquarium` | 3010 | 未保留 |
| IN_AROMATHERAPY_ROOM | `has_aromatherapy` | 3030 | 砍掉（香薰系统未做） |
| IN_CLASS_ROOM | `has_classroom` | 2010 授课 | 砍掉（授课未保留） |
| IN_CLINIC | `has_clinic` | 2005 治疗 | 砍掉 |
| IN_MEDICAL_OFFICE | `has_medical_office` | 2006 | 砍掉 |
| IN_TRAINING_ROOM | `has_training_room` | 2004 训练 | 砍掉 |
| IN_BUILDING_ROOM | `has_building_room` | 2017 维修 | 砍掉 |
| IN_PRODUCTION_WORKSHOP | `has_workshop` | 2024 制造 | 砍掉 |
| IN_HERB_GARDEN | `has_herb_garden` | 2026 采集 | 砍掉 |
| IN_HERB_GARDEN_OR_GREENHOUSE | `has_herb_garden` | 2025 种植 | 保留（B1，合并 tag） |
| IN_FIELD_ASSEMBLY_POINT | `has_field_post` | 2003 野外委托 | 砍掉 |
| IN_GARAGE | `has_garage` | 2027 载具 | 砍掉 |
| IN_BLACKSMITH_SHOP | `has_blacksmith` | 2014/2015 | 砍掉 |
| IN_COLLECTION_ROOM | `has_collection_room` | 1030/1033/1034 | 砍掉（收藏系统未做） |
| IN_COMMAND_ROOM | `has_command_room` | 2002 | 砍掉 |
| IN_COMMAND_ROOM_OR_OUT_EXIT | `has_command_room` | 2032 | 砍掉 |
| IN_DR_OFFICE | `has_dr_office` | 2001/2008/2016/2051 | 砍掉 |
| IN_DR_OFF_OR_SERVER_ROOM_OR_DEBUG | `has_dr_office` | 2022 | 砍掉 |
| IN_HR_OFFICE | `has_hr_office` | 2007/2009 | 砍掉 |
| IN_DIPLOMATIC_OFFICE | `has_diplomatic_office` | 2018/2019/2020 | 砍掉（外交未做） |
| IN_DORMITORY_MANAGER_ROOM | `has_dorm_manager_room` | 2033/2034/2035 | 砍掉 |
| IN_ANY_DORMITORY | `has_bedroom` | 2034 | 砍掉 |
| IN_RESOURCE_EXCHANGE | `has_resource_exchange` | 2030/2031 | 砍掉 |
| IN_POWER_DISPATCH | `has_power_dispatch` | 2012/2013 | 砍掉（人力发电明确不做） |
| IN_PHYSICAL_EXAMINATION | `has_phys_exam_room` | 2028 | 砍掉 |
| IN_ANY_MAINTENANCE_PLACE | `has_maintenance` | 2011 | 砍掉 |
| IN_LIBRARY_OR_LIBRARY_OFFICE | `has_library` | 2023 | 砍掉 |
| POSITION_IN_IN_NURSERY_AND_FLAG_BABY_EXIST | （育儿系统未做，不 tag 化）| 1031 | 砍掉 |

## 保留指令实际用到的 tag（写地点 TOML 时对照）

| tag | 用到的保留指令 | 批次 |
|-----|---------------|------|
| `has_kitchen` | make_food | B1 |
| `has_bedroom` | sleep（L1.7 就寝相关）| B1 |
| `has_h_shop` | buy_h_item | B1 |
| `has_food_shop` | buy_food | B1 |
| `has_canteen` | put_selfmade_food_in | B1 |
| `has_gym` | exercise | B1 |
| `has_library` | read_book | B1 |
| `has_bar` | mixology | B1 |
| `has_board_games` | play_chess | B1 |
| `has_herb_garden` | plant_manage_crop | B1 |
| `has_bathroom` | take_shower / invite_to_bath / do_h_in_bathroom | B1/B2 |
| `has_humiliation_room` | 搾乳机 / 眼罩 / 口球 / 灌肠 / 滴蜡 / 鞭子 | sex 批 |
| `has_toilet` / `has_love_hotel` / `has_locker_room` | 待批次核对 | B2+ |

> ⚠️ CSV 与 keep-list 有 2 处 cid 出入（1017 buy_food 带 IN_FOOD_SHOP、读书/下棋类 cid 偏移），写批次清单时逐条核对 InstructConfig.csv 原行。
