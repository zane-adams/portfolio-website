# zane adams — portfolio

react + vite + three.js. one content file, one stylesheet, no ui library.

## run it

```bash
npm install
npm run dev
```

opens at http://localhost:5173

```bash
npm run build     # outputs to dist/
npm run preview   # serve the built site locally
```

## edit the content

everything you'd want to change — bio, jobs, projects, skills, links — lives in
`src/content.js`. nothing else needs touching for normal updates.

## add photos

1. drop image files into `public/media/<entry-id>/`
2. list them in `src/content.js` under that entry's `photos`:

```js
photos: [
  { src: 'dashboard.png', caption: 'graph explorer view' },
  { src: 'desk.jpg', caption: 'first week in leesburg' },
],
```

the entry ids are already created as folders: `ninja-analytics`, `great-lakes`,
`covid-icu`, `zoo-db`. clicking a photo opens it full-size (esc or arrow keys work).

## add a slide deck

powerpoint files can't render in a browser, so export the slides as images:

**file → export → change file type → png → save → "all slides"**

that gives you `slide1.png … slideN.png`. drop them into
`public/media/<entry-id>/deck/` and list them in order:

```js
deck: {
  title: 'platform walkthrough',
  slides: [
    { src: 'slide1.png', caption: 'the problem' },
    { src: 'slide2.png', caption: 'architecture' },
  ],
},
```

arrow keys move through slides once the deck has focus.

## swap the resume

replace `public/resume.pdf`. the viewer and both download links point at it.

## the 3d name

`src/components/NameCanvas.jsx`. a few things worth knowing:

- the typeface is `public/fonts/helvetiker_bold.typeface.json`. swap in
  `helvetiker_regular` (also included) for a lighter cut, or convert your own at
  gero3.github.io/facetype.js
- `size * 0.22` is the extrusion depth
- `pointer.x * 0.34` controls how far the letters swing with the mouse
- it drops to two lines under 700px wide, and respects reduced-motion settings

## deploy

`npm run build`, then drop `dist/` on vercel, netlify, or github pages. no server
needed — it's fully static.
