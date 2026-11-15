// Easter egg. On the Index, clicking the logo throws Pyrrha's stone and opens
// the principles page, where the stone arrives from the left as the title's period.
// On the way its curve touches the bottom of the menu words.
(function () {
  var KEY = 'ic-stone';
  var SPEED = 0.6;   // average horizontal pixels per millisecond on the home page
  var MIN = 1400;    // the home page throw is never quicker than this
  var SPIN = 0.8;    // degrees of turn per pixel travelled
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    flying.src = '/assets/stone.png';   // the stone alone, without her fingers
    flying.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px';
    document.body.appendChild(flying);
    var X = window.innerWidth - r.left + 40;              // off the right edge
    // The curve's top touches the bottom of the menu words, and the stone
    // leaves the page just below the header line.
    var nav = document.querySelector('.site-nav a'), hd = document.querySelector('header');
    var yp = r.top - 60, ye = r.top - 40;
    if (nav && hd) {
      var range = document.createRange(); range.selectNodeContents(nav);
      var w = range.getBoundingClientRect();
      yp = w.top + w.height / 2 + 0.36 * parseFloat(getComputedStyle(nav).fontSize);   // bottom of the capitals
      ye = hd.getBoundingClientRect().bottom + 2;
    }
    if (!(yp < ye && ye < r.top)) { yp = r.top - 60; ye = r.top - 40; }
    var xe = window.innerWidth - r.left;                   // where it meets the right edge
    var q = Math.sqrt((r.top - yp) / (ye - yp));
    var peak = xe * q / (1 + q);                           // where the top of the curve is
    // On a phone the menu sits under the wordmark; the curve peaks under the
    // middle of its last word, Zeitgeist, for a more natural arc.
    var words = document.querySelectorAll('.site-nav a');
    if (words.length && window.matchMedia('(max-width: 640px)').matches) {
      var z = words[words.length - 1].getBoundingClientRect();
      var zx = z.left + z.width / 2 - r.left - r.width / 2;
      if (zx > 0) peak = zx;
    }
    var H = r.top - yp;                                    // how high it rises
    var k = H / (peak * peak);                             // the curve's bend, kept for page two
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
    var land = function () {
      var t = period.getBoundingClientRect();
      var b = t.width;                     // one small bounce: it first touches down one stone short
      var X = t.right + 40;                // enters just past the left edge
      var A = X - b;                       // where it first touches down
      var drop = t.top - thrown.top;       // from the height where it left the home page
      var s0 = thrown.slope;               // at the angle it left
      var g = Math.max(0, (drop - s0 * A) / (A * A));   // then keeps curving down onto the title
      if (g === 0) s0 = drop / A;
      var path = function (x) { return s0 * x + g * x * x - drop; };
      // When the menu's first word lies before the title's end (on a phone),
      // the curve's top touches the bottom of its first letter, the M, then
      // falls onto the title.
      var first = document.querySelector('.site-nav a');
      var text = first && first.firstChild;
      if (text && text.nodeType === 3) {
        var range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 1);
        var m = range.getBoundingClientRect();
        var fs = parseFloat(getComputedStyle(first).fontSize);
        var xv = m.left + m.width / 2 - t.width / 2 - t.left + X;          // the M, in this flight's terms
        var yv = m.top + m.height / 2 + 0.36 * fs - t.top;                // bottom of its capital
        if (xv > 0 && xv < A * 0.6 && yv < 0) {
          var kv = -yv / ((A - xv) * (A - xv));
          path = function (x) { return yv + kv * (x - xv) * (x - xv); };
        }
      }
      var run = slowing(A, thrown.v, thrown.v * 0.6);     // same speed, easing in
      var hop = 550, all = run.T + hop, frames = [];
      run.xs.forEach(function (x, i) {
        frames.push({ offset: run.T * i / 60 / all,
          transform: 'translate(' + (x - X) + 'px, ' + path(x) + 'px) rotate(' + ((x - A) * SPIN - 180) + 'deg)' });
      });
      for (var i = 1; i <= 12; i++) {      // the hop: up a little, forward one stone width, half a roll
        var p = i / 12, q = 1 - (1 - p) * (1 - p);
        frames.push({ offset: (run.T + hop * p) / all,
          transform: 'translate(' + (-b + b * q) + 'px, ' + (-t.height * 0.9 * 4 * q * (1 - q)) + 'px) rotate(' + (-180 * (1 - q)) + 'deg)' });
      }
      period.style.visibility = '';
      period.animate(frames, { duration: all });
    };
    // Measure only after the fonts load, or the title reflows under the flight.
    if (!still && period.animate) {
      period.style.visibility = 'hidden';
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(land); else land();
    }
  }
})();
