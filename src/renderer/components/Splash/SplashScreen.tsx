import React from 'react'

interface Props {
  status?: string
  progress?: number
}

export default function SplashScreen({ status = 'Initializing…', progress }: Props) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#141414',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      <div style={{
        width: 128,
        height: 128,
        borderRadius: 24,
        background: 'linear-gradient(135deg, #FF6B00 0%, #FF8E00 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        boxShadow: '0 8px 32px rgba(255,107,0,0.3)',
      }}>
        <span style={{ fontSize: 56, fontWeight: 800, color: '#fff' }}>FL</span>
      </div>
      <div style={{
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: progress !== undefined ? 12 : 0,
      }}>
        {status}
      </div>
      {progress !== undefined && progress < 100 && (
        <div style={{
          width: 200,
          height: 4,
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            backgroundColor: '#FF6B00',
            transition: 'width 0.3s ease',
          }} />
        </div>
      )}
    </div>
  )
}
