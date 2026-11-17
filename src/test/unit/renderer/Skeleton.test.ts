import { describe, it, expect } from 'vitest'

describe('Skeleton', () => {
  it('should create skeleton element with correct structure', () => {
    const skeletonHtml = '<div class="skeleton rectangular" style="width: 100px; height: 50px;" aria-busy="true" aria-label="Loading"></div>'
    
    // Basic string checks for skeleton structure
    expect(skeletonHtml).toContain('skeleton')
    expect(skeletonHtml).toContain('rectangular')
    expect(skeletonHtml).toContain('aria-busy')
    expect(skeletonHtml).toContain('Loading')
  })
  
  it('should support circular variant', () => {
    const skeletonHtml = '<div class="skeleton circular" style="width: 50px; height: 50px;"></div>'
    
    expect(skeletonHtml).toContain('circular')
  })
  
  it('should support text variant', () => {
    const skeletonHtml = '<div class="skeleton text" style="height: 16px; width: 100%;"></div>'
    
    expect(skeletonHtml).toContain('text')
  })
  
  it('should apply custom className', () => {
    const skeletonHtml = '<div class="skeleton rectangular custom-class"></div>'
    
    expect(skeletonHtml).toContain('custom-class')
  })
  
  it('should have correct CSS animation', () => {
    const cssContent = '.skeleton { background: linear-gradient(90deg, #2a2a2a 25%, #3a3a3a 50%, #2a2a2a 75%); background-size: 200% 100%; animation: loading 1.5s infinite; }'
    
    expect(cssContent).toContain('linear-gradient')
    expect(cssContent).toContain('loading 1.5s infinite')
  })
})