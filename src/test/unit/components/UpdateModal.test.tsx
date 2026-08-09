// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import UpdateModal from '@/renderer/components/UpdateModal/UpdateModal'

describe('UpdateModal', () => {
  it('renders the title', () => {
    render(<UpdateModal percent={0} onCancel={() => {}} />)
    expect(screen.getByText('Downloading Update')).toBeInTheDocument()
  })

  it('displays rounded percent', () => {
    render(<UpdateModal percent={33.7} onCancel={() => {}} />)
    expect(screen.getByText('34%')).toBeInTheDocument()
  })

  it('clamps negative percent bar width to 0', () => {
    render(<UpdateModal percent={-10} onCancel={() => {}} />)
    const bar = screen.getByTestId('update-progress-bar')
    expect(bar.style.width).toBe('0%')
    expect(screen.getByText('-10%')).toBeInTheDocument()
  })

  it('shows Installing state when percent >= 100', () => {
    render(<UpdateModal percent={150} onCancel={() => {}} />)
    expect(screen.getByText('Installing Update…')).toBeInTheDocument()
    expect(screen.getByText('Update complete — restarting…')).toBeInTheDocument()
    expect(screen.queryByText('150%')).not.toBeInTheDocument()
  })

  it('renders Hide button', () => {
    const onCancel = vi.fn()
    render(<UpdateModal percent={50} onCancel={onCancel} />)
    const btn = screen.getByText('Hide')
    fireEvent.click(btn)
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('clicking backdrop calls onCancel', () => {
    const onCancel = vi.fn()
    render(<UpdateModal percent={50} onCancel={onCancel} />)
    fireEvent.click(screen.getByTestId('update-modal-backdrop'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('clicking inside modal card does NOT call onCancel (stopPropagation)', () => {
    const onCancel = vi.fn()
    render(<UpdateModal percent={50} onCancel={onCancel} />)
    // Click on the title (inside the card)
    fireEvent.click(screen.getByText('Downloading Update'))
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('displays the current download speed', () => {
    render(<UpdateModal percent={50} speed={13_000_000} onCancel={() => {}} />)
    expect(screen.getByText('12.4 MB/s')).toBeInTheDocument()
  })

  it('hides speed when 0/undefined', () => {
    render(<UpdateModal percent={50} onCancel={() => {}} />)
    expect(screen.queryByText(/B\/s|KB\/s|MB\/s|GB\/s/)).not.toBeInTheDocument()
  })

  describe('keyboard navigation', () => {
    it('auto-focuses the action button on mount', () => {
      render(<UpdateModal percent={50} onCancel={() => {}} />)
      expect(screen.getByText('Hide')).toHaveFocus()
    })

    it('Escape calls onCancel and does not bubble to window', () => {
      const onCancel = vi.fn()
      const windowSpy = vi.fn()
      window.addEventListener('keydown', windowSpy)
      render(<UpdateModal percent={50} onCancel={onCancel} />)
      fireEvent.keyDown(screen.getByText('Hide'), { key: 'Escape' })
      expect(onCancel).toHaveBeenCalledOnce()
      expect(windowSpy).not.toHaveBeenCalled()
      window.removeEventListener('keydown', windowSpy)
    })

    it('Enter on the button is swallowed but NOT preventDefaulted (native click fires)', () => {
      const windowSpy = vi.fn()
      window.addEventListener('keydown', windowSpy)
      render(<UpdateModal percent={50} onCancel={() => {}} />)
      const notPrevented = fireEvent.keyDown(screen.getByText('Hide'), { key: 'Enter' })
      expect(notPrevented).toBe(true)
      expect(windowSpy).not.toHaveBeenCalled()
      window.removeEventListener('keydown', windowSpy)
    })

    it('Tab is trapped on the button (single-action modal)', () => {
      render(<UpdateModal percent={50} onCancel={() => {}} />)
      const btn = screen.getByText('Hide')
      btn.focus()
      fireEvent.keyDown(btn, { key: 'Tab' })
      expect(btn).toHaveFocus()
      fireEvent.keyDown(btn, { key: 'Tab', shiftKey: true })
      expect(btn).toHaveFocus()
    })
  })
})
