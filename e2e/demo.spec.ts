import fs from "node:fs";
import path from "node:path";
import { STATEMENTS } from "../src/lib/demo-seed";
import { expect, save, test } from "./test";

test("every book in the sample library has a cover", () => {
  const books = STATEMENTS.filter((s) => s.startsWith('INSERT OR IGNORE INTO "books"'));
  expect(books.length).toBeGreaterThan(0);
  for (const s of books) {
    const cover = s.match(/'([a-z0-9-]+\.webp)'/)?.[1];
    expect(cover, s.slice(0, 160)).toBeTruthy();
    expect(fs.existsSync(path.join(__dirname, "../public/demo-covers", cover!)), cover).toBe(true);
  }
});

test("the demo starts with the sample library, and Start over undoes changes", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/library/);
  await expect(page.getByRole("note")).toContainText("You’re trying BookBox");
  await expect(page.getByText("Dracula").first()).toBeVisible();

  await page.goto("/books/new");
  await page.getByRole("button", { name: "Enter a book by hand instead" }).click();
  await page.locator("input[name=title]").fill("Samantha's Garden Notes");
  await page.locator("input[name=author]").fill("Samantha Reyes");
  await save(page);
  await expect(page.getByRole("heading", { name: "Samantha's Garden Notes" })).toBeVisible();

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByText("Dracula").first()).toBeVisible();
  await expect(page.getByText("Samantha's Garden Notes")).toHaveCount(0);
});

test("the demo switches off integrations", async ({ page }) => {
  await page.goto("/spotify");
  await expect(page).toHaveURL(/\/settings$/);
  expect((await page.request.get("/api/v1/books")).status()).toBe(404);
});

test("the demo's robots.txt keeps crawlers out", async ({ request }) => {
  const body = await (await request.get("/robots.txt")).text();
  expect(body).toMatch(/Disallow: \/$/m);
  expect(body).not.toMatch(/Allow:/);
});
