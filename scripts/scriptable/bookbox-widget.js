// BookBox home screen widget for Scriptable (https://scriptable.app).
//
// Setup:
//   1. In BookBox, open Settings → API keys and make a key named "Scriptable widget".
//   2. In Scriptable, make a new script, paste this file in, and run it once. It asks for the key
//      and keeps it in the iOS Keychain.
//   3. Add a Scriptable widget to your home screen (small or medium), tap it while editing the home
//      screen, and choose this script.
//
// Small: this year's goal. Medium: the goal, what you're reading, and "Add a book".
// Lock screen (rectangular or inline): the goal.

const BOOKBOX = "https://bookbox.lol";

// Where taps go. "safari" opens BookBox in Safari (sign in there once). "webapp" tries the webapp://
// address that iOS 26 reportedly uses to open the home screen app instead. Apple hasn't documented it,
// so try it and switch back if taps stop opening anything.
const LINKS = "safari";

const KEYCHAIN_KEY = "bookbox-api-key";
const CACHE_FILE = "bookbox-summary.json";

// BookBox's dark look.
const C = {
  paper: new Color("#111214"),
  raised: new Color("#1d1e22"),
  ink: new Color("#ececed"),
  muted: new Color("#a1a3a9"),
  faint: new Color("#84868c"),
  line: new Color("#26272b"),
};
const serif = (size) => new Font("Georgia", size);
const sans = (size) => Font.systemFont(size);
const sansMedium = (size) => Font.mediumSystemFont(size);

const link = (url) => (LINKS === "webapp" ? url.replace(/^https:\/\//, "webapp://") : url);

// --- The API key ----------------------------------------------------------------------------------

async function apiKey() {
  if (Keychain.contains(KEYCHAIN_KEY)) return Keychain.get(KEYCHAIN_KEY);
  if (config.runsInWidget) return null;
  const alert = new Alert();
  alert.title = "BookBox API key";
  alert.message = "Make one in BookBox under Settings → API keys, then paste it here.";
  alert.addSecureTextField("bbx_…");
  alert.addAction("Save");
  alert.addCancelAction("Cancel");
  if ((await alert.present()) === -1) return null;
  const key = alert.textFieldValue(0).trim();
  if (!key.startsWith("bbx_")) return null;
  Keychain.set(KEYCHAIN_KEY, key);
  return key;
}

// --- Data, with the last good copy kept for when the phone is offline -------------------------------

const files = FileManager.local();
const cachePath = files.joinPath(files.documentsDirectory(), CACHE_FILE);

async function summary(key) {
  try {
    const req = new Request(`${BOOKBOX}/api/v1/summary`);
    req.headers = { Authorization: `Bearer ${key}` };
    req.timeoutInterval = 15;
    const data = await req.loadJSON();
    if (req.response.statusCode === 401) {
      // A revoked key: forget it so the next run in the app asks again.
      Keychain.remove(KEYCHAIN_KEY);
      return { error: "Key revoked. Run the script to add a new one." };
    }
    if (req.response.statusCode !== 200) throw new Error(data?.error?.message ?? `HTTP ${req.response.statusCode}`);
    files.writeString(cachePath, JSON.stringify(data));
    return data;
  } catch {
    if (files.fileExists(cachePath)) return { ...JSON.parse(files.readString(cachePath)), stale: true };
    return { error: "Can’t reach BookBox." };
  }
}

async function cover(url, key) {
  if (!url) return null;
  try {
    const req = new Request(url);
    req.headers = { Authorization: `Bearer ${key}` };
    return await req.loadImage();
  } catch {
    return null;
  }
}

// --- Drawing ---------------------------------------------------------------------------------------

function bar(fraction, width, height = 4) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const track = new Path();
  track.addRoundedRect(new Rect(0, 0, width, height), height / 2, height / 2);
  ctx.addPath(track);
  ctx.setFillColor(C.line);
  ctx.fillPath();
  const filled = Math.max(0, Math.min(1, fraction)) * width;
  if (filled > 0) {
    const fill = new Path();
    fill.addRoundedRect(new Rect(0, 0, Math.max(filled, height), height), height / 2, height / 2);
    ctx.addPath(fill);
    ctx.setFillColor(C.ink);
    ctx.fillPath();
  }
  return ctx.getImage();
}

function text(stack, value, font, color = C.ink, lines = 1) {
  const t = stack.addText(String(value));
  t.font = font;
  t.textColor = color;
  t.lineLimit = lines;
  return t;
}

function paceLine(goal) {
  if (goal.target === null) return `${goal.read} read so far`;
  if (goal.status === "reached") return "Goal reached";
  const left = goal.target - goal.read;
  if (goal.status === "on-track") return `On track · ${left} to go`;
  return `${goal.expected - goal.read} behind · ${left} to go`;
}

function goalBlock(stack, data, width) {
  const { goal, year } = data;
  text(stack, `${year} goal`.toUpperCase(), sansMedium(10), C.faint);
  stack.addSpacer(4);
  const row = stack.addStack();
  row.bottomAlignContent();
  text(row, goal.read, serif(34));
  if (goal.target !== null) text(row, ` / ${goal.target}`, serif(20), C.faint);
  stack.addSpacer(6);
  if (goal.target !== null) {
    const img = stack.addImage(bar(goal.read / goal.target, width));
    img.imageSize = new Size(width, 4);
    stack.addSpacer(6);
  }
  text(stack, paceLine(goal), sans(11), C.muted, 2);
}

async function readingBlock(stack, book, key) {
  const row = stack.addStack();
  row.url = link(book.url);
  row.centerAlignContent();
  const img = await cover(book.coverUrl, key);
  if (img) {
    const pic = row.addImage(img);
    pic.imageSize = new Size(44, 66);
    pic.cornerRadius = 3;
    row.addSpacer(10);
  }
  const col = row.addStack();
  col.layoutVertically();
  text(col, "READING", sansMedium(10), C.faint);
  col.addSpacer(2);
  text(col, book.title, serif(15), C.ink, 2);
  text(col, book.author, sans(11), C.muted);
  if (book.progress) {
    col.addSpacer(5);
    const p = col.addImage(bar(book.progress.percent / 100, 120, 3));
    p.imageSize = new Size(120, 3);
    col.addSpacer(2);
    text(col, `${Math.round(book.progress.percent)}%`, sans(10), C.faint);
  }
}

function addBookButton(stack, data) {
  const button = stack.addStack();
  button.url = link(data.links.addBook); // or data.links.scan to open the barcode scanner
  button.backgroundColor = C.raised;
  button.cornerRadius = 11;
  button.setPadding(4, 10, 4, 10);
  button.centerAlignContent();
  text(button, "＋ Add a book", sansMedium(11));
}

async function build(data, key) {
  const w = new ListWidget();
  w.backgroundColor = C.paper;
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  const family = config.widgetFamily ?? "medium";

  if (data.error) {
    w.setPadding(14, 14, 14, 14);
    text(w, "BookBox", serif(16));
    w.addSpacer(4);
    text(w, data.error, sans(11), C.muted, 3);
    w.url = link(BOOKBOX);
    return w;
  }

  if (family === "accessoryInline") {
    text(w, data.goal.target === null ? `${data.goal.read} books in ${data.year}` : `${data.goal.read}/${data.goal.target} books`, sans(12));
    w.url = link(data.links.stats);
    return w;
  }
  if (family === "accessoryRectangular") {
    text(w, `${data.year} goal`, sansMedium(11));
    text(w, data.goal.target === null ? `${data.goal.read} read` : `${data.goal.read} / ${data.goal.target}`, serif(20));
    text(w, data.reading[0]?.title ?? paceLine(data.goal), sans(11), Color.white(), 1);
    w.url = link(data.links.stats);
    return w;
  }

  if (family === "small") {
    w.setPadding(14, 14, 14, 14);
    w.url = link(data.links.stats);
    goalBlock(w, data, 120);
    w.addSpacer();
    if (data.reading[0]) text(w, data.reading[0].title, serif(12), C.muted, 1);
    return w;
  }

  // Medium (and large, which gets the same layout with more room).
  w.setPadding(14, 16, 14, 16);
  const top = w.addStack();
  top.topAlignContent();
  const left = top.addStack();
  left.layoutVertically();
  left.size = new Size(110, 0);
  left.url = link(data.links.stats);
  goalBlock(left, data, 100);
  top.addSpacer(14);
  const right = top.addStack();
  right.layoutVertically();
  if (data.reading[0]) await readingBlock(right, data.reading[0], key);
  else text(right, "Nothing on Currently Reading.", sans(12), C.muted, 2);
  if (data.reading.length > 1) {
    right.addSpacer(3);
    text(right, `+ ${data.reading.length - 1} more`, sans(10), C.faint);
  }

  w.addSpacer();
  const bottom = w.addStack();
  bottom.centerAlignContent();
  addBookButton(bottom, data);
  bottom.addSpacer();
  if (data.stale) text(bottom, "offline", sans(10), C.faint);
  return w;
}

// --- Run ---------------------------------------------------------------------------------------------

const key = await apiKey();
const data = key ? await summary(key) : { error: "Run this script in Scriptable to add your API key." };
const widget = await build(data, key);

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
