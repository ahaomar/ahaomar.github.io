document.addEventListener('DOMContentLoaded', function () {
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Mobile nav disclosure ---------- */
  var navToggle = document.querySelector('.nav-toggle');
  var primaryNav = document.getElementById('primary-nav');

  if (navToggle && primaryNav) {
    var closeNav = function () {
      primaryNav.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    };

    navToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = primaryNav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    /* Escape closes the panel and returns focus to the trigger. */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && primaryNav.classList.contains('is-open')) {
        closeNav();
        navToggle.focus();
      }
    });

    /* A tap outside the panel closes it. */
    document.addEventListener('click', function (e) {
      if (!primaryNav.classList.contains('is-open')) return;
      if (primaryNav.contains(e.target) || navToggle.contains(e.target)) return;
      closeNav();
    });

    /* Returning to desktop width must not leave the panel state stuck open. */
    window.addEventListener('resize', function () {
      if (window.innerWidth > 760) closeNav();
    });
  }

  /* ---------- Command palette (⌘K) ---------- */
  var cmdkTrigger = document.querySelector('.cmdk-trigger');
  var cmdkOverlay = document.getElementById('cmdk-overlay');
  var cmdkSearch = document.getElementById('cmdk-search');
  var cmdkItems = document.querySelectorAll('.cmdk-item');
  var cmdkOpen = false;
  var focusedIndex = -1;
  var lastFocused = null;

  function visibleCmdkItems() {
    return Array.prototype.filter.call(cmdkItems, function (item) {
      return item.style.display !== 'none';
    });
  }

  function filterCmdk(query) {
    var q = query.toLowerCase().trim();
    Array.prototype.forEach.call(cmdkItems, function (item) {
      var match = !q || item.textContent.toLowerCase().indexOf(q) !== -1;
      item.style.display = match ? 'flex' : 'none';
      if (!match) item.classList.remove('is-focused');
    });
  }

  function openCmdk() {
    lastFocused = document.activeElement;
    cmdkOverlay.hidden = false;
    cmdkSearch.focus();
    cmdkOpen = true;
    cmdkTrigger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    focusedIndex = -1;
  }

  function closeCmdk() {
    cmdkOverlay.hidden = true;
    cmdkOpen = false;
    cmdkTrigger.setAttribute('aria-expanded', 'false');
    cmdkSearch.value = '';
    filterCmdk('');
    focusedIndex = -1;
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  function navigateCmdk(direction) {
    var items = visibleCmdkItems();
    if (!items.length) return;
    focusedIndex = (focusedIndex + direction + items.length) % items.length;
    items.forEach(function (item, i) { item.classList.toggle('is-focused', i === focusedIndex); });
    items[focusedIndex].scrollIntoView({ block: 'nearest' });
  }

  function goTo(item) {
    var href = item.getAttribute('data-href');
    if (!href) return;
    if (item.hasAttribute('data-external')) window.open(href, '_blank', 'noopener');
    else window.location.href = href;
    closeCmdk();
  }

  if (cmdkTrigger && cmdkOverlay && cmdkSearch) {
    cmdkTrigger.addEventListener('click', function (e) {
      e.stopPropagation();
      cmdkOpen ? closeCmdk() : openCmdk();
    });

    cmdkOverlay.addEventListener('click', function (e) {
      if (e.target === cmdkOverlay) closeCmdk();
    });

    cmdkSearch.addEventListener('input', function () {
      filterCmdk(this.value);
      focusedIndex = -1;
    });

    cmdkSearch.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeCmdk(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); navigateCmdk(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); navigateCmdk(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        var items = visibleCmdkItems();
        if (focusedIndex >= 0 && items[focusedIndex]) goTo(items[focusedIndex]);
      }
    });

    Array.prototype.forEach.call(cmdkItems, function (item) {
      item.addEventListener('click', function () { goTo(this); });
      item.addEventListener('mouseenter', function () {
        var items = visibleCmdkItems();
        focusedIndex = items.indexOf(this);
        items.forEach(function (i, idx) { i.classList.toggle('is-focused', idx === focusedIndex); });
      });
    });

    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        cmdkOpen ? closeCmdk() : openCmdk();
      }
      if (e.key === 'Escape' && cmdkOpen) closeCmdk();
    });
  }

  /* ---------- Scroll reveal ----------
     threshold 0, not 0.1: a tall section only reaches 10% visibility well after
     its top edge has entered the viewport, which left large bands hidden at the
     fold. Any intersection at all is enough to reveal.
     Content visibility is never allowed to depend on this working — see the
     load-time sweep and the failsafe below. */
  var revealElements = document.querySelectorAll('.reveal, .dip, .rise');

  function revealAll() {
    Array.prototype.forEach.call(revealElements, function (el) { el.classList.add('is-in'); });
  }

  if (revealElements.length && !prefersReduced && 'IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0, rootMargin: '0px 0px -40px 0px' });

    Array.prototype.forEach.call(revealElements, function (el) { revealObserver.observe(el); });

    /* Anything already on screen at load reveals immediately rather than
       waiting for a scroll event that may never come on a short page. */
    window.addEventListener('load', function () {
      Array.prototype.forEach.call(revealElements, function (el) {
        var box = el.getBoundingClientRect();
        if (box.top < window.innerHeight && box.bottom > 0) el.classList.add('is-in');
      });
    });

    /* Failsafe: if something goes wrong, content must still be readable. */
    setTimeout(revealAll, 3000);
  } else {
    revealAll();
  }

  /* ---------- Counter animation ---------- */
  var counters = document.querySelectorAll('.figure[data-count], .tnum[data-count]');

  function formatCount(value, isDecimal) {
    return isDecimal ? value.toFixed(1) : Math.floor(value).toLocaleString();
  }

  function animateCounter(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    if (isNaN(target)) return;
    var isDecimal = target % 1 !== 0;
    var duration = 900;
    var startTime = null;

    function step(timestamp) {
      if (startTime === null) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = formatCount(eased * target, isDecimal);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = isDecimal ? target.toFixed(1) : target.toLocaleString();
    }

    requestAnimationFrame(step);
  }

  if (counters.length && !prefersReduced && 'IntersectionObserver' in window) {
    var counterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    Array.prototype.forEach.call(counters, function (el) { counterObserver.observe(el); });
  } else {
    /* Reduced motion, or no IntersectionObserver: show the final value immediately. */
    Array.prototype.forEach.call(counters, function (el) {
      var target = parseFloat(el.getAttribute('data-count'));
      if (!isNaN(target)) el.textContent = target % 1 !== 0 ? target.toFixed(1) : target.toLocaleString();
    });
  }
});
