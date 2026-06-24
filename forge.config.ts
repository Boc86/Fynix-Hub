import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'
import { MakerFlatpak } from '@electron-forge/maker-flatpak'
import { VitePlugin } from '@electron-forge/plugin-vite'

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
      return true
    },
  },
  makers: [
    // new MakerSquirrel({}),
    // new MakerDeb({}),
    // new MakerRpm({}),
    new MakerFlatpak({
      options: {
        categories: ['Video', 'AudioVideo'],
        mimeType: ['video/mp4', 'video/x-matroska'],
        description: 'Fynix Hub - Media Hub with Netflix-like experience',
        id: 'com.fynix.hub',
        icon: '/home/boc/Documents/Fynix Media Hub/fynix-hub/assets/FLB.png',
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
