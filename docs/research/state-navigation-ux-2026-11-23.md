# State and county navigation UX

Date: 2026-11-23. Scope: the `/us/` state list and the `/us/{st}/` county list on isthereaburnban.com. Question: for someone on a phone who wants "my state / my county / my city" fast, what layout works?

## Short answer

1. **Keep an alphabetical list for states.** The 50 states plus DC are the textbook case where A–Z order works, because people know the name they want. Add a small state outline and the name as text on each row. The outline is a recognition aid only, so it stays `aria-hidden`.
2. **Put a type-ahead filter first.** It should match states, abbreviations and counties. Baymard and GOV.UK both say long pick-lists (State, Country) do worse than typing a few letters. Most of the time is spent going from state to county (Texas has 254 counties), so search counties across every state, not only within one.
3. **Keep "Use my location" next to the filter.** It skips both lists. It runs only when tapped.
4. **Do not move live states to the top.** That breaks A–Z order, so people would have to look in two places. Show coverage with one short text badge per row, color as backup only, and a one-line key. "Official links only" states get no badge. Their quiet row is the signal, which keeps 28 of 51 rows free of clutter.
5. **State page: county filter, letter jump row and A–Z groups.** When the state is live, show the counties under a ban now in a short list above the A–Z list, and mark them in the list too.

## Sources and passages

### Alphabetical order works when the user knows the name

NN/g, Jakob Nielsen, "Alphabetical Sorting Must (Mostly) Die", <https://www.nngroup.com/articles/alphabetical-sorting-must-mostly-die/>

> "If users know the name of the thing they want, they can usually find it in the list pretty quickly."
> "For example, it's usually easy enough to pick out a state from an alphabetical list of the 50 U.S. states."
> "Lists of countries and other known-item problems are also often fine to alphabetize."
> "If people have to look at several places in the list, you've defeated the purpose of the A–Z order."

NN/g, "Breaking Web Design Conventions = Breaking the User Experience", <https://www.nngroup.com/articles/breaking-web-conventions/>. Per this source, A–Z listings work when there is a well-known, common vocabulary, and fail when users don't know the official names. State and county names are a common vocabulary. A city is not: people often don't know which county their city is in. **Inference:** for "my city", the type-ahead alone is not enough. The fallback is "Use my location" or ZIP (already in the location sheet).

### Long State/Country pick-lists are hard to use; type-ahead beats them

Baymard Institute, "Drop-Down Usability", <https://baymard.com/blog/drop-down-usability>

> "Long country drop-downs, which often include over two hundred options, can be very difficult for users to get an overview of."
> "Seeing more than 20 uncategorized options can be bewildering and intimidating"
> "Scrolling large drop-downs can be a tricky, error-prone experience."
> "a well-performing alternative to a drop-down is an autocomplete field."
> "This addresses the issues of drop-downs by letting the user begin to type their country themselves."

Baymard Labs, "Redesigning the Country Selector", <https://baymard.com/labs/country-selector>. Country drop-downs showed "a lack of overview, unclear sorting, scrolling issues, inconsistent UIs, a lack of context on mobile devices". The fix is an autocomplete "handling typos, multiple spelling sequences, synonyms and prioritization". **Inference:** match the abbreviation ("tx"), match at any word start ("baton" finds East Baton Rouge Parish) and ignore the suffix ("tulsa" finds Tulsa County).

GOV.UK Design System, Select, <https://design-system.service.gov.uk/components/select/>

> "The select component should only be used as a last resort in public-facing services"
> "research shows that some users find selects very difficult to use."
> "Before using the select component, try asking users questions which will allow you to present them with fewer options."

**Inference:** "Use my location" is the "fewer options" question here. It sits next to the filter.

### How many suggestions, and how to show them

Baymard, "9 UX Best Practice Design Patterns for Autocomplete Suggestions", <https://baymard.com/blog/autocomplete-design>. On mobile, suggestions sit between the field and the keyboard, and "a target of 4–8 will work for most mobile users". Up/down arrows should move through suggestions. **What I built:** the filter narrows a real list of links, so it is not a combobox. I cap county matches at 8, then add a "keep typing" line. Keyboard users tab through real links, which avoids the ARIA combobox pitfalls on mobile screen readers.

NN/g, "Site Search Suggestions", <https://www.nngroup.com/articles/site-search-suggestions/>. On small screens, NN/g says to keep suggestions to simple text. Each county result is one line: name, then state.

### Icons must come with visible text

NN/g, "Icon Usability", <https://www.nngroup.com/articles/icon-usability/>

> "a text label must be present alongside an icon to clarify its meaning in that particular context."
> "Icon labels should be visible at all times, without any interaction from the user."
> "For navigation icons, labels are particularly critical."
> Icons are "fast to recognize at a glance (if well designed)"

**Inference:** a grid of state outlines without names would fail. Many outlines look alike (the rectangle states: CO, WY; the small New England states), and few people can name every state from its outline. Use a list row with the outline, the name, and the abbreviation in muted text. The outline helps someone scanning for "the boot", "the panhandle" or "the mitten". It must never be the only cue.

### Indexes for long lists

Apple HIG, Lists and tables, <https://developer.apple.com/design/human-interface-guidelines/lists-and-tables>:

> "An index typically consists of the letters in an alphabet, displayed vertically at the trailing side of a list. People can jump to a specific section in the list by choosing the index letter that maps to it. Because both the index and elements like disclosure indicators appear on the trailing side of a list, it can be difficult for people to use one element without activating the other."

**Inference:** a web page can't copy the native side index well. It conflicts with the trailing badges, and a thin vertical strip of letters is too small to tap. Use a wrapping row of letter links above the list instead: only letters that exist, each at least 44px tall. Section headers with `scroll-margin` mark where each letter starts. For 51 states, the index matters less than the filter. For 254 Texas counties it helps a lot.

### Announcing filter results

W3C, Understanding SC 4.1.3 Status Messages, <https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html>. Its examples treat "18 results returned" and "No results returned" as status messages, which must be announced without moving focus, using `role="status"`.

GOV.UK accessible-autocomplete, <https://github.com/alphagov/accessible-autocomplete>. It pairs the input with an `aria-live` region that reports result counts and "no results".

## Decisions (inference, built on the above)

| Question | Answer |
| --- | --- |
| Layout | A–Z list, one row per state: outline, name, abbreviation, coverage badge. One column on phones, two on wide screens. Not an icon grid, which fails the visible-label rule. Not a map: the existing `/map/` covers that, and small states are too small to tap. |
| Filter box | Yes, first on the page. Type `search`, matches name, abbreviation and county. State rows filter in place. County matches (up to 8, from all 3,143) appear above the state list. County data loads on first focus (one small JSON file), not on page load. |
| Live states first? | No. They stay in A–Z order with a badge. A one-line "Live now in: …" row of links gives the 7 live states a shortcut without reordering the list. |
| Coverage without clutter | Short text badges, "Live" and "Restrictions". Color only backs up the text. Official-links-only states get no badge. A key and the longer explanations sit in a `<details>` at the bottom. |
| State to county | (a) Searching counties from `/us/` skips the state page. (b) On the state page: county filter, letter jump row, and current bans listed first when live. |
| City | Not in our data. "Use my location" (geolocation to county) covers it. ZIP stays in the location sheet. |

## Not done / open

- City or place-name search needs a place gazetteer. Census Places would be about 30k rows, so it was left out to keep the page light.
- Typo tolerance (fuzzy matching) was left out. Prefix-of-any-word matching covers the common cases, and the abbreviation helps.
