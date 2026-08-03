import { useEffect, useState } from 'react'

export default function Gallery({ base, photos }) {
  const [open, setOpen] = useState(null)

  useEffect(() => {
    if (open === null) return
    function onKey(e) {
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') setOpen((i) => (i + 1) % photos.length)
      if (e.key === 'ArrowLeft') setOpen((i) => (i - 1 + photos.length) % photos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, photos.length])

  if (!photos.length) {
    return (
      <p className="media-empty">
        photos go in <code>public/media/{base}/</code>, then get listed under{' '}
        <code>photos</code> in <code>src/content.js</code>.
      </p>
    )
  }

  return (
    <>
      <ul className="gallery">
        {photos.map((photo, i) => (
          <li key={photo.src}>
            <button
              type="button"
              className="gallery-item"
              onClick={() => setOpen(i)}
              aria-label={photo.caption || `open photo ${i + 1}`}
            >
              <img src={`/media/${base}/${photo.src}`} alt={photo.caption || ''} loading="lazy" />
            </button>
          </li>
        ))}
      </ul>

      {open !== null && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <figure onClick={(e) => e.stopPropagation()}>
            <img
              src={`/media/${base}/${photos[open].src}`}
              alt={photos[open].caption || ''}
            />
            <figcaption>
              <span>{photos[open].caption}</span>
              <button type="button" onClick={() => setOpen(null)}>
                close
              </button>
            </figcaption>
          </figure>
        </div>
      )}
    </>
  )
}
