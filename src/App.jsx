import { useEffect, useRef, useState } from 'react'
import NameCanvas from './components/NameCanvas.jsx'
import NavCanvas from './components/NavCanvas.jsx'
import Entry from './components/Entry.jsx'
import { profile, education, experience, projects, skills, resumeFile } from './content.js'

const NAV = [
  { id: 'work', label: 'work' },
  { id: 'projects', label: 'projects' },
  { id: 'about', label: 'about' },
  { id: 'resume', label: 'resume' },
]

function Section({ id, label, children }) {
  const ref = useRef(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.classList.add('is-visible')
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.classList.add('is-visible')
          observer.disconnect()
        }
      },
      { rootMargin: '-60px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <section id={id} className="section" ref={ref}>
      <header className="section-head">
        <h2 className="mono">{label}</h2>
      </header>
      {children}
    </section>
  )
}

export default function App() {
  const heroSlotRef = useRef(null)
  const dockSlotRef = useRef(null)
  const [nav3d, setNav3d] = useState(false)

  return (
    <>
      <nav className="nav mono">
        <a href="#top" className="nav-mark">
          {profile.name}
        </a>
        <div className="nav-dock" ref={dockSlotRef}>
          <ul className={nav3d ? 'nav-links is-hidden' : 'nav-links'}>
            {NAV.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`}>{item.label}</a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <NavCanvas
        items={NAV}
        heroSlotRef={heroSlotRef}
        dockSlotRef={dockSlotRef}
        onStatus={(status) => setNav3d(status === 'ready')}
      />

      <main>
        <header className="hero" id="top">
          <NameCanvas text={profile.name} />
          <div className="hero-nav" ref={heroSlotRef} aria-hidden="true" />
          <div className="hero-meta mono">
            <span>{profile.tagline}</span>
            <span>{profile.location}</span>
          </div>
        </header>

        <div className="shell">
          <p className="lede">{profile.blurb}</p>

          <Section id="work" label="work">
            {experience.map((entry) => (
              <Entry key={entry.id} entry={entry} />
            ))}
          </Section>

          <Section id="projects" label="projects">
            {projects.map((entry) => (
              <Entry key={entry.id} entry={entry} />
            ))}
          </Section>

          <Section id="about" label="about">
            <div className="entry">
              <div className="entry-rail">
                <p className="mono entry-dates">{education.dates}</p>
                <p className="entry-org">{education.school}</p>
                <p className="mono entry-place">{education.place}</p>
              </div>
              <div className="entry-body">
                <h3 className="entry-role">{education.degree}</h3>
                <ul className="tags mono">
                  {education.coursework.map((course) => (
                    <li key={course}>{course}</li>
                  ))}
                </ul>

                <div className="skills">
                  {skills.map((row) => (
                    <div className="skill-row" key={row.group}>
                      <p className="mono skill-group">{row.group}</p>
                      <p className="skill-items">{row.items.join(', ')}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section id="resume" label="resume">
            <div className="resume">
              <div className="resume-actions mono">
                <a href={resumeFile} target="_blank" rel="noreferrer">
                  open in new tab ↗
                </a>
                <a href={resumeFile} download>
                  download pdf ↓
                </a>
              </div>
              <object className="resume-frame" data={resumeFile} type="application/pdf">
                <p className="media-empty">
                  this browser won't preview pdfs inline — use the download link above.
                </p>
              </object>
            </div>
          </Section>
        </div>
      </main>

      <footer className="footer">
        <div className="shell footer-inner mono">
          <p>{profile.email}</p>
          <ul>
            {profile.links.map((link) => (
              <li key={link.label}>
                <a href={link.href} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </>
  )
}
