// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://sreenivas-sadhu-prabhakara.github.io',
  base: '/patternsmith',
  trailingSlash: 'ignore',
  build: {
    // Emit CSS as external files (never inline) so the strict CSP story
    // stays tidy. Inline <style> is still covered by style-src 'unsafe-inline'.
    inlineStylesheets: 'never',
  },
});
