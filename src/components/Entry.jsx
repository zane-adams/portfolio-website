import { useState } from 'react'
import Gallery from './Gallery.jsx'
import Deck from './Deck.jsx'

export default function Entry({ entry }) {
  const photos = entry.photos ?? []
  const slides = entry.deck?.slides ?? []

  const tabs = []
  if (photos.length) tabs.push('photos')
  if (slides.length) tabs.push('deck')

  const [tab, setTab] = useState(tabs[0] ?? null)

  const toggle = (next) => setTab((current) => (current === next ? null : next))

  return (
    <article className="entry">
      <div className="entry-rail">
        <p className="mono entry-dates">{entry.dates}</p>
        <p className="entry-org">{entry.org}</p>
        {entry.place && <p className="mono entry-place">{entry.place}</p>}
      </div>

      <div className="entry-body">
        <h3 className="entry-role">{entry.role}</h3>

        <ul className="entry-bullets">
          {entry.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>

        <ul className="tags mono">
          {entry.stack.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        {tabs.length > 0 && (
          <div className="entry-media">
            <div className="media-tabs mono">
              {tabs.includes('photos') && (
                <button
                  type="button"
                  className={tab === 'photos' ? 'is-active' : ''}
                  onClick={() => toggle('photos')}
                >
                  photos ({photos.length})
                </button>
              )}
              {tabs.includes('deck') && (
                <button
                  type="button"
                  className={tab === 'deck' ? 'is-active' : ''}
                  onClick={() => toggle('deck')}
                >
                  slides ({slides.length})
                </button>
              )}
            </div>

            {tab === 'photos' && (
              <div className="media-panel">
                <Gallery base={entry.id} photos={photos} />
              </div>
            )}
            {tab === 'deck' && (
              <div className="media-panel">
                <Deck base={entry.id} deck={entry.deck} />
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
