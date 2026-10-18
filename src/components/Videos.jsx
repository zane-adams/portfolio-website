export default function Videos({ videos }) {
  return (
    <div className="videos">
      {videos.map((video) => (
        <figure key={video.id} className="video">
          <div className="video-frame">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${video.id}`}
              title={video.caption || 'project video'}
              loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          {video.caption && <figcaption className="mono">{video.caption}</figcaption>}
        </figure>
      ))}
    </div>
  )
}
