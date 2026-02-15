// ── Tab Switching ─────────────────────────────────────────────────────────
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;

    tabBtns.forEach(b => b.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    document.getElementById('panel-' + target).classList.add('active');
  });
});

// ── Mobile Nav Toggle ────────────────────────────────────────────────────
const hamburger = document.querySelector('.nav-hamburger');
const mobileNav = document.querySelector('.nav-mobile');

hamburger.addEventListener('click', () => {
  mobileNav.classList.toggle('open');
});

// Close mobile nav on link click
mobileNav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    mobileNav.classList.remove('open');
  });
});

// ── Sticky Nav Scroll Effect ─────────────────────────────────────────────
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 50);
}, { passive: true });

// ── Scroll Reveal ────────────────────────────────────────────────────────
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach(el => {
  revealObserver.observe(el);
});

// ── Lightbox ──────────────────────────────────────────────────────────────
const lightbox = document.getElementById('lightbox');
const lightboxImg = lightbox.querySelector('img');

document.querySelectorAll('.screenshot-frame').forEach(frame => {
  frame.addEventListener('click', () => {
    const img = frame.querySelector('img');
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt;
    lightbox.classList.add('open');
  });
});

function closeLightbox() {
  lightbox.classList.remove('open');
}

lightbox.addEventListener('click', (e) => {
  if (e.target !== lightboxImg) closeLightbox();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
});
