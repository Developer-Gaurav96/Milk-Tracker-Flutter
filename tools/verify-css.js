const fs = require("fs");
const css = fs.readFileSync("www/css/tailwind.css", "utf8");

// Collect every class selector Tailwind generated.
// IMPORTANT: unescape each selector chunk BEFORE splitting on whitespace —
// arbitrary values like pb-[max(0.75rem,env(safe-area-inset-bottom))] are
// emitted with escaped spaces (\2c ) which a naive split would tear apart.
const present = new Set();
const ruleRe = /([^{}]+)\{/g;
let rm;
while ((rm = ruleRe.exec(css))) {
  const selectorChunk = rm[1];
  selectorChunk.split(",").forEach((part) => {
    const unescaped = part.replace(/\\(.)/g, "$1");
    unescaped.trim().split(/\s+/).forEach((tok) => {
      if (!tok.startsWith(".")) return;
      let sel = tok.slice(1);
      // Strip trailing pseudo-classes but KEEP variant prefixes (sm:, dark:,
      // active:…) — those are part of the utility class name.
      sel = sel.replace(/:(active|hover|focus|focus-visible|disabled)$/, "");
      present.add(sel);
    });
  });
}

const html = fs.readFileSync("index.html", "utf8");
const jsFiles = [
  "js/calendar.js", "js/modal.js", "js/confirm.js", "js/invoices.js",
  "js/pdf.js", "js/settings.js", "js/app.js", "js/capacitor-files.js"
];
const js = jsFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");
const all = html + "\n" + js;

const classAttrs = all.match(/class(?:Name)?="([^"]*)"/g) || [];
const used = new Set();
classAttrs.forEach((a) => {
  const inner = a.replace(/class(?:Name)?="/, "").replace(/"$/, "");
  inner.split(/\s+/).forEach((c) => { if (c && !/[{}]/.test(c)) used.add(c); });
});

const styleBlock = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const custom = new Set();
(styleBlock.match(/\.([A-Za-z0-9_\-]+)/g) || []).forEach((s) => custom.add(s.slice(1)));

const missing = [...used].filter((c) => !present.has(c) && !custom.has(c));
console.log("used:", used.size, "| custom(style):", custom.size, "| tailwind in css:", present.size);
console.log("NOT FOUND anywhere:", missing);
