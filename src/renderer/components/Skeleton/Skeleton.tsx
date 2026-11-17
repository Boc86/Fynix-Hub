import React from 'react'
import styles from './Skeleton.module.css'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  className?: string
  variant?: 'text' | 'circular' | 'rectangular'
}

export default function Skeleton({ width, height, className, variant = 'rectangular' }: SkeletonProps) {
  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  }
  
  return (
    <div
      className={`${styles.skeleton} ${styles[variant]} ${className || ''}`}
      style={style}
      aria-busy="true"
      aria-label="Loading"
    />
  )
}