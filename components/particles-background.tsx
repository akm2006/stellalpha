"use client"

import { useEffect, useRef } from "react"

export default function ParticlesBackground() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const createParticle = () => {
      const particle = document.createElement('div')
      particle.className = 'particle'
      particle.style.left = Math.random() * 100 + '%'
      particle.style.animationDelay = Math.random() * 20 + 's'
      particle.style.animationDuration = (Math.random() * 10 + 15) + 's'
      container.appendChild(particle)

      // Remove particle after animation
      setTimeout(() => {
        if (container.contains(particle)) {
          container.removeChild(particle)
        }
      }, 25000)
    }

    // Create initial particles
    for (let i = 0; i < 20; i++) {
      setTimeout(createParticle, i * 500)
    }

    // Continue creating particles
    const interval = setInterval(createParticle, 2000)

    return () => {
      clearInterval(interval)
      // Clean up particles
      const particles = container.querySelectorAll('.particle')
      particles.forEach(particle => particle.remove())
    }
  }, [])

  return <div ref={containerRef} className="particles" />
}