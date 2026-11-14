// Easter egg. On the Index, clicking the logo throws Pyrrha's stone and opens
// the principles page, where the stone arrives from the left as the title's period.
(function () {
  var KEY = 'ic-stone';
  var SPEED = 0.6;   // horizontal pixels per millisecond, the same on both pages
  var MIN = 1400;    // the home page throw is never quicker than this
  var SPIN = 0.8;    // degrees of turn per pixel travelled
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var head = document.querySelector('header');
  head = head ? head.getBoundingClientRect().bottom : 0;

  // One throw, one curve. The stone follows a single parabola, as under gravity:
  // a slight rise to a peak at three quarters of the home page, then it keeps
  // falling into the principles page from the same height, angle and speed.

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
    var time = Math.max(X / SPEED, MIN);
    var frames = [];
    for (var i = 0; i <= 40; i++) {
      var x = X * i / 40, y = k * (x - peak) * (x - peak) - H;
      frames.push({ transform: 'translate(' + x + 'px, ' + y + 'px) rotate(' + x * SPIN + 'deg)' });
    }
    flying.animate(frames, { duration: time, fill: 'forwards' }).onfinish = function () {
      var u = X - peak;   // how far past the peak it left the page
      try { sessionStorage.setItem(KEY, JSON.stringify({ top: r.top + k * u * u - H, slope: 2 * k * u, v: X / time })); } catch (err) {}
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
      var frames = [];
      for (var i = 0; i <= 40; i++) {
        var x = X * i / 40, y = s0 * x + g * x * x;
        frames.push({ transform: 'translate(' + (x - X) + 'px, ' + (y - drop) + 'px) rotate(' + (x - X) * SPIN + 'deg)' });
      }
      period.animate(frames, { duration: X / thrown.v });
    }
  }
})();
