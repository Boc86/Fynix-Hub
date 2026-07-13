import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerFlatpak } from '@electron-forge/maker-flatpak'
import { VitePlugin } from '@electron-forge/plugin-vite'
import path from 'path'
import fs from 'fs-extra'

const ICON_SIZES = ['64', '128', '256', '512']

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Fynix Hub',
    executableName: 'fynix-hub',
    asar: {
      unpack: '**/*.node',
      unpackDir: 'assets/bin',
    },
    ignore: [
      '.git',
      '.flatpak-builder',
      'flatpak-build',
      'node_modules/electron',
      '.vscode',
      'out',
    ],
  },
  hooks: {
    postPackage: async (opts) => {
      const appDir = opts.outputPaths?.[0]
      if (!appDir) return

      const shareDir = path.join(appDir, 'share')
      const iconsDir = path.join(shareDir, 'icons', 'hicolor')
      const metainfoDir = path.join(shareDir, 'metainfo')

      fs.mkdirpSync(metainfoDir)
      fs.copyFileSync(
        path.join(__dirname, 'com.fynix.hub.metainfo.xml'),
        path.join(metainfoDir, 'com.fynix.hub.metainfo.xml'),
      )

      for (const size of ICON_SIZES) {
        const dest = path.join(iconsDir, `${size}x${size}`, 'apps', 'com.fynix.hub.png')
        const src = path.join(__dirname, 'assets', `FLB-${size}.png`)
        if (fs.existsSync(src)) {
          fs.mkdirpSync(path.dirname(dest))
          fs.copyFileSync(src, dest)
        }
      }
    },
  },
  makers: [
    new MakerFlatpak({
      options: {
        categories: ['Video', 'AudioVideo'],
        mimeType: ['video/mp4', 'video/x-matroska'],
        description: 'Fynix Hub - Media Hub with Netflix-like experience',
        id: 'com.fynix.hub',
        icon: {
          '512x512': path.join(__dirname, 'assets/FLB-512.png'),
          '256x256': path.join(__dirname, 'assets/FLB-256.png'),
          '128x128': path.join(__dirname, 'assets/FLB-128.png'),
          '64x64': path.join(__dirname, 'assets/FLB-64.png'),
        },
        base: 'org.electronjs.Electron2.BaseApp',
        baseVersion: '24.08',
        runtime: 'org.freedesktop.Platform',
        runtimeVersion: '24.08',
        sdk: 'org.freedesktop.Sdk',
        modules: [
          {
            name: 'metainfo-icons',
            buildsystem: 'simple',
            'build-commands': [
              'install -Dm644 com.fynix.hub.metainfo.xml /app/share/metainfo/com.fynix.hub.metainfo.xml',
              'for s in 64 128 256 512; do install -Dm644 FLB-$s.png /app/share/icons/hicolor/${s}x${s}/apps/com.fynix.hub.png; done',
            ],
            sources: [
              { type: 'file', path: 'com.fynix.hub.metainfo.xml' },
              ...ICON_SIZES.map(s => ({ type: 'file', path: `assets/FLB-${s}.png` })),
            ],
          },
        ],
        finishArgs: [
          '--share=network',
          '--socket=wayland',
          '--socket=pulseaudio',
          '--device=dri',
          '--filesystem=~/.config/fynix-hub:create',
          '--filesystem=home:ro',
          '--talk-name=org.freedesktop.DBus',
          '--talk-name=org.freedesktop.Notifications',
          '--talk-name=org.freedesktop.ScreenSaver',
          '--env=VYLA_API_KEY=VYLA_API_KEY',
        ]
      }
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
}

export default config