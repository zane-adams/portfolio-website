import { MarkGithubIcon } from '@primer/octicons-react'

// link text, with the github mark in front of github links
export default function LinkLabel({ label }) {
  if (label.toLowerCase() === 'github') {
    return (
      <span className="link-label">
        <MarkGithubIcon size={14} aria-hidden="true" />
        {label}
      </span>
    )
  }
  return label
}
