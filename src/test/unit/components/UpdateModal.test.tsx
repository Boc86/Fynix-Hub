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
    const { container } = render(<UpdateModal percent={-10} onCancel={() => {}} />)
    const bar = container.querySelectorAll('div')[3]
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
    const { container } = render(<UpdateModal percent={50} onCancel={onCancel} />)
    // The backdrop is the outermost div
    const backdrop = container.firstElementChild as HTMLElement
    fireEvent.click(backdrop)
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('clicking inside modal card does NOT call onCancel (stopPropagation)', () => {
    const onCancel = vi.fn()
    render(<UpdateModal percent={50} onCancel={onCancel} />)
    // Click on the title (inside the card)
    fireEvent.click(screen.getByText('Downloading Update'))
    expect(onCancel).not.toHaveBeenCalled()
  })
})
