import fs from "node:fs";
import path from "node:path";
import { test as base, expect, type Page } from "@playwright/test";

const cover = fs.readFileSync(path.join(__dirname, "cover.jpg"));

/**
 * The browser's view of the catalogs' cover servers, matching catalog-stub.mjs on the server:
 * OpenLibrary's cover 666 won't load (its cover server is down). Inventaire's come through the server.
 */
export const test = base.extend({
  context: async ({ context }, provide) => {
    await context.route("https://covers.openlibrary.org/**", (route) =>
      route.request().url().includes("/666-") ? route.abort("connectionreset") : route.fulfill({ body: cover, contentType: "image/jpeg" }),
    );
    await provide(context);
  },
});

export { expect };

/** Opens the new-book page, searches the catalogs and waits for results. */
export async function search(page: Page, query: string) {
  await page.goto("/books/new");
  await page.getByLabel("Search for a book").fill(query);
  await page.getByRole("button", { name: "Search", exact: true }).click();
}

/** Saves the book form and waits for the book's page. */
export async function save(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/books\/\d+$/);
}

/** Whether an image has loaded (a broken one has no natural width). */
export const loaded = (img: ReturnType<Page["locator"]>) => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0);
