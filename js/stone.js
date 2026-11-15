// Easter egg. On the Index, clicking the logo throws Pyrrha's stone over the
// menu and down through the headline, then opens the principles page, where
// the stone falls in and lands as the title's period.
(function () {
  var KEY = 'ic-stone';
  var SPEED = 0.6;   // average horizontal pixels per millisecond on the home page
  var MIN = 1400;    // the home page throw is never quicker than this
  var SPIN = 0.8;    // degrees of turn per pixel travelled
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // One throw, one curve. The stone follows a parabola, as under gravity: it
  // rises over the menu, comes down through the middle of the headline and
  // leaves the page. On the principles page it falls in from the top at the
  // same angle and speed, under the same gravity, and lands as the period.

  // Where the stone is across its flight of X pixels, at even moments in time,
  // when its speed eases steadily from v0 down to v1.
  function slowing(X, v0, v1) {
    var T = 2 * X / (v0 + v1), a = (v0 - v1) / T, xs = [];
    for (var i = 0; i <= 60; i++) { var t = T * i / 60; xs.push(v0 * t - a * t * t / 2); }
    return { T: T, xs: xs };
  }

  // Turns follow the distance travelled along the curve, not just across it.
  function turns(points) {
    var d = 0, out = [0];
    for (var i = 1; i < points.length; i++) {
      d += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      out.push(d * SPIN);
    }
    return out;
  }

  var link = document.querySelector('.logo-link');
  if (link) link.addEventListener('click', function (e) {
    var stone = link.querySelector('.logo-stone');
    if (still || !stone || !stone.animate || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    var r = stone.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    var flying = stone.cloneNode();
    flying.className = 'thrown-stone';
    flying.src = '/assets/stone.png';   // the stone alone, without her fingers
    flying.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px';
    document.body.appendChild(flying);

    // The peak sits on the menu line; the curve crosses the headline's middle
    // at four fifths of the page width.
    var nav = document.querySelector('.site-nav'), h1 = document.querySelector('h1');
    var n = nav ? nav.getBoundingClientRect() : null, m = h1 ? h1.getBoundingClientRect() : null;
    var y0 = r.top;
    var yp = n ? n.top + n.height / 2 - r.height / 2 : 8;
    if (yp > y0 - 24) yp = Math.max(4, y0 - 60);
    var yc = m ? m.top + m.height / 2 - r.height / 2 : y0 + 200;
    if (yc <= y0) yc = y0 + 200;
    var xc = vw * 0.8 - r.left;
    var xp = xc / (1 + Math.sqrt((yc - yp) / (y0 - yp)));   // where the peak is
    var k = (y0 - yp) / (xp * xp);                          // the curve's bend, kept for page two
    var Xr = vw - r.left + 40;                              // off the right edge
    var Xb = xp + Math.sqrt((vh + 40 - yp) / k);            // or off the bottom
    var X = Math.min(Xr, Xb);
    var v0 = 2 * (X / Math.max(X / SPEED, MIN)) / 1.8;      // quicker out of the hand
    var run = slowing(X, v0, v0 * 0.8);                     // then slowing a little
    var pts = run.xs.map(function (x) { return [x, yp + k * (x - xp) * (x - xp) - y0]; });
    var rot = turns(pts);
    var frames = pts.map(function (p, i) {
      return { transform: 'translate(' + p[0] + 'px, ' + p[1] + 'px) rotate(' + rot[i] + 'deg)' };
    });
    flying.animate(frames, { duration: run.T, fill: 'forwards' }).onfinish = function () {
      try { sessionStorage.setItem(KEY, JSON.stringify({ slope: 2 * k * (X - xp), k: k, v: v0 * 0.8 })); } catch (err) {}
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
      var b = t.width;                      // one small bounce: it first touches down one stone short
      var s0 = Math.min(Math.max(thrown.slope || 0.5, 0.2), 3);   // the angle it left at, kept steep but not vertical
      var g = Math.max(thrown.k || 0, 0);   // the same gravity
      var D = t.top + t.height;             // falls in from just above the top edge
      var U = g > 0 ? (-s0 + Math.sqrt(s0 * s0 + 4 * g * D)) / (2 * g) : D / s0;
      var room = t.left - b + 40;           // or from just past the left edge
      var u0 = Math.max(0, U - room);
      var run = slowing(U - u0, thrown.v, thrown.v * 0.6);   // same speed, easing in
      var pts = run.xs.map(function (x) {
        var u = u0 + x, w = U - u;          // w: how far before touchdown
        return [-b - w, -(s0 + 2 * g * U) * w + g * w * w];
      });
      var rot = turns(pts), last = rot[rot.length - 1];
      var hop = 550, all = run.T + hop, frames = [];
      pts.forEach(function (p, i) {
        frames.push({ offset: run.T * i / 60 / all,
          transform: 'translate(' + p[0] + 'px, ' + p[1] + 'px) rotate(' + (rot[i] - last - 180) + 'deg)' });
      });
      for (var i = 1; i <= 12; i++) {      // the hop: up a little, forward one stone width, half a roll
        var p = i / 12, q = 1 - (1 - p) * (1 - p);
        frames.push({ offset: (run.T + hop * p) / all,
          transform: 'translate(' + (-b + b * q) + 'px, ' + (-t.height * 0.9 * 4 * q * (1 - q)) + 'px) rotate(' + (-180 * (1 - q)) + 'deg)' });
      }
      period.animate(frames, { duration: all });
    }
  }
})();
