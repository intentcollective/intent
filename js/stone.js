// Easter egg. On the Index, clicking the logo throws Pyrrha's stone and opens
// the principles page, where the stone arrives from the left as the title's period.
(function () {
  var KEY = 'ic-stone';
  var SPEED = 0.6;   // average horizontal pixels per millisecond on the home page
  var MIN = 1400;    // the home page throw is never quicker than this
  var SPIN = 0.8;    // degrees of turn per pixel travelled
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var head = document.querySelector('header');
  head = head ? head.getBoundingClientRect().bottom : 0;

  // One throw, one curve. The stone follows a single parabola, as under gravity:
  // a slight rise to a peak at three quarters of the home page, then it keeps
  // falling into the principles page from the same height, angle and speed.

  // Where the stone is across its flight of X pixels, at even moments in time,
  // when its speed eases steadily from v0 down to v1.
  function slowing(X, v0, v1) {
    var T = 2 * X / (v0 + v1), a = (v0 - v1) / T, xs = [];
    for (var i = 0; i <= 60; i++) { var t = T * i / 60; xs.push(v0 * t - a * t * t / 2); }
    return { T: T, xs: xs };
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
    var X = window.innerWidth - r.left + 40;              // off the right edge
    var peak = X * 0.75;
    var H = Math.max(16, Math.min(80, r.top - head - 12)); // a slight rise, below the header
    var k = H / (peak * peak);                            // the curve's bend, kept for page two
    var v0 = 2 * (X / Math.max(X / SPEED, MIN)) / 1.8;     // quicker out of the hand
    var run = slowing(X, v0, v0 * 0.8);                    // then slowing a little
    var frames = run.xs.map(function (x) {
      return { transform: 'translate(' + x + 'px, ' + (k * (x - peak) * (x - peak) - H) + 'px) rotate(' + x * SPIN + 'deg)' };
    });
    flying.animate(frames, { duration: run.T, fill: 'forwards' }).onfinish = function () {
      var u = X - peak;   // how far past the peak it left the page
      try { sessionStorage.setItem(KEY, JSON.stringify({ top: r.top + k * u * u - H, slope: 2 * k * u, v: v0 * 0.8 })); } catch (err) {}
      window.location.href = link.href;
    };
  });

  var title = document.querySelector('.article h1');
  var thrown = null;
  try { thrown = JSON.parse(sessionStorage.getItem(KEY)); sessionStorage.removeItem(KEY); } catch (err) {}
  if (title && thrown) {
    var period = document.createElement('span');
    period.className = 'stone-period';
    period.setAttribute('aria-hidden', 'true');
    period.innerHTML = '<img src="/assets/stone.png" alt="">';
    title.appendChild(period);
    if (!still && period.animate) {
      var t = period.getBoundingClientRect();
      var X = t.right + 40;                // enters just past the left edge
      var drop = t.top - thrown.top;       // from the height where it left the home page
      var s0 = thrown.slope;               // at the angle it left
      var g = Math.max(0, (drop - s0 * X) / (X * X));   // then keeps curving down onto the title
      if (g === 0) s0 = drop / X;
      var run = slowing(X, thrown.v, thrown.v * 0.6);     // same speed, easing into place
      period.animate(run.xs.map(function (x) {
        return { transform: 'translate(' + (x - X) + 'px, ' + (s0 * x + g * x * x - drop) + 'px) rotate(' + (x - X) * SPIN + 'deg)' };
      }), { duration: run.T });
    }
  }
})();
