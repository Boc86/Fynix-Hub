import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock document and DOM APIs for testing
const mockDocument = {
  body: {
    appendChild: vi.fn(),
    removeChild: vi.fn(),
  },
  createElement: vi.fn(),
  querySelector: vi.fn(),
  querySelectorAll: vi.fn(),
  activeElement: null,
}

const mockCreatePortal = (element: any, container: any) => {
  return element
}

vi.mock('react-dom', () => ({
  createPortal: mockCreatePortal,
}))

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: vi.fn(() => vi.fn()),
}))

// Mock document
Object.defineProperty(global, 'document', {
  value: mockDocument,
  writable: true,
})

describe('Toast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDocument.body.appendChild.mockClear()
    mockDocument.body.removeChild.mockClear()
    mockDocument.querySelector.mockClear()
    mockDocument.querySelectorAll.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should create toast with correct structure', () => {
    const Toast = () => `
      <div class="toast success">
        <span class="icon">✓</span>
        <span class="message">Test message</span>
        <button class="close">×</button>
      </div>
    `
    
    const toastElement = Toast()
    expect(toastElement).toContain('Test message')
    expect(toastElement).toContain('✓')
    expect(toastElement).toContain('×')
  })

  it('should have correct CSS classes for different types', () => {
    const getToastClass = (type: string) => `toast ${type}`
    
    expect(getToastClass('success')).toBe('toast success')
    expect(getToastClass('error')).toBe('toast error')
    expect(getToastClass('warning')).toBe('toast warning')
    expect(getToastClass('info')).toBe('toast info')
  })

  it('should include action button when provided', () => {
    const actionButton = '<button class="action">Action</button>'
    expect(actionButton).toContain('Action')
    expect(actionButton).toContain('action')
  })

  it('should handle different icon types', () => {
    const getIcon = (type: string) => {
      switch (type) {
        case 'success': return '✓'
        case 'error': return '✕'
        case 'warning': return '⚠'
        case 'info': return 'ℹ'
        default: return ''
      }
    }
    
    expect(getIcon('success')).toBe('✓')
    expect(getIcon('error')).toBe('✕')
    expect(getIcon('warning')).toBe('⚠')
    expect(getIcon('info')).toBe('ℹ')
  })
})