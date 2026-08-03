import { useState } from 'react'

const pad = (n) => String(n).padStart(2, '0')

export default function Deck({ base, deck }) {
  const slides = deck?.slides ?? []
  const [index, setIndex] = useState(0)

  if (!slides.length) {
    return (
      <p className="media-empty">
        export a deck to images (file → export → png, all slides), drop them in{' '}
        <code>public/media/{base}/deck/</code>, then list them under <code>deck.slides</code> in{' '}
        <code>src/content.js</code>.
      </p>
    )
  }

  const go = (step) => setIndex((i) => (i + step + slides.length) % slides.length)
  const slide = slides[index]

  return (
    <div
      className="deck"
      tabIndex={0}
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
              onClick={() => setIndex(i)}
              tabIndex={-1}
            />
          </li>
        ))}
      </ol>
    </div>
  )
}
