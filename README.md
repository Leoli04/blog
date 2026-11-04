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
├─ todo/                  待办：read.json（待看文章）+ content.json（待出稿）
├─ picks/                 收藏：读过还想再看的文章，items.json
├─ about/                 关于页
└─ public/                静态资源，favicon 等
tools/sync_posts.js       从 wechat-studio 同步文章
tools/lists.js            往三份清单里加条目 / 改状态
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

## 三份清单

数据都在 JSON 里，页面只是渲染。同一个 `url`（待出稿用标题）再跑一次是「改」不是「加」，
字段没变化就不写盘。

```bash
# 待看文章 —— 没读的链接
node tools/lists.js read <url> "为什么值得看" --tags=Agent,成本
node tools/lists.js read <url> --status=reading      # 开始读了
node tools/lists.js read <url> --status=done --digest=notes/<slug>/   # 读完，写上笔记

# 待出稿 —— 想写但还没写的选题
node tools/lists.js content "选题标题" "想说什么" --tags=Agent
node tools/lists.js content "选题标题" --status=drafting --draft=posts/<slug>/

# 收藏 —— 读完确认值得反复看的
node tools/lists.js pick <url> "下次什么事会让我想再打开它"
```

- 标题和来源会自动抓网页；抓不到就用域名兜底，也可以用 `--title=` `--source=` 手动给。
- 抓不到别硬凑，手动 `--title=` 一句准确的比自动抓的准。
- 站内路径写 `notes/xxx/`，**别带前导斜杠**：Git Bash 会把 `/notes/xxx/` 转成
  `C:/.../notes/xxx/` 写进 JSON。脚本会拦下来并报错，不会静默存成坏链接。

字段：

```json
// docs/todo/read.json
{
  "title": "文章标题",
  "url": "https://example.com/post",
  "source": "出处",
  "added": "2026-11-04",
  "status": "todo",        // todo / reading / done
  "why": "为什么值得看",
  "tags": ["Agent"],
  "digest": ""             // 读完写的笔记，站内路径
}

// docs/todo/content.json
{
  "title": "选题",
  "added": "2026-11-04",
  "status": "idea",        // idea / drafting / done
  "why": "想说什么",
  "tags": ["Agent"],
  "draft": ""              // 稿子在哪，站内路径；填了标题就变成链接
}

// docs/picks/items.json —— 字段同上，固定 status: "pick"，不用状态分组
```

`why` 是唯一不能省的东西。只存链接的清单，三个月后就是一堆打不开的书签。

排序：待看、待出稿按加入时间正序（先记的先做，不插队），已读、已发按时间倒序；
收藏按收藏时间倒序。超过 30 天没动的未完成条目会在页面上被标出来。

三者的分工：**待看**是还没读的，**收藏**是读完还值得再看的，**待出稿**是自己要写的。
一个链接先待在待看，读完再决定是进收藏还是删掉。

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
