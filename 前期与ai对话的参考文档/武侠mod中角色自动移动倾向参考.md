# behavior.yaml 移动倾向部分
movement:
  # 1. 活跃度：多久移动一次（数值越高越爱动，0=完全不动）
  activity: 0.7
  # 2. 常驻出没点（带权重，权重越高待的时间越长）
  home_locations:
    huashan_siguoya: 0.5    # 思过崖待50%的时间
    huashan_jianping: 0.3   # 剑坪待30%的时间
    huashan_tavern: 0.2     # 酒馆待20%的时间
  # 3. 时间规律（什么时间去哪）
  time_rules:
    - time: 20:00~23:00
      target: huashan_tavern
      weight: 0.9
    - time: 00:00~06:00
      target: huashan_bedroom
      weight: 1.0
  # 4. 结伴倾向：和谁关系好就大概率跟着走
  follow_bias:
    - target: 岳灵珊
      relation_threshold: 60  # 好感/关系值高于60就会结伴
      follow_chance: 0.4
    - target: 田伯光
      relation_threshold: 30
      follow_chance: 0.2

和现有体系的联动
完全通过引擎公共 API 读取地图、时间、关系数据，不侵入地图、战斗、对话等其他系统
移动触发的事件、台词，直接复用现有的条件表达式（比如 location.id == "huashan_tavern" 触发酒馆专属口上）
模组可以选择启用 / 禁用整个 AI 插件，也可以单个角色设置 activity: 0 让他固定不动，灵活度拉满