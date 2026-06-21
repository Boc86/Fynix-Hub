import React, { useEffect, useState } from 'react'
import Layout from './components/Layout/Layout'
import Browser from './components/Browser/Browser'
import DetailView from './components/DetailView/DetailView'
import VideoPlayer from './components/VideoPlayer/VideoPlayer'
import SearchModal from './components/SearchModal/SearchModal'
import Settings from './components/Settings/Settings'
import { useMediaStore } from './store/mediaStore'
import { useSettingsStore } from './store/settingsStore'

type View = 'browser' | 'detail' | 'player' | 'settings'

export default function App() {
  const [view, setView] = useState<View>('browser')
  const [searchOpen, setSearchOpen] = useState(false)
  const { loadFromDisk, tmdbApiKey } = useSettingsStore()

  useEffect(() => {
    loadFromDisk()
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (searchOpen) setSearchOpen(false)
        else if (view === 'detail') setView('browser')
        else if (view === 'settings') setView('browser')
        else if (view === 'player') setView('detail')
      }
      if (e.key === 'c' && !searchOpen) {
        setView((v) => (v === 'settings' ? 'browser' : 'settings'))
      }
      if (e.key === 's' && !searchOpen && view === 'browser') {
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [view, searchOpen])

  if (!tmdbApiKey) {
    return <Settings onClose={() => {}} initialOpen />
  }

  return (
    <Layout>
      {view === 'browser' && (
        <Browser
          onSelectMedia={() => setView('detail')}
          onPlay={() => setView('player')}
        />
      )}
      {view === 'detail' && (
        <DetailView
          onBack={() => setView('browser')}
          onPlay={() => setView('player')}
        />
      )}
      {view === 'player' && (
        <VideoPlayer
          onBack={() => setView('detail')}
          onNextEpisode={() => {}}
        />
      )}
      {view === 'settings' && (
        <Settings onClose={() => setView('browser')} />
      )}
      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onSelect={(media) => {
            setSearchOpen(false)
            useMediaStore.getState().setSelectedMedia(media as any)
            setView('detail')
          }}
        />
      )}
    </Layout>
  )
}
