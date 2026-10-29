import { expect, save, test } from "./test";

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
