# Temporary trials

Each trial lives in its own subfolder, for example `temporary/redesign/`.

Rules:
- Every trial page has `<meta name="robots" content="noindex">`.
- A trial must not write to the real Google Sheet or send email. The current live
  scripts fall back to the real endpoints when `config.js` is blank, so a trial copy
  has to replace every endpoint URL in its own scripts with an empty string (the
  schedule still displays, because it only reads).
- Delete the subfolder when the decision is made. If approved, port the changes to
  the live files first.
- These files are public to anyone with the link. Do not put anything private here.
