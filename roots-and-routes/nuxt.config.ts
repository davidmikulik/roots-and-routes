import { defineNuxtConfig } from 'nuxt/config'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Build information, computed every time the app is built (and when the dev server starts), shown in Settings -> About.
// The number is the build time (UTC, YYYYMMDD.HHMM), so every build gets a new, increasing number; the commit
// tells which code it is. Vercel provides the commit in VERCEL_GIT_COMMIT_SHA; locally it comes from git.
const buildTime = new Date()
const pad = (value: number) => String(value).padStart(2, '0')
const gitCommit = (() => {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
})()
const buildInfo = {
  version: (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version,
  number: `${buildTime.getUTCFullYear()}${pad(buildTime.getUTCMonth() + 1)}${pad(buildTime.getUTCDate())}.${pad(buildTime.getUTCHours())}${pad(buildTime.getUTCMinutes())}`,
  time: buildTime.toISOString(),
  commit: (process.env.VERCEL_GIT_COMMIT_SHA || gitCommit).slice(0, 7),
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  srcDir: 'app/',
  serverDir: 'server',

  // TypeScript support
  typescript: {
    strict: true,
    typeCheck: true,
  },

  // Vue & TypeScript
  vue: {
    compilerOptions: {
      isCustomElement: (tag) => ['LMap', 'LTileLayer', 'LMarker', 'LPopup'].includes(tag),
    },
  },

  // Auto-import components
  components: {
    global: true,
    dirs: ['~/components'],
  },

  // Auto-import composables
  imports: {
    dirs: ['~~/composables', '~~/utils'],
  },

  // relatives-tree ships ES modules with extensionless imports, which Node cannot load; let the bundler process it
  build: {
    transpile: ['relatives-tree'],
  },

  // Modules
  modules: [
    '@nuxt/eslint',
    '@nuxtjs/color-mode',
    '@nuxtjs/tailwindcss',
  ],

  // Color mode for dark/light theme
  colorMode: {
    classSuffix: '',
    preference: 'system',
    fallback: 'light',
    hid: 'nuxt-color-mode-script',
    globalName: '__NUXT_COLOR_MODE__',
    componentName: 'ColorScheme',
  },

  // Runtime configuration
  runtimeConfig: {
    public: {
      appName: 'Roots & Routes',
      build: buildInfo,
      appDescription: 'Genealogy visualization application',
      map: {
        defaultCenter: [50.0755, 14.4378],
        defaultZoom: 7,
        tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    vercelBlob: {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    },
    gedcom: {
      maxFileSize: 10 * 1024 * 1024,
      uploadDir: 'uploads/gedcom',
    },
  },

  // SSR configuration
  ssr: true,

  // Deployment configuration
  nitro: {
    preset: 'vercel',
    prerender: {
      routes: ['/', '/map', '/tree', '/graph', '/gedcom'],
    },
    routeRules: {
      '/api/**': { headers: { 'cache-control': 'no-cache' } },
      '/gedcom': { headers: { 'cache-control': 'no-cache, no-store, must-revalidate' } },
      '/admin/**': { headers: { 'cache-control': 'no-cache, no-store, must-revalidate' } },
      '/**': { headers: { 'cache-control': 'public, max-age=3600' } },
    },
    serverAssets: [
      {
        dir: '~~/assets',
      },
    ],
    vercel: {
      regions: ['iad1'],
      functions: {
        memory: 3008,
        maxDuration: 60,
      },
    },
  },

  // App configuration
  app: {
    head: {
      title: 'Roots & Routes - Genealogy Visualization',
      meta: [
        { name: 'description', content: 'Visualize your family tree on maps with GEDCOM support' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { charset: 'utf-8' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      ],
    },
  },

  // Development server
  devServer: {
    port: 3000,
    host: 'localhost',
  },

  // CSS configuration
  css: [
    '~~/assets/css/main.css',
  ],

})
