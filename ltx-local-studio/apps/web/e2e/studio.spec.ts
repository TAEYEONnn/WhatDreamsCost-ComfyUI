import { test, expect } from "@playwright/test";

test.describe("Studio - 새 프로젝트 생성", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("초기 로딩 후 스튜디오 레이아웃이 표시된다", async ({ page }) => {
    await expect(page.locator("text=LTX Studio")).toBeVisible();
  });

  test("새 프로젝트 다이얼로그를 열 수 있다", async ({ page }) => {
    await page.click("text=+ 새 프로젝트");
    await expect(page.locator("text=새 프로젝트").first()).toBeVisible();
    await expect(page.locator("input[value='새 프로젝트']")).toBeVisible();
  });

  test("프로젝트를 생성하고 샷을 추가할 수 있다", async ({ page }) => {
    // Open new project dialog
    await page.click("text=+ 새 프로젝트");
    const nameInput = page.locator("input").first();
    await nameInput.clear();
    await nameInput.fill("E2E 테스트 프로젝트");
    await page.click("text=만들기");

    // Project name should appear in header
    await expect(page.locator("text=E2E 테스트 프로젝트")).toBeVisible();

    // Add a shot
    await page.click("button:has-text('+')");
    await expect(page.locator("text=Shot 1")).toBeVisible();
  });

  test("인스펙터에서 Shot을 선택하면 프롬프트 입력이 가능하다", async ({ page }) => {
    // Create project
    await page.click("text=+ 새 프로젝트");
    const nameInput = page.locator("input").first();
    await nameInput.clear();
    await nameInput.fill("Inspector Test");
    await page.click("text=만들기");

    // Add and select a shot
    await page.click("button:has-text('+')");
    await page.click("text=Shot 1");

    // Inspector should show prompt textarea
    await expect(page.locator("text=프롬프트")).toBeVisible();
    const promptTextarea = page.locator("textarea").first();
    await promptTextarea.fill("A cinematic shot of mountains");
    await expect(promptTextarea).toHaveValue("A cinematic shot of mountains");
  });

  test("프로바이더 상태가 헤더에 표시된다", async ({ page }) => {
    // Provider status badge should be visible
    await expect(
      page.locator("button:has-text('Mock Provider')").or(page.locator("button:has-text('연결됨')")).or(page.locator("button:has-text('확인 중')"))
    ).toBeVisible({ timeout: 5000 });
  });
});
