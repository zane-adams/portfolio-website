import { useEffect, useState } from 'react'

const pad = (n) => String(n).padStart(2, '0')
const AUTOPLAY_MS = 5000

export default function Deck({ base, deck }) {
  const slides = deck?.slides ?? []
  const [index, setIndex] = useState(0)
  // pauses while the pointer or keyboard focus is on the deck
  const [paused, setPaused] = useState(false)
  // autoplay stops for good once the visitor navigates themselves
  const [stopped, setStopped] = useState(false)

  useEffect(() => {
    if (slides.length < 2 || paused || stopped) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), AUTOPLAY_MS)
    return () => clearInterval(timer)
  }, [slides.length, paused, stopped])

  if (!slides.length) {
    return (
      <p className="media-empty">
        export a deck to images (file → export → png, all slides), drop them in{' '}
        <code>public/media/{base}/deck/</code>, then list them under <code>deck.slides</code> in{' '}
        <code>src/content.js</code>.
      </p>
    )
  }

  const goTo = (i) => {
    setStopped(true)
    setIndex(i)
  }
  const go = (step) => goTo((index + step + slides.length) % slides.length)
  const slide = slides[index]

  return (
    <div
      className="deck"
      tabIndex={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1)
        if (e.key === 'ArrowLeft') go(-1)
      }}
    >
      <div className="deck-stage">
        <img src={`/media/${base}/deck/${slide.src}`} alt={slide.caption || `slide ${index + 1}`} />
      </div>

      <div className="deck-bar">
        <div className="deck-nav">
          <button type="button" onClick={() => go(-1)} aria-label="previous slide">
            ←
          </button>
          <button type="button" onClick={() => go(1)} aria-label="next slide">
            →
          </button>
          <span className="deck-count">
            {pad(index + 1)} / {pad(slides.length)}
          </span>
        </div>
        <p className="deck-caption">{slide.caption || deck.title}</p>
      </div>

      <ol className="deck-ticks" aria-hidden="true">
        {slides.map((s, i) => (
          <li key={s.src}>
            <button
              type="button"
              className={i === index ? 'is-current' : ''}
              onClick={() => goTo(i)}
              tabIndex={-1}
            />
          </li>
        ))}
      </ol>

      {deck.file && (
        <a className="deck-download mono" href={`/media/${base}/${deck.file}`} download>
          download slides ↓
        </a>
      )}
    </div>
  )
}
