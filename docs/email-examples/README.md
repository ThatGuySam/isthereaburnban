# Email examples

Each pair comes from the Worker templates. The site and subscription token are fixtures.

| Message | Plain text | HTML |
| --- | --- | --- |
| Confirm a signup | [Text](confirmation.txt) | [HTML](confirmation.html) |
| Burn ban | [Text](burn-ban.txt) | [HTML](burn-ban.html) |
| Burn ban lifted | [Text](ban-lifted.txt) | [HTML](ban-lifted.html) |
| Local order lifted | [Text](order-lifted.txt) | [HTML](order-lifted.html) |
| Order extended | [Text](order-extended.txt) | [HTML](order-extended.html) |
| Burning restrictions | [Text](restrictions.txt) | [HTML](restrictions.html) |
| County bulletin | [Text](county-bulletin.txt) | [HTML](county-bulletin.html) |
| Several county updates | [Text](multiple-counties.txt) | [HTML](multiple-counties.html) |
| Source incident | [Text](source-incident.txt) | [HTML](source-incident.html) |
| Operator simulation | [Text](operator-simulation.txt) | [HTML](operator-simulation.html) |
| Operator sandbox check | [Text](operator-sandbox.txt) | [HTML](operator-sandbox.html) |
| Scheduled delivery check template | [Text](scheduled-check.txt) | [HTML](scheduled-check.html) |

The daily canary currently uses push. Its email template has a sample for any email-channel check. Successful unsubscribe shows a web page.

Regenerate these examples after an intentional copy change with `UPDATE_EMAIL_EXAMPLES=1 bun test src/worker/email-message.test.ts`. Run the same test without the flag to check the committed examples.
