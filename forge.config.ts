import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'
import { MakerFlatpak } from '@electron-forge/maker-flatpak'
import { VitePlugin } from '@electron-forge/plugin-vite'
import path from 'path'
import fs from 'fs-extra'

const ffmpegExtension = {
  'org.freedesktop.Platform.ffmpeg-full': {
    version: '24.08',
    directory: 'lib/ffmpeg',
    'add-ld-path': '.',
    'no-autodownload': false,
  },
}

const mpvExtension = {}

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Fynix Hub',
    executableName: 'fynix-hub',
    asar: {
      unpack: '*.node',
      unpackDir: 'assets/bin',
    },
    ignore: [
      /\.git($|\/)/,
      /node_modules\/(?:electron|$)($|\/)/,
      /\.vscode($|\/)/,
      /out($|\/)/,
    ],
  },
  hooks: {
    preMake: async () => {
      const nestedFsExtra = require('@malept/flatpak-bundler/node_modules/fs-extra')
      const origWriteJson = nestedFsExtra.writeJson
      nestedFsExtra.writeJson = async function patchedWriteJson (file, obj, opts, ...rest) {
        if (file.endsWith('manifest.json') && obj && obj.id === 'com.fynix.hub') {
          obj['add-extensions'] = { ...ffmpegExtension, ...mpvExtension }

          const metainfoSrc = path.join(__dirname, 'com.fynix.hub.metainfo.xml')
          const metainfoDest = path.join(path.dirname(file), 'com.fynix.hub.metainfo.xml')
          await fs.copy(metainfoSrc, metainfoDest)

           if (!obj.modules) obj.modules = []
           obj.modules.push({
             name: 'metainfo',
             buildsystem: 'simple',
             'build-commands': [
               'install -Dm644 com.fynix.hub.metainfo.xml /app/share/metainfo/com.fynix.hub.metainfo.xml',
               'mkdir -p /app/lib/ffmpeg'
             ],
             sources: [{
               type: 'file',
               path: 'com.fynix.hub.metainfo.xml'
             }]
           })
        }
        return origWriteJson.call(nestedFsExtra, file, obj, opts, ...rest)
      }

      // Global spawn wrapper to fix no-autodownload being dropped by flatpak-builder
      const cp = require('child_process')
      const fsExtra = require('fs-extra')
      const pathModule = require('path')
      const origSpawn = cp.spawn
      let builderCount = 0
      cp.spawn = function (cmd, args, opts) {
        const child = origSpawn.call(cp, cmd, args, opts)
        if (cmd === 'flatpak-builder') {
          const buildDir = args[args.length - 2]
          const origOn = child.on.bind(child)
          child.on = function (event, listener) {
            if (event === 'close') {
              return origOn(event, async (code) => {
                builderCount++
                if (code === 0 && builderCount >= 2) {
                  try {
                    const mp = pathModule.join(buildDir, 'metadata')
                    if (fsExtra.existsSync(mp)) {
                      let c = fsExtra.readFileSync(mp, 'utf8')
                      const lines = c.split('\n')
                      let modified = false
                      for (let i = 0; i < lines.length; i++) {
                        if (lines[i].startsWith('[Extension ') && !lines[i].includes('Debug')) {
                          let hasNoAuto = false
                          for (let j = i + 1; j < lines.length && lines[j].trim() !== ''; j++) {
                            if (lines[j].includes('no-autodownload')) { hasNoAuto = true; break }
                          }
                          if (!hasNoAuto) {
                            lines.splice(i + 1, 0, 'no-autodownload=false')
                            modified = true
                          }
                        }
                      }
                      if (modified) fsExtra.writeFileSync(mp, lines.join('\n'), 'utf8')
                    }
                  } catch (e) { console.error('Metadata patch failed:', e) }
                }
                listener(code)
              })
            }
            return origOn(event, listener)
          }
        }
        return child
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
