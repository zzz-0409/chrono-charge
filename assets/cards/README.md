Generated card illustrations can live here.

Add a path such as `art: "assets/cards/star_scout.png"` to a card in
`src/data/cards.js`, and the renderer will use that image inside the card art
window. Cards without `art` fall back to the generic type icon.

When generating card illustrations, leave generous background around the
character or main object. The renderer can place the frame over the artwork, so
faces, weapons, logos, and other important details should stay well inside the
center of the image instead of touching the edges.
