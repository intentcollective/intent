// Easter egg. On the Index, clicking the logo throws Pyrrha's stone and opens
// the principles page, where the stone arrives from the left as the title's period.
// On the way its curve touches the bottom of the menu words.
(function () {
  var KEY = 'ic-stone';
  var SPEED = 0.35;  // average horizontal pixels per millisecond on the home page
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

  // The stone's top when it overlaps the lower half of one capital letter:
  // its middle sits three quarters of the way down the capital.
  function lowerHalf(node, from, to, h) {
    var rg = document.createRange(); rg.setStart(node, from); rg.setEnd(node, to);
    var b = rg.getBoundingClientRect();
    var fs = parseFloat(getComputedStyle(node.parentNode).fontSize);
    return { x: b.left + b.width / 2, top: b.top + b.height / 2 + 0.36 * fs - 0.18 * fs - h / 2 };
  }

  var link = document.querySelector('.logo-link');

  // A hint, like a wave hello: three seconds in, her hand winds up
  // by itself, as it does on hover.
  var hand = link && link.querySelector('.logo-stone');
  if (hand && !still) setTimeout(function () {
    hand.classList.add('wind');
    hand.addEventListener('animationend', function () { hand.classList.remove('wind'); }, { once: true });
  }, 3000);

  if (link) link.addEventListener('click', function (e) {
    var stone = link.querySelector('.logo-stone');
    if (still || !stone || !stone.animate || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    // The piece in her hand includes her fingers; the stone alone is its
    // upper left, about 0.81 of its width (assets/stone.png, 54 by 47).
    var p = stone.getBoundingClientRect(), sw = p.width * 0.807;
    var r = { left: p.left, top: p.top, width: sw, height: sw * 47 / 54 };
    var flying = stone.cloneNode();
    flying.className = 'thrown-stone';
    flying.src = '/assets/stone.png';   // the stone alone, without her fingers
    flying.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px';
    document.body.appendChild(flying);
    stone.style.visibility = 'hidden';   // the stone has left: her hand is open and empty
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
    // One arc spans both pages. The stone overlaps the lower half of the T
    // at the end of Zeitgeist, still rising, crests just past the right edge,
    // and falls onto the principles title; on a phone it also overlaps the
    // lower half of the M in Manifesto on the way down.
    var words = document.querySelectorAll('.site-nav a');
    var last = words.length && words[words.length - 1].lastChild;
    var cross = last && last.nodeType === 3 && last.length;
    if (cross) {
      var T = lowerHalf(last, last.length - 1, last.length, r.height);
      var uT = T.x - r.width / 2 - r.left;                 // the T, in this flight's terms
      yp = T.top - 2;                                       // the crest, a touch above
      peak = uT / (1 - Math.sqrt(2 / (r.top - yp)));        // so the curve meets the T on the way up
    }
    var H = r.top - yp;                                    // how high it rises
    var k = H / (peak * peak);                             // the curve's bend, kept for page two
    var v0 = (X / Math.max(X / SPEED, MIN)) * 4 / 3;      // quick out of the hand
    var run = slowing(X, v0, v0 * 0.5);                    // then slowing to half by the edge
    var frames = run.xs.map(function (x) {
      return { transform: 'translate(' + x + 'px, ' + (k * (x - peak) * (x - peak) - H) + 'px) rotate(' + x * SPIN + 'deg)' };
    });
    flying.animate(frames, { duration: run.T, fill: 'forwards' }).onfinish = function () {
      var u = X - peak;   // how far past the peak it left the page
      try { sessionStorage.setItem(KEY, JSON.stringify({ top: r.top + k * u * u - H, slope: 2 * k * u, crest: cross ? { x: peak - X, top: yp } : null, v: v0 * 0.5 })); } catch (err) {}
      window.location.href = link.href;
    };
  });

  // Coming back to the Index (the browser may keep the page as it was),
  // the stone is in her hand again.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    var st = document.querySelector('.logo-stone');
    if (st) st.style.visibility = '';
    var fl = document.querySelector('.thrown-stone');
    if (fl) fl.remove();
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
      // It comes in nearly level, at a third of the angle it left at, so the
      // curve onto the title is wide and round rather than a straight slide.
      var s0 = Math.max(0, thrown.slope) / 3;
      var g = Math.max(0, (drop - s0 * A) / (A * A));   // then keeps curving down onto the title
      if (g === 0) s0 = drop / A;
      var path = function (x) { return s0 * x + g * x * x - drop; };
      // The curve carries on from its crest just past the Index's right edge
      // and falls in one wide, round curve onto the title. On a phone, where
      // Manifesto lies before the title's end, it first overlaps the lower
      // half of the M, with no break in its slope.
      var cx0 = thrown.crest ? thrown.crest.x : 0, cy0 = thrown.crest ? thrown.crest.top - t.top : 0;
      if (thrown.crest && cx0 < A * 0.5 && cy0 < 0) {
        var kc = -cy0 / ((A - cx0) * (A - cx0));
        path = function (x) { return cy0 + kc * (x - cx0) * (x - cx0); };
      }
      var first = document.querySelector('.site-nav a'), text = first && first.firstChild;
      if (thrown.crest && text && text.nodeType === 3) {
        var M = lowerHalf(text, 0, 1, t.height);
        var off = X - t.left;                                  // flight x to screen x
        var cx = thrown.crest.x, cy = thrown.crest.top - t.top;  // the crest, in this flight's terms
        var mx = M.x - t.width / 2 + off, my = M.top - t.top;  // the M
        if (mx > cx && mx < A * 0.6 && my > cy) {
          var k2 = (my - cy) / ((mx - cx) * (mx - cx));        // from the crest to the M
          var sM = 2 * k2 * (mx - cx);                         // the slope at the M
          var k3 = (0 - my - sM * (A - mx)) / ((A - mx) * (A - mx));   // from the M onto the title
          path = function (x) {
            return x < mx ? cy + k2 * (x - cx) * (x - cx) : my + sM * (x - mx) + k3 * (x - mx) * (x - mx);
          };
        }
      }
      var run = slowing(A, thrown.v, thrown.v * 0.6);     // same speed, easing in
      var hop = 550, all = run.T + hop, frames = [];
      run.xs.forEach(function (x, i) {
        frames.push({ offset: run.T * i / 60 / all,
          transform: 'translate(' + (x - X) + 'px, ' + path(x) + 'px) rotate(' + ((x - A) * SPIN - 360) + 'deg)' });
      });
      for (var i = 1; i <= 12; i++) {      // the hop: up a little, forward one stone width, one full roll, then still
        var p = i / 12, q = 1 - (1 - p) * (1 - p);
        frames.push({ offset: (run.T + hop * p) / all,
          transform: 'translate(' + (-b + b * q) + 'px, ' + (-t.height * 0.9 * 4 * q * (1 - q)) + 'px) rotate(' + (-360 * (1 - q)) + 'deg)' });
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
