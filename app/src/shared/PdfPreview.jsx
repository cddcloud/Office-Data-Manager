import { useEffect, useRef, useState } from 'react'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export default function PdfPreview({ url, title }) {
  const canvas = useRef(null)
  const [pdf, setPdf] = useState(null)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    let task
    setPdf(null); setPage(1); setBusy(true); setError('')
    import('pdfjs-dist').then(module => {
      if (!active) return
      module.GlobalWorkerOptions.workerSrc = workerUrl
      task = module.getDocument({ url, useSystemFonts: true })
      return task.promise.then(value => active && setPdf(value))
    }).catch(() => { if (active) { setError('PDF preview မဖွင့်နိုင်ပါ။ ဖိုင်ကို download လုပ်၍ ဖတ်ရှုနိုင်ပါသည်။'); setBusy(false) } })
    return () => { active = false; void task?.destroy() }
  }, [url])
  useEffect(() => {
    if (!pdf || !canvas.current) return
    let active = true
    let render
    setBusy(true)
    pdf.getPage(page).then(value => {
      if (!active) return
      const viewport = value.getViewport({ scale: 1.5 })
      const element = canvas.current
      element.width = viewport.width; element.height = viewport.height
      render = value.render({ canvas: element, canvasContext: element.getContext('2d'), viewport })
      return render.promise
    }).then(() => active && setBusy(false)).catch(failure => {
      if (active && failure.name !== 'RenderingCancelledException') { setError('PDF page မဖွင့်နိုင်ပါ။'); setBusy(false) }
    })
    return () => { active = false; render?.cancel() }
  }, [pdf, page])
  return <div className="workflow-pdf-preview">
    <nav aria-label="PDF pages"><button disabled={!pdf || page === 1 || busy} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} / {pdf?.numPages || '…'}</span><button disabled={!pdf || page === pdf.numPages || busy} onClick={() => setPage(value => value + 1)}>Next</button><a href={url} download={`${title}.pdf`}>Download PDF</a></nav>
    {busy && <p role="status">PDF page ရယူနေသည်…</p>}{error && <p role="alert">{error}</p>}
    <canvas ref={canvas} role="img" aria-label={`${title}, page ${page}`} hidden={Boolean(error)} />
  </div>
}
