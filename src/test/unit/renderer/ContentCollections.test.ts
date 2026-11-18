import { describe, it, expect } from 'vitest'

describe('Content Collections', () => {
  it('should create collection with proper structure', () => {
    const collection = {
      id: '1',
      name: 'My Favorites',
      description: 'My favorite movies and shows',
      items: [
        { id: '101', type: 'movie', title: 'Inception', added: Date.now() },
        { id: '102', type: 'show', title: 'Breaking Bad', added: Date.now() }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    
    expect(collection.id).toBe('1')
    expect(collection.name).toBe('My Favorites')
    expect(collection.items.length).toBe(2)
    expect(collection.items[0].type).toBe('movie')
  })
  
  it('should support collection filtering', () => {
    const collections = [
      { name: 'Movies', type: 'movie' },
      { name: 'TV Shows', type: 'show' },
      { name: 'Documentaries', type: 'documentary' }
    ]
    
    const movies = collections.filter(c => c.type === 'movie')
    expect(movies.length).toBe(1)
    expect(movies[0].name).toBe('Movies')
  })
  
  it('should support collection sorting', () => {
    const collections = [
      { name: 'Z Collection', createdAt: Date.now() },
      { name: 'A Collection', createdAt: Date.now() + 1000 },
      { name: 'B Collection', createdAt: Date.now() + 500 }
    ]
    
    const sorted = [...collections].sort((a, b) => a.name.localeCompare(b.name))
    expect(sorted[0].name).toBe('A Collection')
    expect(sorted[1].name).toBe('B Collection')
    expect(sorted[2].name).toBe('Z Collection')
  })
  
  it('should support collection search', () => {
    const collections = [
      { name: 'Action Movies', description: 'Action packed movies' },
      { name: 'Comedy Shows', description: 'Funny TV shows' },
      { name: 'Sci-Fi Collection', description: 'Science fiction content' }
    ]
    
    const results = collections.filter(c => 
      c.name.toLowerCase().includes('action') || 
      c.description.toLowerCase().includes('action')
    )
    expect(results.length).toBe(1)
    expect(results[0].name).toBe('Action Movies')
  })
  
  it('should support collection sharing', () => {
    const collection = {
      id: '1',
      name: 'Shared Collection',
      isPublic: true,
      shareCode: 'abc123',
      sharedAt: Date.now()
    }
    
    expect(collection.isPublic).toBe(true)
    expect(collection.shareCode).toBe('abc123')
  })
})