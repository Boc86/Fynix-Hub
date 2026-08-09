// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ScheduleRecordingModal from '@/renderer/components/Recordings/ScheduleRecordingModal'

vi.mock('@/renderer/utils/channels', () => ({
  loadMergedChannels: vi.fn(async () => [
    { id: 'ch1', name: 'Channel One', logo: '', logoImage: '', m3uLogo: '', countryCode: 'us', countryName: 'USA', sources: ['m3u'] },
    { id: 'ch2', name: 'Channel Two', logo: '', logoImage: '', m3uLogo: '', countryCode: 'uk', countryName: 'UK', sources: ['m3u'] },
  ]),
}))

describe('ScheduleRecordingModal keyboard navigation', () => {
  it('auto-focuses the channel select once channels load', async () => {
    render(<ScheduleRecordingModal onClose={vi.fn()} onScheduled={vi.fn()} />)
    const select = screen.getByRole('combobox')
    await waitFor(() => expect(select).toHaveFocus())
  })

  it('Escape closes and does not bubble to window', async () => {
    const onClose = vi.fn()
    const windowSpy = vi.fn()
    window.addEventListener('keydown', windowSpy)
    render(<ScheduleRecordingModal onClose={onClose} onScheduled={vi.fn()} />)
    const select = await screen.findByRole('combobox')
    await waitFor(() => expect(select).toHaveFocus())
    fireEvent.keyDown(select, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(windowSpy).not.toHaveBeenCalled()
    window.removeEventListener('keydown', windowSpy)
  })

  it("keys don't leak to the window while open (Enter on input would otherwise pop the virtual keyboard)", async () => {
    const windowSpy = vi.fn()
    window.addEventListener('keydown', windowSpy)
    render(<ScheduleRecordingModal onClose={vi.fn()} onScheduled={vi.fn()} />)
    const select = await screen.findByRole('combobox')
    await waitFor(() => expect(select).toHaveFocus())
    fireEvent.keyDown(select, { key: 'Enter' })
    fireEvent.keyDown(select, { key: 's' })
    expect(windowSpy).not.toHaveBeenCalled()
    window.removeEventListener('keydown', windowSpy)
  })

  it('Tab wraps from Schedule back to the first field (focus trap)', async () => {
    render(<ScheduleRecordingModal onClose={vi.fn()} onScheduled={vi.fn()} />)
    const select = await screen.findByRole('combobox')
    await waitFor(() => expect(select).toHaveFocus())
    const schedule = screen.getByText('Schedule')
    schedule.focus()
    fireEvent.keyDown(schedule, { key: 'Tab' })
    expect(select).toHaveFocus()
  })
})
