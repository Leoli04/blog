# Leo 的笔记

用 VitePress 搭的技术博客，部署在 GitHub Pages。

线上地址：https://leoli04.github.io/blog/

## 目录结构

```
docs/
├─ .vitepress/
│  ├─ config.mts          导航、搜索、站点信息
│  └─ theme/              工程蓝色板 + 文章列表组件
├─ posts/<slug>/          长文，一篇一个目录（含 imgs/）
├─ notes/                 短笔记，平铺的 md
└─ public/                静态资源，favicon 等
tools/sync_posts.js       从 wechat-studio 同步文章
```

## 本地开发

```bash
npm install
npm run dev        # http://localhost:5173/blog/
```

## 写一篇新文章

文章源文件不在这个仓库，在 `../wechat-studio/posts/<slug>/`。那边走完公众号流水线后：

```bash
npm run sync                # 同步全部
npm run sync -- --check     # 只看差异，不写文件
node tools/sync_posts.js <slug>   # 只同步一篇
```

同步是幂等的，内容没变就跳过，不碰 mtime。

新文章要在 `tools/sync_posts.js` 的 `CONFIG` 里加一行标签，不然 `tags` 是空的：

```js
const CONFIG = {
  'new-slug': { tags: ['模型选型', 'Agent'] },
}
```

日期取 `wechat-studio/posts/<slug>/meta.json` 的 `created` 字段。

## 写一篇笔记

直接在 `docs/notes/` 下建 md，frontmatter 至少要有 `title`：

```yaml
---
title: 标题
description: 一句话说明
date: "2026-11-04"
tags: ["Node"]
---
```

不用同步脚本，也不用手动加到列表，`notes.data.js` 会自动收集。

## 发布

push 到 `main` 就自动构建部署，Actions 大概跑 1 分钟。

```bash
git add -A
git commit -m "post: 文章标题"
git push
```

## 发布前自检

```bash
npm run build      # 有链接错误、组件错误会在这里报
npm run preview    # 本地预览构建产物
```

`build` 通过不代表排版正常，涉及样式的改动最好在 `dev` 里看一眼。
