;(function () {
  'use strict'

  const galleryItems = document.querySelectorAll('.gallery-item')
  const lightbox = document.getElementById('lightbox')
  const lightboxImg = lightbox ? lightbox.querySelector('img') : null
  const lightboxClose = document.getElementById('lightbox-close')
  const lightboxPrev = document.getElementById('lightbox-prev')
  const lightboxNext = document.getElementById('lightbox-next')
  let currentIndex = 0
  let images = []

  if (!lightbox || !lightboxImg) return

  function getGalleryImages() {
    images = []
    galleryItems.forEach((item, i) => {
      const img = item.querySelector('img')
      if (img) {
        images.push({ src: img.src, alt: img.alt, index: i })
      }
    })
  }

  function openLightbox(index) {
    if (!images.length || index < 0 || index >= images.length) return
    currentIndex = index
    lightboxImg.src = images[index].src
    lightboxImg.alt = images[index].alt
    lightbox.classList.add('open')
    document.body.style.overflow = 'hidden'
  }

  function closeLightbox() {
    lightbox.classList.remove('open')
    document.body.style.overflow = ''
  }

  function prevImage() {
    if (images.length === 0) return
    currentIndex = (currentIndex - 1 + images.length) % images.length
    lightboxImg.src = images[currentIndex].src
    lightboxImg.alt = images[currentIndex].alt
  }

  function nextImage() {
    if (images.length === 0) return
    currentIndex = (currentIndex + 1) % images.length
    lightboxImg.src = images[currentIndex].src
    lightboxImg.alt = images[currentIndex].alt
  }

  galleryItems.forEach((item, i) => {
    item.addEventListener('click', () => {
      getGalleryImages()
      openLightbox(i)
    })
    item.setAttribute('role', 'button')
    item.setAttribute('tabindex', '0')
    item.setAttribute('aria-label', 'Open screenshot')
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        getGalleryImages()
        openLightbox(i)
      }
    })
  })

  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox)
  if (lightboxPrev) lightboxPrev.addEventListener('click', (e) => { e.stopPropagation(); prevImage() })
  if (lightboxNext) lightboxNext.addEventListener('click', (e) => { e.stopPropagation(); nextImage() })

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox()
  })

  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return
    if (e.key === 'Escape') closeLightbox()
    if (e.key === 'ArrowLeft') prevImage()
    if (e.key === 'ArrowRight') nextImage()
  })

  // Touch support
  let touchStartX = 0
  let touchEndX = 0

  lightbox.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX
  }, { passive: true })

  lightbox.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX
    const diff = touchStartX - touchEndX
    if (Math.abs(diff) > 50) {
      if (diff > 0) nextImage()
      else prevImage()
    }
  }, { passive: true })
})()
