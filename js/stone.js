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
    var out = -(r.bottom + 40);
    flying.animate([
      { transform: 'translate(0, 0) rotate(0deg)' },
      { transform: 'translate(320px, ' + (out * 0.8) + 'px) rotate(500deg)', offset: 0.6 },
      { transform: 'translate(560px, ' + out + 'px) rotate(900deg)' }
    ], { duration: 600, easing: 'linear', fill: 'forwards' }).onfinish = function () {
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
    ], { duration: 800 });
  }
})();
