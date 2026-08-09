// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Prompt, { Confirm } from '@/renderer/components/Prompt/Prompt'

describe('Prompt', () => {
  it('renders title and message', () => {
    render(<Prompt title="Enter Name" message="Please type" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Enter Name')).toBeInTheDocument()
    expect(screen.getByText('Please type')).toBeInTheDocument()
  })

  it('shows default value in input', () => {
    render(<Prompt title="T" defaultValue="hello" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByDisplayValue('hello')).toBeInTheDocument()
  })

  it('Enter with value calls onConfirm with trimmed value', () => {
    const onConfirm = vi.fn()
    render(<Prompt title="T" onConfirm={onConfirm} onCancel={vi.fn()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '  test  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledWith('test')
  })

  it('Enter with empty input does NOT call onConfirm', () => {
    const onConfirm = vi.fn()
    render(<Prompt title="T" onConfirm={onConfirm} onCancel={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('Escape calls onCancel', () => {
    const onCancel = vi.fn()
    render(<Prompt title="T" onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('Cancel button calls onCancel', () => {
    const onCancel = vi.fn()
    render(<Prompt title="T" onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('OK button with value calls onConfirm', () => {
    const onConfirm = vi.fn()
    render(<Prompt title="T" onConfirm={onConfirm} onCancel={vi.fn()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'name' } })
    fireEvent.click(screen.getByText('OK'))
    expect(onConfirm).toHaveBeenCalledWith('name')
  })

  it('OK button is disabled when input is empty', () => {
    render(<Prompt title="T" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('OK')).toBeDisabled()
  })

  it('shows custom labels', () => {
    render(<Prompt title="T" confirmLabel="Save" cancelLabel="Nope" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Save')).toBeInTheDocument()
    expect(screen.getByText('Nope')).toBeInTheDocument()
  })

  it('clicking backdrop calls onCancel', () => {
    const onCancel = vi.fn()
    render(<Prompt title="T" onConfirm={vi.fn()} onCancel={onCancel} />)
    // Prompt is portaled to document.body — the backdrop is the fixed overlay
    // containing the dialog (its onClick closes).
    const backdrop = document.querySelector('[style*="position: fixed"]')!
    fireEvent.click(backdrop)
    expect(onCancel).toHaveBeenCalled()
  })

  describe('keyboard navigation', () => {
    it('auto-focuses the input on mount', () => {
      render(<Prompt title="T" onConfirm={vi.fn()} onCancel={vi.fn()} />)
      expect(screen.getByRole('textbox')).toHaveFocus()
    })

    it('Escape on a button (focus not on input) calls onCancel', () => {
      const onCancel = vi.fn()
      render(<Prompt title="T" onConfirm={vi.fn()} onCancel={onCancel} />)
      screen.getByText('Cancel').focus()
      fireEvent.keyDown(screen.getByText('Cancel'), { key: 'Escape' })
      expect(onCancel).toHaveBeenCalledOnce()
    })

    it('keys do not leak to the window while open (\'s\' swallowed)', () => {
      const windowSpy = vi.fn()
      window.addEventListener('keydown', windowSpy)
      render(<Prompt title="T" onConfirm={vi.fn()} onCancel={vi.fn()} />)
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 's' })
      expect(windowSpy).not.toHaveBeenCalled()
      window.removeEventListener('keydown', windowSpy)
    })

    it('Tab wraps from the OK button back to the input (focus trap)', () => {
      render(<Prompt title="T" defaultValue="x" onConfirm={vi.fn()} onCancel={vi.fn()} />)
      const ok = screen.getByText('OK')
      const input = screen.getByRole('textbox')
      ok.focus()
      fireEvent.keyDown(ok, { key: 'Tab' })
      expect(input).toHaveFocus()
    })
  })
})

describe('Confirm', () => {
  it('renders title and message', () => {
    render(<Confirm title="Delete?" message="Are you sure" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Delete?')).toBeInTheDocument()
    expect(screen.getByText('Are you sure')).toBeInTheDocument()
  })

  it('OK calls onConfirm', () => {
    const onConfirm = vi.fn()
    render(<Confirm title="T" onConfirm={onConfirm} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByText('OK'))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('Cancel calls onCancel', () => {
    const onCancel = vi.fn()
    render(<Confirm title="T" onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows custom labels', () => {
    render(<Confirm title="T" confirmLabel="Yes" cancelLabel="No" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Yes')).toBeInTheDocument()
    expect(screen.getByText('No')).toBeInTheDocument()
  })

  it('clicking backdrop calls onCancel', () => {
    const onCancel = vi.fn()
    render(<Confirm title="T" onConfirm={vi.fn()} onCancel={onCancel} />)
    // Confirm is portaled to document.body — the backdrop is the fixed overlay
    // containing the dialog (its onClick closes).
    const backdrop = document.querySelector('[style*="position: fixed"]')!
    fireEvent.click(backdrop)
    expect(onCancel).toHaveBeenCalled()
  })

  describe('keyboard navigation', () => {
    it('Escape calls onCancel and does not bubble to window', () => {
      const onCancel = vi.fn()
      const windowSpy = vi.fn()
      window.addEventListener('keydown', windowSpy)
      render(<Confirm title="T" onConfirm={vi.fn()} onCancel={onCancel} />)
      fireEvent.keyDown(screen.getByText('Cancel'), { key: 'Escape' })
      expect(onCancel).toHaveBeenCalledOnce()
      expect(windowSpy).not.toHaveBeenCalled()
      window.removeEventListener('keydown', windowSpy)
    })

    it('keys do not leak to the window while open (\'s\' swallowed)', () => {
      const windowSpy = vi.fn()
      window.addEventListener('keydown', windowSpy)
      render(<Confirm title="T" onConfirm={vi.fn()} onCancel={vi.fn()} />)
      fireEvent.keyDown(screen.getByText('Cancel'), { key: 's' })
      expect(windowSpy).not.toHaveBeenCalled()
      window.removeEventListener('keydown', windowSpy)
    })

    it('Tab wraps from OK back to Cancel (focus trap)', () => {
      render(<Confirm title="T" onConfirm={vi.fn()} onCancel={vi.fn()} />)
      const ok = screen.getByText('OK')
      const cancel = screen.getByText('Cancel')
      ok.focus()
      fireEvent.keyDown(ok, { key: 'Tab' })
      expect(cancel).toHaveFocus()
      fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true })
      expect(ok).toHaveFocus()
    })

    it('Enter on the focused button is swallowed but NOT preventDefaulted', () => {
      const windowSpy = vi.fn()
      window.addEventListener('keydown', windowSpy)
      render(<Confirm title="T" onConfirm={vi.fn()} onCancel={vi.fn()} />)
      const notPrevented = fireEvent.keyDown(screen.getByText('Cancel'), { key: 'Enter' })
      expect(notPrevented).toBe(true)
      expect(windowSpy).not.toHaveBeenCalled()
      window.removeEventListener('keydown', windowSpy)
    })
  })
})
