import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'
import { MakerFlatpak } from '@electron-forge/maker-flatpak'
import { VitePlugin } from '@electron-forge/plugin-vite'

const ffmpegExtension = {
  'org.freedesktop.Platform.ffmpeg': {
    version: '24.08',
    directory: 'lib/ffmpeg',
    'add-ld-path': 'lib',
    'merge-dirs': 'lib/ffmpeg',
    subdirectories: true,
    'no-autodownload': false,
  },
}

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Fynix Hub',
    executableName: 'fynix-hub',
    asar: {
      unpack: '*.node',
    },
    ignore: (file: string) => {
      if (!file) return false
      if (file.startsWith('/.vite')) return false
      if (file.startsWith('/node_modules')) return false
      if (file.startsWith('/bin')) return false
      return true
    },
  },
  hooks: {
    preMake: async () => {
      const nestedFsExtra = require('@malept/flatpak-bundler/node_modules/fs-extra')
      const origWriteJson = nestedFsExtra.writeJson
      nestedFsExtra.writeJson = async function patchedWriteJson (file, obj, opts, ...rest) {
        if (file.endsWith('manifest.json') && obj && obj.id === 'com.fynix.hub') {
          obj['add-extensions'] = ffmpegExtension
        }
        return origWriteJson.call(nestedFsExtra, file, obj, opts, ...rest)
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
          '512x512': '/home/boc/Documents/Fynix Media Hub/fynix-hub/assets/FLB-512.png',
          '256x256': '/home/boc/Documents/Fynix Media Hub/fynix-hub/assets/FLB-256.png',
          '128x128': '/home/boc/Documents/Fynix Media Hub/fynix-hub/assets/FLB-128.png',
          '64x64': '/home/boc/Documents/Fynix Media Hub/fynix-hub/assets/FLB-64.png',
        },
        base: 'org.electronjs.Electron2.BaseApp',
        baseVersion: '24.08',
        runtime: 'org.freedesktop.Platform',
        runtimeVersion: '24.08',
        sdk: 'org.freedesktop.Sdk',
        modules: [],
        finishArgs: [
          '--share=network',
          '--share=ipc',
          '--socket=x11',
          '--socket=wayland',
          '--socket=pulseaudio',
          '--socket=session-bus',
          '--filesystem=home',
          '--device=dri',
          '--talk-name=org.freedesktop.Flatpak',
          '--talk-name=org.freedesktop.DBus',
          '--env=ELECTRON_OZONE_PLATFORM_HINT=x11',
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
