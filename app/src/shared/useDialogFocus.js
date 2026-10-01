import { useEffect, useRef } from 'react'

export function useDialogFocus(open, onClose) {
  const dialog = useRef(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    if (!open || !dialog.current) return
    const previous = document.activeElement
    const panel = dialog.current
    const controls = () => [...panel.querySelectorAll('button:not(:disabled), a[href], input, select, textarea, [tabindex="0"]')]
    ;(controls()[0] || panel).focus()
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); close.current() }
      if (event.key !== 'Tab') return
      const items = controls()
      if (!items.length) { event.preventDefault(); panel.focus(); return }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus() }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus() }
    }
    panel.addEventListener('keydown', keydown)
    return () => { panel.removeEventListener('keydown', keydown); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [open])
  return dialog
}
