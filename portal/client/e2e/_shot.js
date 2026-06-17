// Saves full-page screenshots into the committed docs/screenshots/e2e tree so we
// have an ordered image set for a teaching video. Each module gets its own folder.
import path from 'path';

const ROOT = path.resolve(process.cwd(), '../../docs/screenshots/e2e');

export async function shot(page, module, step) {
  const safe = String(step).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  await page.screenshot({
    path: path.join(ROOT, module, `${safe}.png`),
    fullPage: true,
  });
}
