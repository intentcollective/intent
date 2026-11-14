// Easter egg. On the Index, clicking the logo throws Pyrrha's stone and opens
// the principles page, where the stone arrives from the left as the title's period.
(function () {
  var KEY = 'ic-stone';
  var SPEED = 0.6;   // horizontal pixels per millisecond, the same on both pages
  var MIN = 1400;    // never quicker than this, so short phone throws stay slow
  var SPIN = 0.8;    // degrees of turn per pixel travelled
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var head = document.querySelector('header');
  head = head ? head.getBoundingClientRect().bottom : 0;

  // One smooth arc over a horizontal distance X: a slight rise of H to a peak at
  // three quarters of the way, then a gentle fall to D below the start.
  function arc(X, H, D) {
    var peak = X * 0.75, points = [];
    for (var i = 0; i <= 40; i++) {
      var x = X * i / 40;
      var y = x <= peak ? -H * (1 - Math.pow((peak - x) / peak, 2))
                        : -H + (H + D) * Math.pow((x - peak) / (X - peak), 2);
      points.push([x, y]);
    }
    return points;
  }

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
    var X = window.innerWidth - r.left + 40;   // off the right edge
    var H = Math.max(16, Math.min(80, r.top - head - 12));
    flying.animate(arc(X, H, H * 3).map(function (p) {
      return { transform: 'translate(' + p[0] + 'px, ' + p[1] + 'px) rotate(' + p[0] * SPIN + 'deg)' };
    }), { duration: Math.max(X / SPEED, MIN), fill: 'forwards' }).onfinish = function () {
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
    if (!still && period.animate) {
      var t = period.getBoundingClientRect();
      var X = t.right + 40;          // from just past the left edge
      var H = 24;                    // a slight rise
      var D = t.top - (head + 12 + H);   // from the top left corner, just below the header
      period.animate(arc(X, H, D).map(function (p) {
        return { transform: 'translate(' + (p[0] - X) + 'px, ' + (p[1] - D) + 'px) rotate(' + (p[0] - X) * SPIN + 'deg)' };
      }), { duration: Math.max(X / SPEED, MIN) });
    }
  }
})();
