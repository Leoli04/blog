import { defineConfig } from 'vitepress'
import mark from 'markdown-it-mark'

export default defineConfig({
  lang: 'zh-CN',
  title: 'Leo 的笔记',
  description: '模型选型、Agent 实践，以及踩过的坑。',
  base: '/blog/',
  cleanUrls: true,
  lastUpdated: true,

  sitemap: {
    hostname: 'https://leoli04.github.io/blog/',
  },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/blog/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#037ce6' }],
  ],

  markdown: {
    lineNumbers: true,
    image: { lazyLoading: true },
    config: (md) => {
      md.use(mark)
    },
  },

  themeConfig: {
    nav: [
      { text: '文章', link: '/posts/', activeMatch: '/posts/' },
      { text: '笔记', link: '/notes/', activeMatch: '/notes/' },
      { text: '关于', link: '/about' },
    ],

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索', buttonAriaLabel: '搜索' },
          modal: {
            noResultsText: '没有找到结果',
            resetButtonTitle: '清除',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭',
            },
          },
        },
      },
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/Leoli04' }],

    outline: { level: [2, 3], label: '本页目录' },

    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '最后更新' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '目录',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色',
    darkModeSwitchTitle: '切换到深色',

    footer: {
      message: '内容按 CC BY-NC 4.0 授权，转载请注明出处。',
      copyright: '© 2026 Leo',
    },
  },
})
