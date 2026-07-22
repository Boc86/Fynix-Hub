// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '@/renderer/components/ErrorBoundary'

// Suppress expected error boundary console output
vi.spyOn(console, 'error').mockImplementation(() => {})

function Boom() {
  throw new Error('test crash')
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(<ErrorBoundary><div>OK</div></ErrorBoundary>)
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('catches error and shows default fallback', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('test crash')).toBeInTheDocument()
  })

  it('uses custom fallback when provided', () => {
    render(<ErrorBoundary fallback={<div>Custom error UI</div>}><Boom /></ErrorBoundary>)
    expect(screen.getByText('Custom error UI')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })

  it('logs error to window.api if available', () => {
    const logSpy = vi.fn()
    ;(window as any).api = { log: logSpy }
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('test crash'))
    delete (window as any).api
  })
})
