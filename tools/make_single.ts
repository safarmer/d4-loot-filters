// Folds the single-bundle build (dist-single/) into one HTML file: dist-single/editor.html.
// The file is a page fragment (title, style, root, script) for the Artifact tool, which adds the
// document skeleton; it also opens in a browser through any static server.
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const dir = join(import.meta.dirname, "..", "dist-single");
const assets = readdirSync(join(dir, "assets"));
const one = (ext: string) => {
  const f = assets.filter((a) => a.endsWith(ext));
  if (f.length !== 1) throw new Error(`expected one ${ext} in dist-single/assets, found ${f.length}`);
  return readFileSync(join(dir, "assets", f[0]), "utf8");
};
const css = one(".css");
const js = one(".js").replaceAll("</script", "<\\/script");
const html = `<title>D4 Slot Editor</title>
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;
writeFileSync(join(dir, "editor.html"), html);
console.log(`dist-single/editor.html: ${(html.length / 1024).toFixed(0)} KB`);
