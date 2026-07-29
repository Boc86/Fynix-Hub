// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorModal from '@/renderer/components/ErrorModal/ErrorModal'

describe('ErrorModal', () => {
  it('renders the default title', () => {
    render(<ErrorModal message="Something went wrong" />)
    expect(screen.getByText('Playback Error')).toBeInTheDocument()
  })

  it('renders a custom title', () => {
    render(<ErrorModal title="Custom Title" message="Error" />)
    expect(screen.getByText('Custom Title')).toBeInTheDocument()
  })

  it('renders the raw message when no match', () => {
    render(<ErrorModal message="Random error xyz" />)
    expect(screen.getByText('Random error xyz')).toBeInTheDocument()
  })

  describe('friendlyMessage mapping', () => {
    it('maps encrypted/par2/repair to friendly message', () => {
      render(<ErrorModal message="file is encrypted with par2" />)
      expect(screen.getByText(/encrypted or incomplete/)).toBeInTheDocument()
    })

    it('maps "could not get stream url" to unpacking message', () => {
      render(<ErrorModal message="could not get stream url" />)
      expect(screen.getByText(/still be unpacking/)).toBeInTheDocument()
    })

    it('maps "could not locate" to unpacking message', () => {
      render(<ErrorModal message="could not locate the file" />)
      expect(screen.getByText(/still be unpacking/)).toBeInTheDocument()
    })

    it('maps "failed to send nzb" to NZBGet connection message', () => {
      render(<ErrorModal message="failed to send nzb to server" />)
      expect(screen.getByText(/Could not connect to your download client/)).toBeInTheDocument()
    })

    it('maps "connect to download client" to NZBGet message', () => {
      render(<ErrorModal message="cannot connect to download client" />)
      expect(screen.getByText(/Could not connect to your download client/)).toBeInTheDocument()
    })

    it('maps "exceeds" + "limit" to size limit message', () => {
      render(<ErrorModal message="file exceeds size limit" />)
      expect(screen.getByText(/too large/)).toBeInTheDocument()
    })

    it('maps "download removed" to removed message', () => {
      render(<ErrorModal message="download removed before playback" />)
      expect(screen.getByText(/removed before playback/)).toBeInTheDocument()
    })

    it('maps "download" + "failed" to NZBGet failure message', () => {
      render(<ErrorModal message="download failed in NZBGet" />)
      expect(screen.getByText(/Download failed in NZBGet/)).toBeInTheDocument()
    })

    it('maps "failed to start player" to player failure message', () => {
      render(<ErrorModal message="failed to start player" />)
      expect(screen.getByText(/Video player failed to start/)).toBeInTheDocument()
    })

    it('maps "mpv" to player failure message', () => {
      render(<ErrorModal message="mpv crashed" />)
      expect(screen.getByText(/Video player failed to start/)).toBeInTheDocument()
    })

    it('maps "timeout" to timeout message', () => {
      render(<ErrorModal message="connection timeout" />)
      expect(screen.getByText(/Connection timed out/)).toBeInTheDocument()
    })

    it('maps "timed out" to timeout message', () => {
      render(<ErrorModal message="request timed out" />)
      expect(screen.getByText(/Connection timed out/)).toBeInTheDocument()
    })
    it('maps ffmpeg not found to installation message', () => {
      render(<ErrorModal message="FFmpeg not found or failed to start" />)
      expect(screen.getByText(/FFmpeg is not installed/)).toBeInTheDocument()
    })
    it('maps ffmpeg crash to failure message', () => {
      render(<ErrorModal message="FFmpeg exited with code 1" />)
      expect(screen.getByText(/FFmpeg process failed/)).toBeInTheDocument()
    })
    it('maps codec error to unsupported message', () => {
      render(<ErrorModal message="Video codec not supported" />)
      expect(screen.getByText(/Video codec is not supported/)).toBeInTheDocument()
    })
    it('maps network error to unreachable message', () => {
      render(<ErrorModal message="Connection refused" />)
      expect(screen.getByText(/Network error/)).toBeInTheDocument()
    })
    it('maps corrupt data to corrupted message', () => {
      render(<ErrorModal message="Invalid data found" />)
      expect(screen.getByText(/corrupted or invalid/)).toBeInTheDocument()
    })
  })

  describe('buttons', () => {
    it('renders Go Back button when onBack provided', () => {
      const onBack = vi.fn()
      render(<ErrorModal message="Error" onBack={onBack} />)
      const btn = screen.getByText('Go Back')
      expect(btn).toBeInTheDocument()
      fireEvent.click(btn)
      expect(onBack).toHaveBeenCalledOnce()
    })

    it('does not render Go Back button when onBack not provided', () => {
      render(<ErrorModal message="Error" />)
      expect(screen.queryByText('Go Back')).not.toBeInTheDocument()
    })

    it('renders Retry button when onRetry provided', () => {
      const onRetry = vi.fn()
      render(<ErrorModal message="Error" onRetry={onRetry} />)
      const btn = screen.getByText('Retry')
      expect(btn).toBeInTheDocument()
      fireEvent.click(btn)
      expect(onRetry).toHaveBeenCalledOnce()
    })

    it('does not render Retry button when onRetry not provided', () => {
      render(<ErrorModal message="Error" />)
      expect(screen.queryByText('Retry')).not.toBeInTheDocument()
    })

    it('renders both buttons when both provided', () => {
      render(<ErrorModal message="Error" onBack={() => {}} onRetry={() => {}} />)
      expect(screen.getByText('Go Back')).toBeInTheDocument()
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })
  })
})
