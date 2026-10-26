# pet-care 宠物养护记录 🐾

一个前后端完整的宠物养护记录应用：

- **后端**：Node.js + Express，提供 REST API，数据持久化在 `server/data.json`
- **前端**：原生 HTML / CSS / JavaScript（由后端静态托管），包含宠物档案、喂食记录、健康记录、疫苗提醒、体重曲线五个板块
- **端口**：3013

## 目录结构

```
pet-care/
├── package.json        # 依赖与启动脚本（npm start）
├── README.md
├── client/             # 前端
│   ├── index.html
│   ├── style.css
│   └── app.js
└── server/             # 后端
    ├── index.js        # Express 服务与 REST API
    └── data.json       # 数据文件（自动持久化，内置示例数据）
```

## 环境要求

- Node.js ≥ 16（本项目在 Node 22 下验证）

## 安装与启动

```bash
cd pet-care
npm install
npm start          # 等价于 node server/index.js，监听 3013 端口
```

然后浏览器打开 <http://localhost:3013>。

> 想换端口可以用环境变量：`PORT=4000 npm start`（默认 3013）。

## REST API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/pets | 宠物列表 |
| POST | /api/pets | 新增宠物 |
| PUT | /api/pets/:id | 修改宠物档案 |
| DELETE | /api/pets/:id | 删除宠物（连同其所有记录） |
| GET | /api/records?type=&petId= | 查询记录（type: feeding / health / vaccine / weight） |
| POST | /api/records | 新增记录 |
| PUT | /api/records/:id | 修改记录 |
| DELETE | /api/records/:id | 删除记录 |
| GET | /api/vaccines/reminders | 疫苗到期提醒（默认 30 天内到期或已过期会被标记） |
| GET | /api/health | 健康检查 |

### curl 示例

```bash
# 列出宠物
curl -s http://localhost:3013/api/pets

# 给旺财新增一条喂食记录
curl -s -X POST http://localhost:3013/api/records \
  -H 'Content-Type: application/json' \
  -d '{"petId":"pet-wangcai","type":"feeding","date":"2026-10-25","food":"犬粮","amount":"330g"}'

# 疫苗到期提醒
curl -s http://localhost:3013/api/vaccines/reminders
```

## 数据持久化

所有增删改都会立即写回 `server/data.json`，重启服务数据不丢。若该文件被删除，服务会在下次启动时自动重建一个空数据文件。

内置示例数据：2 只宠物（猫「咪咪」、狗「旺财」）以及若干喂食 / 健康 / 疫苗 / 体重记录。其中「旺财 · 犬四联」已过期、「咪咪 · 猫三联」将在 30 天内到期，打开「疫苗提醒」页即可看到三种提醒状态的效果。

## 前端功能

- **宠物档案**：新增 / 编辑 / 删除宠物，自动计算年龄并显示最新体重
- **喂食记录**：记录每次喂食的食物、分量、备注，可按宠物筛选
- **健康记录**：记录症状与处理方式，可按宠物筛选
- **疫苗提醒**：新增接种记录后自动生成到期提醒（已逾期 / 30 天内到期 / 正常三种状态徽标）
- **体重曲线**：Canvas 折线图展示体重变化，支持多宠物对比，也可按宠物单独查看
