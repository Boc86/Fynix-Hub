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
      backgroundColor: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      overflow: 'hidden',
    }}>
      {/* Subtle background pattern */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `
          radial-gradient(circle at 20% 50% , rgba(255,107,0,0.04) 0%, transparent 50%),
          radial-gradient(circle at 80% 30%, rgba(255,107,0,0.03) 0%, transparent 40%),
          radial-gradient(circle at 50% 80%, rgba(255,107,0,0.02) 0%, transparent 45%)
        `,
        pointerEvents: 'none',
      }} />

      {/* Logo */}
      <div style={{
        position: 'relative',
        marginBottom: 32,
      }}>
        {/* Outer ring with pulse animation */}
        <div style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          border: '2px solid rgba(255,107,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'pulse 2s ease-in-out infinite',
        }}>
          {/* Inner gradient square with FL */}
          <div style={{
            width: 80,
            height: 80,
            borderRadius: 18,
            background: 'linear-gradient(135deg, #FF6B00 0%, #FF8E00 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 30px rgba(255,107,0,0.5)',
          }}>
            <span style={{ 
              fontSize: 28, 
              fontWeight: 800, 
              color: '#fff',
              textShadow: '0 1px 2px rgba(0,0,0,0.3)',
              letterSpacing: '1px',
            }}>FL</span>
          </div>
        </div>
      </div>

      {/* App name */}
      <div style={{
        fontSize: 22,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 8,
        letterSpacing: '-0.5px',
      }}>
        Fynix Hub
      </div>

      {/* Status text */}
      <div style={{
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: progress !== undefined && progress < 100 ? 16 : 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        {progress !== undefined && progress < 100 && (
          <div style={{
            width: 12,
            height: 12,
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: '#FF6B00',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        )}
        {status}
      </div>

      {/* Progress bar */}
      {progress !== undefined && progress < 100 && (
        <div style={{
          width: 220,
          height: 4,
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #FF6B00 0%, #FF8E00 100%)',
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }} />
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
          100% { opacity: 0.6; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
