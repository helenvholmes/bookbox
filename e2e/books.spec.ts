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
