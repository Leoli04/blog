import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import './custom.css'
import PostList from './PostList.vue'
import TodoReadList from './TodoReadList.vue'
import TodoContentList from './TodoContentList.vue'
import PickList from './PickList.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('PostList', PostList)
    app.component('TodoReadList', TodoReadList)
    app.component('TodoContentList', TodoContentList)
    app.component('PickList', PickList)
  },
} satisfies Theme
