// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ContextMenu from '@/renderer/components/ContextMenu/ContextMenu'

const baseTarget = { type: 'movie' as const, tmdbId: 1, title: 'Test Movie' }
const tvTarget = { type: 'tv' as const, tmdbId: 2, title: 'Test Show' }
const epTarget = { type: 'episode' as const, tmdbId: 3, title: 'Test Ep', season: 1, episode: 5 }
const seasonTarget = { type: 'season' as const, tmdbId: 4, title: 'Test Season', season: 2 }

const handlers = {
  onClose: vi.fn(),
  onMarkWatched: vi.fn(),
  onMarkUnwatched: vi.fn(),
  onShowSources: vi.fn(),
  onResetProgress: vi.fn(),
  onDropShow: vi.fn(),
}

function renderMenu(target = baseTarget) {
  return render(<ContextMenu target={target} {...handlers} />)
}

describe('ContextMenu', () => {
  it('renders type label for movie', () => {
    renderMenu()
    expect(screen.getByText('Movie')).toBeInTheDocument()
    expect(screen.getByText('Test Movie')).toBeInTheDocument()
  })

  it('renders type label for tv', () => {
    renderMenu(tvTarget)
    expect(screen.getByText('TV Show')).toBeInTheDocument()
  })

  it('shows season/episode meta when provided', () => {
    renderMenu(epTarget)
    expect(screen.getByText(/S01/)).toBeInTheDocument()
    expect(screen.getByText(/E05/)).toBeInTheDocument()
  })

  it('shows season only (no episode)', () => {
    renderMenu(seasonTarget)
    expect(screen.getByText(/S02/)).toBeInTheDocument()
  })

  it('movie has Mark Watched, Mark Unwatched, Reset Progress, Show Sources', () => {
    renderMenu()
    expect(screen.getByText('Mark Watched')).toBeInTheDocument()
    expect(screen.getByText('Mark Unwatched')).toBeInTheDocument()
    expect(screen.getByText('Reset Progress')).toBeInTheDocument()
    expect(screen.getByText('Show Sources')).toBeInTheDocument()
    expect(screen.queryByText('Drop Show')).not.toBeInTheDocument()
  })

  it('tv has Drop Show but no Show Sources', () => {
    renderMenu(tvTarget)
    expect(screen.getByText('Drop Show')).toBeInTheDocument()
    expect(screen.queryByText('Show Sources')).not.toBeInTheDocument()
  })

  it('episode has Show Sources', () => {
    renderMenu(epTarget)
    expect(screen.getByText('Show Sources')).toBeInTheDocument()
    expect(screen.queryByText('Drop Show')).not.toBeInTheDocument()
  })

  it('clicking Mark Watched calls callback + onClose', () => {
    renderMenu()
    fireEvent.click(screen.getByText('Mark Watched'))
    expect(handlers.onMarkWatched).toHaveBeenCalledWith(baseTarget)
    expect(handlers.onClose).toHaveBeenCalled()
  })

  it('clicking overlay calls onClose', () => {
    const { container } = renderMenu()
    fireEvent.click(container.firstElementChild!)
    expect(handlers.onClose).toHaveBeenCalled()
  })

  it('Escape closes menu', () => {
    renderMenu()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handlers.onClose).toHaveBeenCalled()
  })
})
