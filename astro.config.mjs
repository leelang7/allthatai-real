// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  site: 'https://allthatai-real.vercel.app',
  trailingSlash: 'always',
  output: 'static',
  adapter: vercel({ webAnalytics: { enabled: false } }),
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [
    sitemap({
      changefreq: 'daily',
      priority: 0.7,
      lastmod: new Date(),
      filter: (page) => !page.endsWith('/search/') && !page.endsWith('/contact/'),
      serialize(item) {
        if (item.url.includes('/issues/')) {
          item.priority = 0.9;
          item.changefreq = 'daily';
        } else if (item.url.includes('/guides/')) {
          item.priority = 0.8;
          item.changefreq = 'weekly';
        } else if (item.url.includes('/tag/')) {
          item.priority = 0.5;
          item.changefreq = 'weekly';
        } else if (item.url === 'https://allthatai-real.vercel.app/') {
          item.priority = 1.0;
          item.changefreq = 'daily';
        }
        return item;
      },
    }),
  ],
});