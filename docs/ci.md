# CI 配置

GitHub 对 `.github/workflows/` 下的文件有硬限制：推送它的 token 必须带 `workflow` scope。
本仓库发布时用的 token 只有 `repo` scope，所以这份配置暂存在这里。

## 启用方式（二选一）

**A. 网页新建**（最省事）：GitHub 仓库页 → Add file → Create new file → 路径填 `.github/workflows/test.yml` → 粘贴下面的内容 → Commit。

**B. 换 token**：生成带 `workflow` scope 的 PAT，然后

```bash
git add .github/workflows/test.yml
git commit -m "ci: 启用测试"
git push
```

## 配置内容

```yaml
name: test

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [22, 24]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - name: 跑六套测试
        run: |
          node tests/naming.test.mjs
          node tests/classify.test.mjs
          node tests/pipeline.test.mjs
          node tests/plugin.test.mjs
          node tests/chat-blocks.test.mjs
          node tests/routes.test.mjs
```

## 它做什么

在 Node 22 和 24 上各跑一遍六套测试（共 93 项断言）：

| 文件 | 覆盖 |
| --- | --- |
| `tests/naming.test.mjs` | 目录名清洗、长度截断、非法字符 |
| `tests/classify.test.mjs` | 六维度打分、七级路由、五级命名 |
| `tests/pipeline.test.mjs` | 端到端归档：建桶、去重、安全扫描、MANIFEST |
| `tests/plugin.test.mjs` | 插件生命周期、配置归一化 |
| `tests/chat-blocks.test.mjs` | 从聊天记录回取代码块前文 |
| `tests/routes.test.mjs` | 10 条 HTTP 路由注册 + import 完整性 |
