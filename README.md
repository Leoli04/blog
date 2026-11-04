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
├─ notes/<slug>/          短笔记，同样是目录
├─ pending/               待消化清单，只有一个 items.json
├─ about/                 关于页
└─ public/                静态资源，favicon 等
tools/sync_posts.js       从 wechat-studio 同步文章
tools/add_pending.js      往待消化清单里加条目
```

每个页面都是 `目录/index.md` 的形式，URL 统一成 `/xxx/`。
这不是洁癖，是因为 GitHub Pages 不做 `/foo` → `/foo.html` 的映射，
用平铺 md 的话 `/notes/foo` 会 404。

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

新建 `docs/notes/<slug>/index.md`，frontmatter 至少要有 `title`：

```yaml
---
title: 标题
description: 一句话说明
date: "2026-11-04"
tags: ["Node"]
---
```

不用跑同步脚本，也不用手动加到列表，`notes.data.js` 会自动收集。

## 待消化清单

看到但还没读的文章放 `docs/pending/items.json`。加一条：

```bash
node tools/add_pending.js <url> "为什么值得读"
node tools/add_pending.js <url> "为什么值得读" --tags=Agent,成本
```

- 标题和来源会自动抓网页；抓不到就用域名兜底，也可以用 `--title=` `--source=` 手动给。
- 同一个 URL 再跑一次是「改」不是「加」，不会产生重复条目；字段没变化就不写盘。
- 读完标状态：`--status=reading` / `--status=done`。
- 写成笔记之后，加 `--digest=/notes/<slug>/`，清单里会出现跳转链接。

字段就这些：

```json
{
  "title": "文章标题",
  "url": "https://example.com/post",
  "source": "出处",
  "added": "2026-11-04",
  "status": "todo",        // todo / reading / done
  "why": "为什么值得读",
  "tags": ["Agent"],
  "digest": ""             // 消化完的笔记，站内路径
}
```

`why` 是这个清单唯一不能省的东西。只存链接的清单，三个月后就是一堆打不开的书签。

排序规则：待读和在读按加入时间正序（先看到的先读，新链接不插队），已消化按时间倒序。
超过 30 天没动的待读条目会在页面上被标出来。

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
