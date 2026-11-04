import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import './custom.css'
import PostList from './PostList.vue'
import PendingList from './PendingList.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('PostList', PostList)
    app.component('PendingList', PendingList)
  },
} satisfies Theme
