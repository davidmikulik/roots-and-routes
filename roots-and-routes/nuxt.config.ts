import { defineNuxtConfig } from 'nuxt/config'

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
      routes: ['/', '/map', '/tree', '/gedcom'],
    },
    routeRules: {
      '/api/**': { headers: { 'cache-control': 'no-cache' } },
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
        { rel: 'stylesheet', href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css' },
      ],
      script: [
        { src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', defer: true },
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
    '~~/assets/css/leaflet.css',
  ],

})
