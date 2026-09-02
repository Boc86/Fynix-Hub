import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'
import { MakerZIP } from '@electron-forge/maker-zip'
import { PublisherGithub } from '@electron-forge/publisher-github'
import { VitePlugin } from '@electron-forge/plugin-vite'
import path from 'path'

const PROJ_ROOT = __dirname

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Fynix Hub',
    executableName: 'fynix-hub',
    asar: {
      unpack: '**/*.node',
      unpackDir: 'assets/bin',
    },
    extraResource: path.join(__dirname, 'vyla-api-source'),
    ignore: [
      '.git',
      '.flatpak-builder',
      'flatpak-build',
      'node_modules/electron',
      '.vscode',
      'out',
    ],
  },
  makers: [
    new MakerDeb({
      options: {
        icon: path.join(PROJ_ROOT, 'assets', 'FLB-512.png'),
        categories: ['Video', 'AudioVideo'],
        mimeType: ['video/mp4', 'video/x-matroska'],
      },
    }),
    new MakerRpm({
      options: {
        icon: path.join(PROJ_ROOT, 'assets', 'FLB-512.png'),
        categories: ['Video', 'AudioVideo'],
      },
    }),
    new MakerZIP({}, ['linux']),
  ],
  publishers: [
    new PublisherGithub({
      repository: {
        owner: 'Boc86',
        name: 'Fynix-Hub',
      },
      draft: false,
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
