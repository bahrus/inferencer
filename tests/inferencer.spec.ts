import { test, expect } from '@playwright/test';

test('Inferencer Enhancement › should run all inferencer tests in browser', async ({ page }) => {
  // Start local server and navigate
  await page.goto('http://localhost:8000/tests/inferencer.html');
  
  // Wait for tests to complete
  await page.waitForFunction(() => window.testResults !== undefined, { timeout: 5000 });
  
  // Get test results
  const results = await page.evaluate(() => window.testResults);
  
  // Log results
  console.log(`Inferencer tests: ${results.passed}/${results.total} passed`);
  results.results.forEach((result: string) => console.log(result));
  
  // Assert all tests passed
  expect(results.passed).toBe(results.total);
});
