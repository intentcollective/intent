/* ==========================================================================
   Intent Collective: line breaking
   Three small rules, applied to the text of every paragraph and list item.
   Links and other markup are left as they are.

   1. Names stay together: "Design Fellows", "Principal Design Fellow",
      "Intent Collective", "US Eastern" never split across two lines.
   2. "a" and "an" stay with the word that follows, so no line ends on them.
   3. The last words of a paragraph stay together (three in a wide paragraph,
      two in a narrow column), so a paragraph never ends on a single word.
   ========================================================================== */

(function () {
  var NBSP = "\u00A0";

  var NAMES = /\b(Principal Design Fellows?|Design Fellows?|Intent Collective|INTENT COLLECTIVE|US Eastern)\b/g;
  var ARTICLES = /\b(a|an)\s+(?=\S)/gi;

  function bind(str) {
    return str
      .replace(NAMES, function (m) { return m.replace(/\s+/g, NBSP); })
      .replace(ARTICLES, function (m, w) { return w + NBSP; });
  }

  document.querySelectorAll("p, li").forEach(function (el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var nodes = [], node;
    while ((node = walker.nextNode())) nodes.push(node);

    nodes.forEach(function (n) { n.nodeValue = bind(n.nodeValue); });

    if (el.textContent.trim().split(/\s+/).length < 5) return;

    /* Rule 3: bind the last two words in a narrow column, three in a wide
       paragraph. (Three in a narrow column would jump down together and leave
       the line above short.) */
    var wide = el.getBoundingClientRect().width >= 480;

    var last = null;
    nodes.forEach(function (n) { if (n.nodeValue.trim()) last = n; });
    if (!last) return;

    var text = last.nodeValue;
    var tail = text.match(/\s*$/)[0];
    var body = text.slice(0, text.length - tail.length);

    var bound = wide ? body.replace(/\s+(\S+)\s+(\S+)$/, NBSP + "$1" + NBSP + "$2") : body;
    if (bound === body) bound = body.replace(/\s+(\S+)$/, NBSP + "$1");
    last.nodeValue = bound + tail;
  });
})();
