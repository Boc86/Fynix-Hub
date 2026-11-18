import React, { useState, useMemo } from 'react'
import { useCollections, Collection, CollectionFilters, CollectionSort } from '../../hooks/useCollections'
import { useToast } from '../../hooks/useToast'
import Skeleton from '../Skeleton/Skeleton'
import styles from './Collections.module.css'

interface CollectionsProps {
  onCollectionSelect?: (collection: Collection) => void
  showActions?: boolean
}

export function Collections({ onCollectionSelect, showActions = true }: CollectionsProps) {
  const {
    collections,
    selectedCollection,
    createCollection,
    deleteCollection,
    shareCollection,
    filterCollections,
    sortCollections,
    searchCollections,
    setSelectedCollection
  } = useCollections()
  
  const { addToast } = useToast()
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<CollectionFilters>({})
  const [sort, setSort] = useState<CollectionSort>({ field: 'name', direction: 'asc' })
  const [isCreating, setIsCreating] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')

  const filteredCollections = useMemo(() => {
    let result = collections
    
    if (searchQuery) {
      result = searchCollections(result, searchQuery)
    }
    
    if (Object.keys(filters).length > 0) {
      result = filterCollections(result, filters)
    }
    
    return sortCollections(result, sort)
  }, [collections, searchQuery, filters, sort, searchCollections, filterCollections, sortCollections])

  const handleCreateCollection = () => {
    if (newCollectionName.trim()) {
      createCollection(newCollectionName.trim())
      setNewCollectionName('')
      setIsCreating(false)
    }
  }

  const handleDeleteCollection = (collectionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to delete this collection?')) {
      deleteCollection(collectionId)
    }
  }

  const handleShareCollection = (collectionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    shareCollection(collectionId)
    addToast({ message: 'Collection shared! Share code copied to clipboard', type: 'success' })
  }

  return (
    <div className={styles.collections}>
      <div className={styles.header}>
        <h2>My Collections</h2>
        
        {showActions && (
          <div className={styles.actions}>
            <input
              type="text"
              placeholder="Search collections..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
            
            <button
              onClick={() => setIsCreating(true)}
              className={styles.createButton}
            >
              + New Collection
            </button>
          </div>
        )}
      </div>

      {isCreating && (
        <div className={styles.createModal}>
          <input
            type="text"
            placeholder="Collection name..."
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            className={styles.input}
            autoFocus
          />
          <div className={styles.modalActions}>
            <button onClick={() => setIsCreating(false)}>Cancel</button>
            <button onClick={handleCreateCollection}>Create</button>
          </div>
        </div>
      )}

      <div className={styles.collectionsGrid}>
        {filteredCollections.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No collections found</p>
            <p>Create your first collection to get started!</p>
          </div>
        ) : (
          filteredCollections.map(collection => (
            <div
              key={collection.id}
              className={`${styles.collectionCard} ${
                selectedCollection?.id === collection.id ? styles.selected : ''
              }`}
              onClick={() => {
                setSelectedCollection(collection)
                onCollectionSelect?.(collection)
              }}
            >
              <div className={styles.collectionHeader}>
                <h3>{collection.name}</h3>
                {showActions && (
                  <div className={styles.cardActions}>
                    <button
                      onClick={(e) => handleShareCollection(collection.id, e)}
                      title="Share collection"
                      className={styles.actionButton}
                    >
                      🔗
                    </button>
                    <button
                      onClick={(e) => handleDeleteCollection(collection.id, e)}
                      title="Delete collection"
                      className={styles.actionButton}
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>
              
              {collection.description && (
                <p className={styles.description}>{collection.description}</p>
              )}
              
              <div className={styles.collectionStats}>
                <span>{collection.items.length} items</span>
                {collection.isPublic && (
                  <span className={styles.sharedBadge}>Shared</span>
                )}
              </div>
              
              {collection.coverImage ? (
                <div className={styles.coverImage}>
                  <img src={collection.coverImage} alt={collection.name} />
                </div>
              ) : (
                <div className={styles.placeholder}>
                  <Skeleton variant="rectangular" width="100%" height={120} />
                </div>
              )}
              
              <div className={styles.itemsPreview}>
                {collection.items.slice(0, 3).map(item => (
                  <div key={item.id} className={styles.itemPreview}>
                    <div className={styles.itemType}>{item.type}</div>
                    <div className={styles.itemTitle}>{item.title}</div>
                  </div>
                ))}
                {collection.items.length > 3 && (
                  <div className={styles.moreItems}>
                    +{collection.items.length - 3} more
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}