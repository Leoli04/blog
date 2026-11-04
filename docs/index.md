---
layout: home

hero:
  name: Leo 的笔记
  text: 把想明白的写清楚
  tagline: 模型选型、Agent 实践，以及踩过的坑。

  actions:
    - theme: brand
      text: 读文章
      link: /posts/
    - theme: alt
      text: 零散笔记
      link: /notes/
---

<div class="home-wrap">

<h2 class="home-h2">最近写的</h2>

<PostList type="posts" :limit="6" />

<h2 class="home-h2">零散笔记</h2>

<PostList type="notes" :limit="4" />

<h2 class="home-h2">收藏</h2>

<PickList :limit="3" more />

</div>
