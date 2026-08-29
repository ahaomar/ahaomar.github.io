document.addEventListener('DOMContentLoaded', function () {
  /* ---------- Command Palette (⌘K) ---------- */
  var cmdkTrigger = document.querySelector('.cmdk-trigger');
  var cmdkOverlay = document.getElementById('cmdk-overlay');
  var cmdkPanel = document.getElementById('cmdk-panel');
  var cmdkSearch = document.getElementById('cmdk-search');
  var cmdkItems = document.querySelectorAll('.cmdk-item');
  var cmdkOpen = false;
  var focusedIndex = -1;

  function openCmdk() {
    cmdkOverlay.hidden = false;
    requestAnimationFrame(function() { cmdkOverlay.classList.add('is-open'); });
    cmdkSearch.focus();
    cmdkOpen = true;
    cmdkTrigger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    focusedIndex = -1;
  }

  function closeCmdk() {
    cmdkOverlay.classList.remove('is-open');
    setTimeout(function() { cmdkOverlay.hidden = true; }, 200);
    cmdkOpen = false;
    cmdkTrigger.setAttribute('aria-expanded', 'false');
    cmdkSearch.value = '';
    filterCmdk('');
    document.body.style.overflow = '';
  }

  function filterCmdk(query) {
    var q = query.toLowerCase().trim();
    cmdkItems.forEach(function(item) {
      var text = item.textContent.toLowerCase();
      var match = !q || text.includes(q);
      item.style.display = match ? 'flex' : 'none';
    });
  }

  function navigateCmdk(direction) {
    var visibleItems = Array.from(cmdkItems).filter(function(item) { return item.style.display !== 'none'; });
    if (!visibleItems.length) return;
    focusedIndex = (focusedIndex + direction + visibleItems.length) % visibleItems.length;
    visibleItems.forEach(function(item, i) { item.classList.toggle('is-focused', i === focusedIndex); });
    if (focusedIndex >= 0) visibleItems[focusedIndex].scrollIntoView({ block: 'nearest' });
  }

  function activateCmdk() {
    var visibleItems = Array.from(cmdkItems).filter(function(item) { return item.style.display !== 'none'; });
    if (focusedIndex >= 0 && visibleItems[focusedIndex]) {
      var item = visibleItems[focusedIndex];
      var href = item.getAttribute('data-href');
      var external = item.hasAttribute('data-external');
      if (href) {
        if (external) window.open(href, '_blank', 'noopener');
        else window.location.href = href;
        closeCmdk();
      }
    }
  }

  if (cmdkTrigger && cmdkOverlay && cmdkSearch) {
    cmdkTrigger.addEventListener('click', function(e) { e.stopPropagation(); cmdkOpen ? closeCmdk() : openCmdk(); });
    cmdkOverlay.addEventListener('click', function(e) { if (e.target === cmdkOverlay) closeCmdk(); });
    cmdkSearch.addEventListener('input', function() { filterCmdk(this.value); focusedIndex = -1; });
    cmdkSearch.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { e.preventDefault(); closeCmdk(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); navigateCmdk(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); navigateCmdk(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); activateCmdk(); }
    });
    cmdkItems.forEach(function(item) {
      item.addEventListener('click', function() {
        var href = this.getAttribute('data-href');
        var external = this.hasAttribute('data-external');
        if (href) { if (external) window.open(href, '_blank', 'noopener'); else window.location.href = href; closeCmdk(); }
      });
      item.addEventListener('mouseenter', function() {
        var visibleItems = Array.from(cmdkItems).filter(function(i) { return i.style.display !== 'none'; });
        focusedIndex = visibleItems.indexOf(this);
        visibleItems.forEach(function(i, idx) { i.classList.toggle('is-focused', idx === focusedIndex); });
      });
    });
    document.addEventListener('keydown', function(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); cmdkOpen ? closeCmdk() : openCmdk(); }
      if (e.key === 'Escape' && cmdkOpen) closeCmdk();
    });
  }

  /* ---------- Scroll Reveal ---------- */
  var revealElements = document.querySelectorAll('.reveal, .history-item, .achv-list li, .expertise-cat, .stat-block');
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (revealElements.length && !prefersReduced) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    revealElements.forEach(function (el) { observer.observe(el); });
  } else {
    revealElements.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------- Counter Animation ---------- */
  var counters = document.querySelectorAll('.figure[data-count], .tnum[data-count]');
  if (counters.length && !prefersReduced) {
    var counterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { counterObserver.observe(el); });
  } else {
    counters.forEach(function (el) { el.textContent = el.getAttribute('data-count'); });
  }

  function animateCounter(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var isDecimal = target % 1 !== 0;
    var duration = 1000;
    var startTime = null;
    var suffix = el.nextElementSibling?.classList.contains('figure-unit') ? '' : '';
    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = eased * target;
      el.textContent = isDecimal ? current.toFixed(1) : Math.floor(current).toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = isDecimal ? target.toFixed(1) : target.toLocaleString();
    }
    requestAnimationFrame(step);
  }

  /* ---------- Hero Code Card Type-in Effect ---------- */
  var codeCard = document.querySelector('.code-card-body code');
  if (codeCard && !prefersReduced) {
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          typeInCode(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    observer.observe(codeCard);
  }

  function typeInCode(el) {
    var lines = el.querySelectorAll('code > *');
    var delay = 0;
    lines.forEach(function(line, i) {
      if (line.nodeType === Node.TEXT_NODE) return;
      var text = line.textContent;
      line.textContent = '';
      line.style.opacity = '1';
      setTimeout(function() {
        typeLine(line, text, 0);
      }, delay);
      delay += 150;
    });
  }

  function typeLine(el, text, i) {
    if (i <= text.length) {
      el.textContent = text.slice(0, i);
      requestAnimationFrame(function() { typeLine(el, text, i + 1); });
    }
  }
});