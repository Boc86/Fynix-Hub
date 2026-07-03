;(function () {
  'use strict'

  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('loaded')

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', function (e) {
        const target = document.querySelector(this.getAttribute('href'))
        if (target) {
          e.preventDefault()
          const offset = 80
          const targetPos = target.getBoundingClientRect().top + window.pageYOffset - offset
          window.scrollTo({ top: targetPos, behavior: 'smooth' })
        }
      })
    })

    // Lazy load images
    if ('loading' in HTMLImageElement.prototype) {
      document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
        img.src = img.dataset.src || img.src
      })
    }

    // Set current year in footer
    const yearEl = document.getElementById('current-year')
    if (yearEl) yearEl.textContent = new Date().getFullYear()
  })
})()
