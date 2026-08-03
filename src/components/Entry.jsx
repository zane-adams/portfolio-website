import { useState } from 'react'
import Gallery from './Gallery.jsx'
import Deck from './Deck.jsx'

export default function Entry({ entry }) {
  const [tab, setTab] = useState(null) // null | 'photos' | 'deck'

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

        <div className="entry-media">
          <div className="media-tabs mono">
            <button
              type="button"
              className={tab === 'photos' ? 'is-active' : ''}
              onClick={() => toggle('photos')}
            >
              photos{entry.photos.length ? ` (${entry.photos.length})` : ''}
            </button>
            <button
              type="button"
              className={tab === 'deck' ? 'is-active' : ''}
              onClick={() => toggle('deck')}
            >
              slides{entry.deck?.slides?.length ? ` (${entry.deck.slides.length})` : ''}
            </button>
          </div>

          {tab === 'photos' && (
            <div className="media-panel">
              <Gallery base={entry.id} photos={entry.photos} />
            </div>
          )}
          {tab === 'deck' && (
            <div className="media-panel">
              <Deck base={entry.id} deck={entry.deck} />
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
