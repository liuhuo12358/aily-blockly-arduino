---
name: Functional Issues(Build/Flash/Management)/功能性问题(编译、烧录及管理等)
about: Create a report to help us improve
title: ''
labels: bug
assignees: ''

---

**Basic Information/基本信息**
- Aily Blockly Version/软件版本:[0.0.1]
- Project Package Json/项目依赖包:
> Default path/默认路径: Your Documents\aily-project\project_xxx\package.json
```
{
  "name": "project_xxx",
  "version": "1.0.0",
  "description": "",
  "board": "ESP32 board",
  "dependencies": {
    "@aily-project/board-esp32": "3.3.1",
    "@aily-project/lib-blinker": "^1.0.0",
    "@aily-project/lib-core-io": "1.0.0",
    "@aily-project/lib-core-logic": "0.0.1",
    "@aily-project/lib-core-loop": "0.0.1",
    "@aily-project/lib-core-math": "0.0.1",
    "@aily-project/lib-core-serial": "0.0.1",
    "@aily-project/lib-core-text": "0.0.1",
    "@aily-project/lib-core-time": "0.0.1",
    "@aily-project/lib-core-variables": "1.0.1",
    "@aily-project/lib-dht": "^1.0.1"
  }
}
```
- Project.abi/项目源文件:
> Default path/默认路径: Your Documents\aily-project\project_xxx\project.abi
```
{
  "blocks": {
    "languageVersion": 0,
    "blocks": [
      {
        "type": "arduino_setup",
        "id": "arduino_setup_id0",
        "x": 30,
        "y": 30,
        "deletable": false
      },
      {
        "type": "arduino_loop",
        "id": "arduino_loop_id0",
        "x": 30,
        "y": 290,
        "deletable": false
      }
    ]
  }
}
```
- Error Logs or Bug Descriptions/报错日志内容或者问题描述:
```
Error Log if available/报错日志(如果有)
```
A clear and concise description of what the bug is/请清晰简洁的描述错误内容.
