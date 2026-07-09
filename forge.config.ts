import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerFlatpak } from '@electron-forge/maker-flatpak'
import { VitePlugin } from '@electron-forge/plugin-vite'
import path from 'path'

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
      'node_modules/electron',
      '.vscode',
      'out',
    ],
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
        modules: [],
        finishArgs: [
          '--share=network',
          '--socket=wayland',
          '--socket=pulseaudio',
          '--device=dri',
          '--filesystem=~/.config/fynix-hub:create',
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