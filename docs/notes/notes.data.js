import { createContentLoader } from 'vitepress'

export default createContentLoader('notes/*.md', {
  transform(raw) {
    return raw
      .filter((page) => page.url !== '/notes/' && !page.frontmatter.draft)
      .map((page) => ({
        url: page.url,
        title: page.frontmatter.title || '',
        description: page.frontmatter.description || '',
        date: page.frontmatter.date || '',
        tags: page.frontmatter.tags || [],
      }))
      .filter((p) => p.title)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  },
})
