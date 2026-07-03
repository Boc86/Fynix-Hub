;(function () {
  'use strict'

  const canvas = document.createElement('canvas')
  canvas.id = 'particles-canvas'
  canvas.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;width:100vw;height:100vh'
  document.body.prepend(canvas)

  const ctx = canvas.getContext('2d')
  let particles = []
  let animId
  let w, h

  function resize() {
    w = canvas.width = window.innerWidth
    h = canvas.height = window.innerHeight
  }
  resize()
  window.addEventListener('resize', resize)

  const COUNT = Math.min(60, Math.floor((w * h) / 20000))

  function createParticles() {
    particles = []
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25 - 0.1,
        r: Math.random() * 1.8 + 0.4,
        alpha: Math.random() * 0.3 + 0.05,
      })
    }
  }
  createParticles()

  function draw() {
    ctx.clearRect(0, 0, w, h)

    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy

      if (p.x < -10) p.x = w + 10
      if (p.x > w + 10) p.x = -10
      if (p.y < -10) p.y = h + 10
      if (p.y > h + 10) p.y = -10

      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255, 122, 0, ${p.alpha})`
      ctx.fill()
    }

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x
        const dy = particles[i].y - particles[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 120) {
          ctx.beginPath()
          ctx.moveTo(particles[i].x, particles[i].y)
          ctx.lineTo(particles[j].x, particles[j].y)
          ctx.strokeStyle = `rgba(255, 122, 0, ${0.03 * (1 - dist / 120)})`
          ctx.lineWidth = 0.5
          ctx.stroke()
        }
      }
    }

    animId = requestAnimationFrame(draw)
  }

  animId = requestAnimationFrame(draw)

  window.addEventListener('resize', () => {
    resize()
    createParticles()
  })

  window.__particlesCleanup = function () {
    cancelAnimationFrame(animId)
    canvas.remove()
  }
})()
