# 贡献指南

感谢你关注 AetherDock。提交改动前，请先阅读本指南。

## 开始开发

```powershell
git clone https://github.com/machho18/aether-dock.git
cd aether-dock
npm ci
npm run start
```

项目目前面向 Windows x64，推荐使用 Node.js 24 或更高版本。

## 分支与提交

- 从 `master` 创建分支，例如 `feat/xxx`、`fix/xxx`、`docs/xxx`。
- 提交信息使用中文，并采用 `[类型]描述` 格式，例如 `[feat]支持批量导入资料`。
- 常用类型：`feat`、`fix`、`docs`、`chore`。
- 一个提交只处理一个清晰目标；不要混入格式化、构建产物或无关重构。

## 提交前检查

```powershell
npm run build
npm audit
```

若改动涉及 Electron 主进程或资料库逻辑，也请验证安装版或开发版的实际启动流程。

## Pull Request

- 说明改动目的、用户可见影响和验证方式。
- 涉及界面的改动请附截图或录屏。
- 涉及资料库、删除、迁移或卸载的改动，请说明数据安全边界与回滚方式。
- 不要提交资料库数据库、用户文件、缓存、密钥或个人路径。

## 代码约定

- 优先保持实现简单、可维护，并为重要逻辑补充简短中文注释。
- Vue 代码使用 Composition API；耗时文件操作仅在 Electron 主进程执行。
- 资料库目录中的文件不得被未经确认地删除或覆盖。
