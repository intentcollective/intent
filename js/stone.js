// Easter egg. On the Index, clicking the logo throws Pyrrha's stone and opens
// the principles page, where the stone lands as the title's period.
(function () {
  var KEY = 'ic-stone';
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var link = document.querySelector('.logo-link');
  if (link) link.addEventListener('click', function (e) {
    var stone = link.querySelector('.logo-stone');
    if (still || !stone || !stone.animate || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    var r = stone.getBoundingClientRect();
    var flying = stone.cloneNode();
    flying.className = 'thrown-stone';
    flying.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px';
    document.body.appendChild(flying);
    // A long, slow arc: a slight upward throw that stays below the header, the
    // peak at about three quarters of the page width, then a fall off the right edge.
    var X = window.innerWidth - r.left + 40;          // horizontal travel, off the right edge
    var peak = window.innerWidth * 0.75 - r.left;     // where it starts to fall
    var head = document.querySelector('header').getBoundingClientRect().bottom;
    var H = Math.max(16, Math.min(80, r.top - head - 12)); // a slight rise, below the header
    var drop = window.innerHeight * 0.4;              // how far it has fallen at the edge
    var frames = [];
    for (var i = 0; i <= 40; i++) {
      var x = X * i / 40;
      var y = x <= peak ? -H * (1 - Math.pow((peak - x) / peak, 2))
                        : -H + (H + drop) * Math.pow((x - peak) / (X - peak), 2);
      frames.push({ transform: 'translate(' + x + 'px, ' + y + 'px) rotate(' + (900 * i / 40) + 'deg)' });
    }
    flying.animate(frames, { duration: 1800, easing: 'linear', fill: 'forwards' }).onfinish = function () {
      try { sessionStorage.setItem(KEY, '1'); } catch (err) {}
      window.location.href = link.href;
    };
  });

  var title = document.querySelector('.article h1');
  var landed = false;
  try { landed = sessionStorage.getItem(KEY) === '1'; sessionStorage.removeItem(KEY); } catch (err) {}
  if (title && landed) {
    var period = document.createElement('span');
    period.className = 'stone-period';
    period.setAttribute('aria-hidden', 'true');
    period.innerHTML = '<img src="/assets/stone.png" alt="">';
    title.appendChild(period);
    if (!still && period.animate) period.animate([
      { transform: 'translate(40px, -70vh) rotate(-900deg)', easing: 'cubic-bezier(.5, 0, .9, .6)' },
      { transform: 'translate(0, 0) rotate(0deg)', offset: 0.8, easing: 'ease-out' },
      { transform: 'translate(0, -0.12em)', offset: 0.9, easing: 'ease-in' },
      { transform: 'translate(0, 0)' }
    ], { duration: 1200 });
  }
})();
