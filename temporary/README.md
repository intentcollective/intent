# Temporary trials

Each trial lives in its own subfolder, for example `temporary/redesign/`.

Rules:
- Every trial page has `<meta name="robots" content="noindex">`.
- A trial's `js/config.js` leaves the endpoints blank, so forms are off and nothing
  is written to the real Google Sheet or sends email. The schedule still displays.
- Delete the subfolder when the decision is made. If approved, port the changes to
  the live files first.
- These files are public to anyone with the link. Do not put anything private here.
