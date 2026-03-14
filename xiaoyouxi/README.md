# 小游戏合集（纯静态版）

这是一个纯静态前端小游戏合集：HTML + 原生 JavaScript（ES Modules）+ CSS，无需安装依赖、无需构建。

包含大厅/房间页面，并支持“同一台设备、同一浏览器的多标签页/多窗口”进行本地联机（基于 BroadcastChannel / localStorage）。

## 运行方式

### Windows（推荐）

1. 在项目根目录打开 PowerShell
2. 运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1
```

3. 浏览器打开：

```
http://localhost:5173/
```

可指定端口：

```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1 -Port 8080
```

### 其他平台（可选）

这是纯静态站点，你也可以用任意静态服务器启动，例如：

```bash
python -m http.server 5173
```

然后访问 `http://localhost:5173/`。

## 联机说明（重要）

- 本项目的“联机”是本地联机：仅支持同一浏览器内的多标签/多窗口联机。
- 参与联机的所有窗口必须使用相同的 URL（同域名 + 同端口），例如都用 `http://localhost:5173/`。
  - 不要混用 `127.0.0.1` 与 `localhost`
  - 不要混用不同端口
- 如果你是直接双击 HTML（`file://`）打开，联机不可用，请用静态服务器打开。

## 目录结构

- `index.html`：大厅入口
- `room.html`：房间/匹配入口
- `static/`：所有 JS/CSS/资源
- `server.ps1`：本地静态服务器脚本（Windows）

## 游戏列表

以大厅页面展示为准，主要包含：

- 斗地主
- 麻将
- 你画我猜
- 飞行棋
- 反应测试
- 井字棋

## GitHub Pages（可选）

这是静态项目，可以直接使用 GitHub Pages 发布：

1. 推送仓库到 GitHub
2. 在仓库 Settings → Pages
3. 选择从 `main` 分支的 `/ (root)` 发布

发布后用 `https://<你的用户名>.github.io/<仓库名>/` 访问即可。
