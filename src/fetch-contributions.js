/**
 * Fetches a user's public contribution calendar.
 *
 * Two sources, in order:
 *   1. GraphQL API  - used when a token is available (exact counts, official).
 *   2. github.com/users/<login>/contributions - public HTML fragment, no auth.
 *
 * Both return the same shape:
 *   { weeks, days, total, cells: [{ week, day, level, count, date }] }
 */

const UA = 'github-space-shooter (+https://github.com)';

export async function fetchContributions(username, token) {
  if (token) {
    try {
      return await fetchViaGraphQL(username, token);
    } catch (err) {
      console.warn(`GraphQL fetch failed (${err.message}); falling back to HTML.`);
    }
  }
  return fetchViaHtml(username);
}

async function fetchViaGraphQL(username, token) {
  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
                contributionLevel
              }
            }
          }
        }
      }
    }`;

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': UA,
    },
    body: JSON.stringify({ query, variables: { login: username } }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors[0].message);

  const calendar = body.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) throw new Error(`no calendar for user "${username}"`);

  const LEVELS = {
    NONE: 0,
    FIRST_QUARTILE: 1,
    SECOND_QUARTILE: 2,
    THIRD_QUARTILE: 3,
    FOURTH_QUARTILE: 4,
  };

  const cells = [];
  calendar.weeks.forEach((week, w) => {
    week.contributionDays.forEach((day) => {
      const d = new Date(day.date + 'T00:00:00Z').getUTCDay();
      cells.push({
        week: w,
        day: d,
        level: LEVELS[day.contributionLevel] ?? 0,
        count: day.contributionCount,
        date: day.date,
      });
    });
  });

  return summarize(cells, calendar.totalContributions);
}

async function fetchViaHtml(username) {
  const url = `https://github.com/users/${encodeURIComponent(username)}/contributions`;
  const res = await fetch(url, {
    headers: { 'x-requested-with': 'XMLHttpRequest', 'user-agent': UA },
  });
  if (!res.ok) throw new Error(`could not load contributions for "${username}" (HTTP ${res.status})`);
  const html = await res.text();

  // Counts live in the screen-reader tooltips, keyed by the cell id.
  const counts = new Map();
  for (const m of html.matchAll(/<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const text = m[2];
    counts.set(m[1], /^No contributions/i.test(text) ? 0 : parseInt(text.replace(/,/g, ''), 10) || 0);
  }

  const cells = [];
  for (const m of html.matchAll(/<td[^>]*class="ContributionCalendar-day"[^>]*>/g)) {
    const tag = m[0];
    const id = tag.match(/id="([^"]+)"/)?.[1];
    const date = tag.match(/data-date="([^"]+)"/)?.[1];
    const level = Number(tag.match(/data-level="(\d)"/)?.[1] ?? 0);
    if (!id || !date) continue;
    // id looks like contribution-day-component-<dayOfWeek>-<weekIndex>
    const parts = id.split('-');
    const day = Number(parts[parts.length - 2]);
    const week = Number(parts[parts.length - 1]);
    cells.push({ week, day, level, count: counts.get(id) ?? 0, date });
  }

  if (!cells.length) throw new Error(`no contribution cells found for "${username}"`);

  const totalText = html.match(/([\d,]+)\s*\n?\s*contributions?\s*\n?\s*in the last year/i)?.[1];
  const total = totalText
    ? parseInt(totalText.replace(/,/g, ''), 10)
    : cells.reduce((sum, c) => sum + c.count, 0);

  return summarize(cells, total);
}

function summarize(cells, total) {
  const weeks = Math.max(...cells.map((c) => c.week)) + 1;
  return { weeks, days: 7, total, cells };
}
