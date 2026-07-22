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
    const { container } = render(<Prompt title="T" onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(container.firstElementChild!)
    expect(onCancel).toHaveBeenCalled()
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
    const { container } = render(<Confirm title="T" onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(container.firstElementChild!)
    expect(onCancel).toHaveBeenCalled()
  })
})
