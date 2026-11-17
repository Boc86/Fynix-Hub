import React from 'react'
import Skeleton from './Skeleton'
import styles from './SkeletonList.module.css'

export default function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className={styles.container}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={styles.row}>
          <div className={styles.poster}>
            <Skeleton variant="rectangular" width={80} height={120} />
          </div>
          <div className={styles.info}>
            <Skeleton variant="text" width={150} height={20} style={{ marginBottom: 8 }} />
            <Skeleton variant="text" width={100} height={16} style={{ marginBottom: 8 }} />
            <Skeleton variant="text" width={80} height={16} />
          </div>
        </div>
      ))}
    </div>
  )
}