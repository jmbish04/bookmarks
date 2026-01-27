import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  adapter: cloudflare({
    imageService: 'cloudflare'
  }),
  integrations: [react(), tailwind()]
});
