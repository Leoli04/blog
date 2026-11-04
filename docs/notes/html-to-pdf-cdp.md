---
title: 用 CDP 把 HTML 打成 PDF，踩了三个坑
description: 脚本写完了文件却不退出、/json/list 返回的是数组、图片被分页从中间切开。三个都不报错，只是安静地错。
date: "2026-11-04"
tags: ["Node", "CDP", "PDF"]
---

要把公众号排版好的 HTML 存成 PDF，最省事的做法是走 Chrome DevTools Protocol 的 `Page.printToPDF`。不用装 Puppeteer，不用起服务，一个 Node 脚本连上去就行。

路径很短，坑不少，而且三个坑都是一样的性质：==不报错，只是结果不对==。

## 一、进程写完了文件，就是不退出

第一版脚本跑起来，终端没有任何输出，等满超时被外部杀掉。我以为内存炸了，还去查了 Chrome 的内存占用，白忙一轮。

真实原因是：`Page.printToPDF` 返回之后，我把文件写了，然后就走到脚本结尾。但 CDP 的 WebSocket 是长连接，只要它没关，Node 的事件循环就不会空，进程就一直挂着。

修法只有两行，放在收尾处。

```js
await cdp.send('Browser.close')
process.exit(0)
```

代价值得记：这个 bug 的表现是「无输出 + 被中断」，看起来像崩溃，实际上文件每次都已经写成功了。判断这类问题的顺序应该是先看产物在不在，再看日志。

## 二、`/json/list` 返回的不是对象

我照着 Puppeteer 的思路写：

```js
const { targetInfos } = await (await fetch('http://127.0.0.1:9333/json/list')).json()
```

`targetInfos` 是 `undefined`。因为 `/json/list` 返回的就是一个数组，包装在 `targetInfos` 里的是 CDP 的 `Target.getTargets` 命令，不是这个 HTTP 接口。

两个都行，但别混着用。

```js
// A. HTTP 接口，直接拿数组
const targets = await (await fetch('http://127.0.0.1:9333/json/list')).json()

// B. CDP 命令，拿 { targetInfos }
const { targetInfos } = await cdp.send('Target.getTargets')
```

我选了 B，因为同一个连接里拿 target、attach、发命令，比 HTTP 和 WebSocket 混着用少一层状态。

## 三、图片被从中间切成两页

默认打印出来的 PDF，三张图有两张被切在页边界上。这不是 CDP 的锅，是打印分页的默认行为。

打印前注入一段样式，让不可分割的元素整体挪到下一页。

```js
await cdp.send('Runtime.evaluate', {
  expression: `
    const s = document.createElement('style')
    s.textContent = \`
      img, table, pre, blockquote { break-inside: avoid; page-break-inside: avoid; }
      h2, h3 { break-after: avoid; page-break-after: avoid; }
      .content { padding: 0 !important; }
    \`
    document.head.appendChild(s)
  `,
})
```

`break-after: avoid` 这行是关键。标题单独留在页底、正文翻页，读起来比图被切开还难受。

## 一个容易被忽略的参数：宽度

`printToPDF` 的 `paperWidth` 单位是英寸，不是像素。网页是 96dpi，所以 677px 的正文宽度要这样换算：

```js
const inchW = 677 / 96          // ≈ 7.05
await cdp.send('Page.printToPDF', {
  paperWidth: inchW,
  paperHeight: 11.69,
  printBackground: true,        // 不传这个，所有底色都白掉
  marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
})
```

`printBackground` 默认是 false。公众号排版靠底色区分引用块和表格，不开这个参数，出来就是一份全白的文件。

## 收尾

三个坑有一个共同点：==错误都在产物里，不在报错里==。所以验证不能只看脚本退出码，得拆开 PDF 数页数、数图片对象：

```js
const s = fs.readFileSync(pdf).toString('latin1')
const pages = (s.match(/\/Type\s*\/Page[^s]/g) || []).length
const images = (s.match(/\/Subtype\s*\/Image/g) || []).length
```

页数对不上、图片数少于预期，就说明有问题。这一步花不了几秒，比事后翻页找茬划算。
