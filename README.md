# Winds of Valen - Interactive Map

Standalone, read-only version of the interactive map. Pan, zoom, search, and filter by marker type; clicking a marker opens its page on the live wiki in a new tab.

## Hosting on GitHub Pages (free)

1. Create a new public repository on your GitHub account (e.g. `wov-map`).
2. Push the contents of this folder (`index.html`, `style.css`, `app.js`, `map.jpg`, `map_markers.json`) to that repo's root.
3. In the repo, go to **Settings -> Pages**, set **Source** to your default branch (e.g. `main`) and folder `/ (root)`, then save.
4. GitHub will publish the site at `https://<your-username>.github.io/<repo-name>/` within a minute or two.

## Updating the map later

To publish changes (new markers, a new map image, etc.), just overwrite the relevant file(s) in the repo and push - GitHub Pages redeploys automatically.
