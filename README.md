Install dependencies, rebuild CSS on change, and open the site:

```bash
npm install
npm run watch
npm run preview
```

`watch` only compiles Tailwind into `dist/output.css`. `preview` serves the folder over HTTP so the mosaic scripts can load (opening `index.html` as a file will not).

See `LICENSE` for details.