import { expect, loaded, save, search, test } from "./test";

test("adds a book by hand", async ({ page }) => {
  await page.goto("/books/new");
  await page.getByRole("button", { name: "Enter a book by hand instead" }).click();
  await page.locator("input[name=title]").fill("Notes From the Garden");
  await page.locator("input[name=author]").fill("Katie Doyle");
  await save(page);
  await expect(page.getByRole("heading", { name: "Notes From the Garden" })).toBeVisible();
  await expect(page.getByText("Katie Doyle").first()).toBeVisible();
});

test("finds a book, shows its cover and saves it", async ({ page }) => {
  await search(page, "lighthouse keeper");
  const result = page.getByRole("button", { name: /The Lighthouse Keeper/ });
  await expect(result).toBeVisible();
  await expect.poll(() => loaded(result.locator("img"))).toBe(true);

  await result.click();
  await expect(page.locator("input[name=title]")).toHaveValue("The Lighthouse Keeper");
  await expect(page.locator("input[name=author]")).toHaveValue("Katie Marsh");
  await expect(page.locator("input[name=isbn13]")).toHaveValue("9780000000019");
  await expect(page.locator("input[name=publisher]")).toHaveValue("Harbor Press");

  await save(page);
  await expect(page.getByRole("heading", { name: "The Lighthouse Keeper" })).toBeVisible();
  const saved = page.locator("img[src*='/covers/']").first();
  await expect(saved).toBeVisible();
  await expect.poll(() => loaded(saved)).toBe(true);
});

test("falls back to Inventaire's cover when OpenLibrary's covers are down", async ({ page }) => {
  await search(page, "winter orchard");
  const result = page.getByRole("button", { name: /Winter Orchard/ });
  await expect(result.locator("img")).toHaveAttribute("src", /\/api\/isbn-cover\?isbn=9780000000026/);
  await expect.poll(() => loaded(result.locator("img"))).toBe(true);

  await result.click();
  await expect(page.locator("input[name=title]")).toHaveValue("Winter Orchard");
  await save(page);
  await expect(page.getByRole("heading", { name: "Winter Orchard" })).toBeVisible();
  await expect.poll(() => loaded(page.locator("img[src*='/covers/']").first())).toBe(true);
});

test("saves a book whose cover can't be downloaded", async ({ page }) => {
  await search(page, "paper lanterns");
  await page.getByRole("button", { name: /Paper Lanterns/ }).click();
  await expect(page.locator("input[name=title]")).toHaveValue("Paper Lanterns");
  await save(page);
  await expect(page.getByRole("heading", { name: "Paper Lanterns" })).toBeVisible();
  await expect(page.locator("img[src*='/covers/']")).toHaveCount(0);
});

test("finds a book in the other catalogs quickly when OpenLibrary doesn't answer", async ({ page }) => {
  await search(page, "slow river");
  // OpenLibrary gets 8.5 seconds at most, and the other catalogs are asked after 3.
  const result = page.getByRole("button", { name: /Slow River Crossing/ });
  await expect(result).toBeVisible({ timeout: 12_000 });
  await result.click();
  await expect(page.locator("input[name=title]")).toHaveValue("Slow River Crossing");
  await expect(page.locator("input[name=author]")).toHaveValue("Katie Abara");
});

test("says so when a search finds nothing", async ({ page }) => {
  await search(page, "no such book anywhere");
  await expect(page.getByText(/Nothing found on OpenLibrary/)).toBeVisible();
});

test("edits a book", async ({ page }) => {
  await page.goto("/books/new");
  await page.getByRole("button", { name: "Enter a book by hand instead" }).click();
  await page.locator("input[name=title]").fill("A Draft Title");
  await save(page);

  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.locator("input[name=title]").fill("The Final Title");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The Final Title" })).toBeVisible();
});

test("deletes a book", async ({ page }) => {
  await page.goto("/books/new");
  await page.getByRole("button", { name: "Enter a book by hand instead" }).click();
  await page.locator("input[name=title]").fill("Soon to Be Gone");
  await save(page);
  const bookUrl = page.url();

  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Delete book" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).not.toHaveURL(/\/books\/\d+/);
  await page.goto(bookUrl);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});

test("moving a book to another shelf goes straight there", async ({ page }) => {
  await page.goto("/books/new");
  await page.getByRole("button", { name: "Enter a book by hand instead" }).click();
  await page.locator("input[name=title]").fill("Samantha's Shelf Test");
  await save(page);
  const synced = () => page.waitForResponse((r) => r.url().endsWith("/api/sync") && r.ok());
  // New books start on To Read.
  await expect(page.getByRole("button", { name: "Remove from To Read" })).toBeVisible();

  // Note every shelf the buttons light up from here on, with the page's refresh after the sync slowed
  // down, so there's time to catch it showing the old shelf again.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { seen: string[] }).seen = seen;
    const note = () => {
      const lit = [...document.querySelectorAll("button[aria-pressed=true]")].map((b) => b.getAttribute("aria-label")).join();
      if (seen.at(-1) !== lit) seen.push(lit);
    };
    note();
    new MutationObserver(note).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-pressed"] });
  });
  await page.route("**/books/*", async (route) => {
    if (route.request().headers()["rsc"]) await new Promise((r) => setTimeout(r, 1500));
    await route.fallback();
  });
  await Promise.all([synced(), page.getByRole("button", { name: "Mark as Reading" }).click()]);
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(["Remove from To Read", "Remove from Reading"]);
});

test("the phone's tab bar and menu are easy to tap", async ({ page }) => {
  await page.goto("/people");
  const tabs = page.getByRole("navigation", { name: "Tabs" });
  await expect(tabs.getByRole("link")).toHaveText(["Library", "Add", "Stats"]);
  // People and Tags are in the menu, which lights up while you're on one of them.
  await expect(tabs.getByRole("button", { name: "Menu" })).toHaveClass(/text-ink/);

  const tooSmall = (selector: string) =>
    page.$$eval(selector, (els) =>
      els.map((e) => [e.getAttribute("aria-label") || e.textContent?.trim(), e.getBoundingClientRect()] as const).filter(([, r]) => r.width < 40 || r.height < 40).map(([name]) => name),
    );
  expect(await tooSmall("nav[aria-label=Tabs] :is(a, button)")).toEqual([]);
  await tabs.getByRole("button", { name: "Menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu.getByRole("link", { name: "Tags" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "People" })).toBeVisible();
  expect(await tooSmall("dialog[aria-label=Menu] :is(a, button)")).toEqual([]);
});

test("removes a read after asking, on a line of its own", async ({ page }) => {
  await page.goto("/books/new");
  await page.getByRole("button", { name: "Enter a book by hand instead" }).click();
  await page.locator("input[name=title]").fill("Katie's Finished Book");
  await save(page);
  // Reading it, then finishing it, logs this year's read.
  await page.getByRole("button", { name: "Mark as Reading", exact: true }).click();
  await page.getByRole("button", { name: "Mark as Read", exact: true }).click();
  const remove = page.getByRole("button", { name: /^Remove the \d{4} read$/ });
  await expect(remove).toBeVisible();
  const box = await remove.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(40);
  expect(box!.height).toBeGreaterThanOrEqual(40);

  await remove.click();
  const question = page.getByRole("alert").filter({ hasText: "Remove this read?" });
  await expect(question).toBeVisible();
  // It sits under the read rather than squeezing it.
  const row = question.locator("xpath=..");
  const [q, r] = await Promise.all([question.boundingBox(), row.boundingBox()]);
  expect(q!.width).toBeGreaterThan(r!.width * 0.8);
  await question.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: /^Remove the \d{4} read$/ })).toHaveCount(0);
});

test("swiping the phone menu to the right closes it", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("navigation", { name: "Tabs" }).getByRole("button", { name: "Menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toHaveAttribute("data-shown", "true");
  // Still open a moment later (it once closed itself straight after opening, when the page's first effects ran late).
  await page.waitForTimeout(500);
  await expect(menu).toHaveAttribute("data-shown", "true");
  const swipe = (dx: number) =>
    menu.evaluate(async (d, dx) => {
      const fire = (type: string, x: number) => d.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "touch", pointerId: 1, isPrimary: true, clientX: x, clientY: 400 }));
      fire("pointerdown", 40);
      for (let i = 1; i <= 6; i++) {
        await new Promise((r) => setTimeout(r, 60));
        fire("pointermove", 40 + (dx * i) / 6);
      }
      fire("pointerup", 40 + dx);
    }, dx);

  // A short, slow drag springs back; a long one closes it.
  await swipe(40);
  await page.waitForTimeout(400);
  await expect(menu).toHaveAttribute("data-shown", "true");
  await swipe(250);
  await expect(menu).not.toBeVisible();
});

test("swiping in from the right-hand edge opens the phone menu", async ({ page }) => {
  await page.goto("/library");
  const menu = page.getByRole("dialog", { name: "Menu" });
  // A swipe of touches from the screen's right-hand edge, `dx` pixels to the left.
  const edgeSwipe = (dx: number) =>
    page.evaluate(async (dx) => {
      const x0 = window.innerWidth - 4;
      const target = document.elementFromPoint(x0, 400)!;
      const touch = (x: number) => new Touch({ identifier: 1, target, clientX: x, clientY: 400 });
      const fire = (type: string, x: number) => {
        const t = touch(x);
        target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [t], changedTouches: [t] }));
      };
      fire("touchstart", x0);
      for (let i = 1; i <= 6; i++) {
        await new Promise((r) => setTimeout(r, 60));
        fire("touchmove", x0 - (dx * i) / 6);
      }
      fire("touchend", x0 - dx);
    }, dx);

  // A short, slow pull lets it slide back out; a long one brings it all the way in.
  await edgeSwipe(60);
  await page.waitForTimeout(500);
  await expect(menu).not.toBeVisible();
  await edgeSwipe(250);
  await expect(menu).toHaveAttribute("data-shown", "true");
  await expect(menu.getByRole("link", { name: "Tags" })).toBeVisible();
  // It's the real, modal menu: Escape closes it.
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
});

test("robots.txt lets crawlers read only the page about BookBox", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.ok()).toBe(true);
  const body = await res.text();
  expect(body).toMatch(/Allow: \/\$/);
  expect(body).toMatch(/Allow: \/about/);
  expect(body).toMatch(/Disallow: \/$/m);
});

test("the CSV export keeps formula-like text as text", async ({ page }) => {
  await page.goto("/books/new");
  await page.getByRole("button", { name: "Enter a book by hand instead" }).click();
  await page.locator("input[name=title]").fill("=HYPERLINK(\"https://example.com\")");
  await page.locator("input[name=author]").fill("Samantha Ortiz");
  await save(page);
  const csv = await (await page.request.get("/export/books.csv")).text();
  expect(csv).toContain(`"'=HYPERLINK(""https://example.com"")"`);
  expect(csv).not.toMatch(/,=HYPERLINK|,"=HYPERLINK/);
});
