# Arkansas captures

| Fixture | Exact request URL | Capture time (UTC) |
| --- | --- | --- |
| `faulkner-banner-2026-11-24.html` | [Faulkner County homepage](https://www.faulknercountyar.gov/) | 2026-11-24 10:31:53 |
| `faulkner-order-26-204-2026-11-24.pdf` | [County Court Order 26-204](https://www.faulknercountyar.gov/wp-content/uploads/2026/11/Faulkner-County-Court-Order-26-204.pdf) | 2026-11-24 10:31:54 |
| [Shared rescission fixture](../../lib/fixtures/faulkner-rescind.pdf) | [County Court Order 26-202](https://www.faulknercountyar.gov/wp-content/uploads/2026/11/Burn-Ban-Rescind-26-202.pdf) | Recaptured 2026-11-24 10:31:55 with the same SHA-256 |

Each request was a public GET with normal TLS validation. The homepage fixture preserves the current Elementor widget markup and omits the rest of the site header, body, and scripts. The PDFs are unmodified county scans. The homepage supplies the November 18 effective time of 9 a.m. Central. Section I of Order 26-204 limits the ban to unincorporated Faulkner County. Section III describes written permits in special circumstances. The November 3 rescission names Order 26-170.

The fetcher checks the banner and the SHA-256 digest of its linked PDF. The WordPress page and search APIs omit the sitewide widget. Review the boundaries, effective time, exceptions and rescinded order number whenever the county publishes a new link or replaces a scan. The site's display window is capped at 30 days from the effective time. The signed order itself runs until lifted.
