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

test("adds a person only once when Add person is pressed again while it saves", async ({ page }) => {
  await page.goto("/people");
  await page.getByRole("button", { name: "+ Add person" }).click();
  await page.getByLabel("First name").fill("Katie");
  await page.getByLabel("Last name").fill("Twice");

  // Slow the save down, so the extra presses land while it's still running.
  await page.route("**/people", async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  const add = page.getByRole("button", { name: "Add person", exact: true });
  // Three presses in one go, quicker than anyone could tap.
  await add.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
    button.click();
  });
  await expect(page.getByRole("button", { name: "Adding…" })).toBeDisabled();
  await expect(page).toHaveURL(/\/people\/katie-twice/);

  await page.unroute("**/people");
  await page.goto("/people");
  await expect(page.getByRole("link", { name: /Katie Twice/ })).toHaveCount(1);
});

test("imports a Goodreads export only once when Import is pressed again while it runs", async ({ page }) => {
  await page.goto("/settings");
  await page.locator("#goodreads-file").setInputFiles({
    name: "goodreads_library_export.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Title,Author,Exclusive Shelf\nImported Just Once,Samantha Reyes,to-read\n"),
  });
  const add = page.getByRole("button", { name: "Import 1 book" });
  await expect(add).toBeVisible();

  await page.route("**/settings", async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await add.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
    button.click();
  });
  await expect(page.getByText("Added 1 book")).toBeVisible();
  await page.unroute("**/settings");

  const csv = await (await page.request.get("/export/books.csv")).text();
  expect(csv.split("Imported Just Once").length - 1).toBe(1);
});
