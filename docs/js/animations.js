;(function () {
  'use strict'

  // Scroll reveal
  function initReveal() {
    const revealEls = document.querySelectorAll('.reveal')
    if (!revealEls.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
            observer.unobserve(entry.target)
          }
        })
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px',
      }
    )

    revealEls.forEach((el) => observer.observe(el))
  }

  // Mouse spotlight
  function initSpotlight() {
    const spotlight = document.createElement('div')
    spotlight.style.cssText =
      'position:fixed;inset:0;z-index:9999;pointer-events:none;opacity:0;transition:opacity 0.5s'
    document.body.appendChild(spotlight)

    let rafId
    let mouseX = -1000
    let mouseY = -1000
    let isVisible = false

    function updateSpotlight() {
      const size = Math.min(window.innerWidth, window.innerHeight) * 0.6
      spotlight.style.background = `radial-gradient(circle ${size}px at ${mouseX}px ${mouseY}px, rgba(255, 122, 0, 0.03) 0%, transparent 70%)`
    }

    function onMove(e) {
      mouseX = e.clientX
      mouseY = e.clientY
      if (!isVisible) {
        isVisible = true
        spotlight.style.opacity = '1'
      }
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(updateSpotlight)
    }

    function onLeave() {
      isVisible = false
      spotlight.style.opacity = '0'
    }

    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseleave', onLeave, { passive: true })
  }

  // Parallax hero
  function initParallax() {
    const hero = document.querySelector('.hero')
    if (!hero) return

    const heroContent = hero.querySelector('.hero-content')
    if (!heroContent) return

    let ticking = false

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrolled = window.pageYOffset
          const heroHeight = hero.offsetHeight
          if (scrolled <= heroHeight) {
            heroContent.style.transform = `translateY(${scrolled * 0.15}px)`
            heroContent.style.opacity = 1 - Math.min(scrolled / heroHeight, 0.5)
          }
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
  }

  // Navbar shrink
  function initNavbar() {
    const navbar = document.querySelector('.navbar')
    if (!navbar) return

    function onScroll() {
      if (window.pageYOffset > 50) {
        navbar.classList.add('scrolled')
      } else {
        navbar.classList.remove('scrolled')
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
  }

  // Mobile nav toggle
  function initMobileNav() {
    const toggle = document.querySelector('.navbar-toggle')
    const links = document.querySelector('.navbar-links')
    if (!toggle || !links) return

    toggle.addEventListener('click', () => {
      links.classList.toggle('open')
      const expanded = links.classList.contains('open')
      toggle.setAttribute('aria-expanded', String(expanded))
    })

    // Close on link click
    links.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        links.classList.remove('open')
        toggle.setAttribute('aria-expanded', 'false')
      })
    })
  }

  document.addEventListener('DOMContentLoaded', () => {
    initReveal()
    initSpotlight()
    initParallax()
    initNavbar()
    initMobileNav()
  })
})()
