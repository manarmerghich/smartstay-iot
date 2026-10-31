import { useState } from 'react'

// Shows a photo; falls back to a dark gradient if the image cannot be loaded.
export default function SafeImage({ src, alt, className = '' }) {
  const [failed, setFailed] = useState(false)
  if (failed || !src) return <div className={`img-fallback ${className}`} role="img" aria-label={alt} />
  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
}
