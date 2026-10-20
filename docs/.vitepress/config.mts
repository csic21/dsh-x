import { defineConfig } from 'vitepress'

// The site is served from https://csic21.github.io/dsh-x/ by GitHub Pages, so
// every absolute asset and route needs the repository base path. Keep this in
// sync with the repository name if the project is ever renamed or moved.
export default defineConfig({
  lang: 'zh-CN',
  title: 'DSH-X',
  description: 'DeepSeek Harness 的可选插件库：安装、使用与开发文档',
  base: '/dsh-x/',
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: 'https://csic21.github.io/dsh-x/' },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/dsh-x/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#0b7285' }],
  ],
  themeConfig: {
    logo: '/favicon.svg',
    nav: [
      { text: '快速开始', link: '/guide/install' },
      { text: '插件', link: '/guide/plugins' },
      { text: '开发', link: '/dev/workspace' },
      { text: 'GitHub', link: 'https://github.com/csic21/dsh-x' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '使用',
          items: [
            { text: '快速开始', link: '/guide/install' },
            { text: '插件一览', link: '/guide/plugins' },
            { text: '桌面版', link: '/guide/desktop' },
            { text: '版本与兼容', link: '/guide/compatibility' },
            { text: '常见问题', link: '/guide/troubleshooting' },
          ],
        },
      ],
      '/dev/': [
        {
          text: '开发',
          items: [
            { text: '仓库与本地开发', link: '/dev/workspace' },
            { text: '插件路线', link: '/dev/roadmap' },
            { text: '浏览器与 CDP', link: '/dev/browser-cdp' },
            { text: '发布流程', link: '/dev/release' },
          ],
        },
      ],
    },
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一页', next: '下一页' },
    editLink: {
      pattern: 'https://github.com/csic21/dsh-x/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页',
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/csic21/dsh-x' }],
    search: { provider: 'local' },
    footer: {
      message: '只包含插件。官方内核、桌面应用与安装包不在本仓库。',
      copyright: '以仓库内 LICENSE 为准',
    },
  },
})
