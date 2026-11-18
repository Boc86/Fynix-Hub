import React, { useState, useCallback } from 'react'
import { useToast } from './useToast'

export interface CollectionItem {
  id: string
  type: 'movie' | 'show' | 'documentary' | 'anime'
  title: string
  poster?: string
  added: number
  metadata?: {
    year?: number
    rating?: number
    genres?: string[]
  }
}

export interface Collection {
  id: string
  name: string
  description?: string
  items: CollectionItem[]
  createdAt: number
  updatedAt: number
  isPublic?: boolean
  shareCode?: string
  coverImage?: string
}

export interface CollectionFilters {
  type?: CollectionItem['type']
  genre?: string
  year?: number
  rating?: number
}

export interface CollectionSort {
  field: 'name' | 'createdAt' | 'updatedAt' | 'rating'
  direction: 'asc' | 'desc'
}

export function useCollections() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null)
  const { addToast } = useToast()

  const createCollection = useCallback((name: string, description?: string) => {
    const newCollection: Collection = {
      id: `collection_${Date.now()}`,
      name,
      description,
      items: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    
    setCollections(prev => [...prev, newCollection])
    addToast({ message: `Collection "${name}" created successfully`, type: 'success' })
    return newCollection
  }, [addToast])

  const addToCollection = useCallback((collectionId: string, item: CollectionItem) => {
    setCollections(prev => prev.map(collection => {
      if (collection.id === collectionId) {
        const updatedCollection = {
          ...collection,
          items: [...collection.items, item],
          updatedAt: Date.now()
        }
        
        if (selectedCollection?.id === collectionId) {
          setSelectedCollection(updatedCollection)
        }
        
        return updatedCollection
      }
      return collection
    }))
    
    addToast({ message: `Added "${item.title}" to collection`, type: 'success' })
  }, [selectedCollection, addToast])

  const removeFromCollection = useCallback((collectionId: string, itemId: string) => {
    setCollections(prev => prev.map(collection => {
      if (collection.id === collectionId) {
        const updatedCollection = {
          ...collection,
          items: collection.items.filter(item => item.id !== itemId),
          updatedAt: Date.now()
        }
        
        if (selectedCollection?.id === collectionId) {
          setSelectedCollection(updatedCollection)
        }
        
        return updatedCollection
      }
      return collection
    }))
    
    addToast({ message: 'Removed from collection', type: 'success' })
  }, [selectedCollection, addToast])

  const updateCollection = useCallback((collectionId: string, updates: Partial<Collection>) => {
    setCollections(prev => prev.map(collection => {
      if (collection.id === collectionId) {
        const updatedCollection = {
          ...collection,
          ...updates,
          updatedAt: Date.now()
        }
        
        if (selectedCollection?.id === collectionId) {
          setSelectedCollection(updatedCollection)
        }
        
        return updatedCollection
      }
      return collection
    }))
  }, [selectedCollection])

  const deleteCollection = useCallback((collectionId: string) => {
    setCollections(prev => prev.filter(collection => collection.id !== collectionId))
    if (selectedCollection?.id === collectionId) {
      setSelectedCollection(null)
    }
    addToast({ message: 'Collection deleted', type: 'success' })
  }, [selectedCollection, addToast])

  const shareCollection = useCallback((collectionId: string) => {
    setCollections(prev => prev.map(collection => {
      if (collection.id === collectionId) {
        const shareCode = Math.random().toString(36).substring(2, 8)
        return {
          ...collection,
          isPublic: true,
          shareCode,
          sharedAt: Date.now()
        }
      }
      return collection
    }))
    
    addToast({ message: 'Collection shared successfully', type: 'success' })
  }, [addToast])

  const filterCollections = useCallback((collections: Collection[], filters: CollectionFilters) => {
    return collections.filter(collection => {
      if (filters.type && collection.items.some(item => item.type === filters.type)) {
        return true
      }
      if (filters.genre) {
        return collection.items.some(item => 
          item.metadata?.genres?.includes(filters.genre!)
        )
      }
      if (filters.year) {
        return collection.items.some(item => 
          item.metadata?.year === filters.year
        )
      }
      if (filters.rating) {
        return collection.items.some(item => 
          item.metadata?.rating && item.metadata.rating >= filters.rating!
        )
      }
      return true
    })
  }, [])

  const sortCollections = useCallback((collections: Collection[], sort: CollectionSort) => {
    return [...collections].sort((a, b) => {
      let valueA: any = a[sort.field as keyof Collection]
      let valueB: any = b[sort.field as keyof Collection]
      
      if (sort.field === 'name') {
        valueA = a.name.toLowerCase()
        valueB = b.name.toLowerCase()
      }
      
      if (valueA < valueB) return sort.direction === 'asc' ? -1 : 1
      if (valueA > valueB) return sort.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [])

  const searchCollections = useCallback((collections: Collection[], query: string) => {
    const lowercaseQuery = query.toLowerCase()
    return collections.filter(collection =>
      collection.name.toLowerCase().includes(lowercaseQuery) ||
      collection.description?.toLowerCase().includes(lowercaseQuery) ||
      collection.items.some(item =>
        item.title.toLowerCase().includes(lowercaseQuery)
      )
    )
  }, [])

  return {
    collections,
    selectedCollection,
    createCollection,
    addToCollection,
    removeFromCollection,
    updateCollection,
    deleteCollection,
    shareCollection,
    setSelectedCollection,
    filterCollections,
    sortCollections,
    searchCollections
  }
}