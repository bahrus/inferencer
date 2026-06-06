import { test, expect } from '@playwright/test';

test('InferencedPropagator › should run all propagator tests in browser', async ({ page }) => {
  await page.goto('http://localhost:8000/tests/inferencedPropagator.html');

  // Wait for tests to complete
  await page.waitForFunction(() => window.testResults !== undefined, { timeout: 10000 });

  // Get test results
  const results = await page.evaluate(() => window.testResults);

  // Log results
  console.log(`InferencedPropagator tests: ${results.passed}/${results.total} passed`);
  results.results.forEach((result: string) => console.log(result));

  // Assert all tests passed
  expect(results.passed).toBe(results.total);
});
