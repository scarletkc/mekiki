# Advertising

mekiki sells a few fixed ad slots, each priced per month. This document lists the slots
and their prices, and the rules every ad follows. The rules come first: a site that rates
AI models is only worth reading while nobody can pay to change what it says.

## Ground rules

1. **Money never touches the ratings.** Scores, tiers, sort order, the model list, the
   Spotlight cards, the changelog and the Method page are computed the same way whoever
   advertises. Advertisers get no preview of a rating, no say in it and no early notice
   of a change. An advertiser who disputes a rating uses the public issue forms, like
   anyone else.
2. **Every ad is labelled**: "Sponsored" in English, "广告" in Simplified Chinese and
   "廣告" in Traditional Chinese.
3. **No ad looks like data.** No ad is styled as a table row or a Spotlight card, uses
   tier colours, or shows a score, a rank or a chart.
4. **No ad quotes mekiki.** Ads do not cite mekiki ratings, tiers or ranks ("#1 on
   mekiki"), and do not use the mekiki name or logo.
5. **One advertiser per slot per month.** No rotation, no targeting, no tracking: every
   visitor sees the same ad.
6. **The slots in this document are all there are.** A new slot is added here first.

## Where ads never appear

The model table, the charts (apart from the export credit), the Compare page, the Method
page, the changelog and its feeds, the discussion threads, `/llms.txt`, the Markdown
versions of pages, and every API file except `api.json` (see [The API](#the-api)).

## Slots and prices

Prices are in US dollars per calendar month.

| Slot | Where | Ad | Price |
| --- | --- | --- | --- |
| Home banner | Home page, between the Spotlight cards and the model table | Logo, name, headline | $300 |
| Model pages | Every model page, at the end of the side column | Logo, name, a sentence | $200 |
| Chart export credit | Chart footer, next to the site address, on the page and in every exported PNG | "Sponsored by" and a name | $150 |
| Share image credit | The preview image of every page, shown wherever a mekiki link is shared | "Sponsored by" and a name | $150 |
| API | The API page, under the title, and a `sponsor` object in `api.json` | Logo, name, headline | $120 |
| README | The GitHub README, below the intro and above Features | Logo, name, headline | $150 |

Paying for three months in advance takes 10% off; six months, 20%. A booked price holds for
the whole booking, and prices are reviewed every quarter.

mekiki runs no analytics, so it sells slots, not impressions. It promises and reports no
reach, impression or click figures. To measure clicks, put UTM parameters on your link.

## What an ad looks like

- **Content.** A name, a logo (SVG, or a square PNG of at least 128 px), one `https` link,
  and the text the slot takes: a headline of up to 60 characters plus a short headline of
  up to 32 characters for phones, or a sentence of up to 120 characters. A name in a
  credit is up to 24 characters. The text can carry a promo code ("10% off with code
  AI10"), which also lets you count sign-ups.
- **Languages.** English, with optional Simplified and Traditional Chinese versions. A page
  in a language you did not supply shows the English version.
- **Served by mekiki.** The logo and text are committed to the repository and served from
  mekiki's own domain. No third-party scripts, iframes, pixels, cookies or ad-server
  redirects. Links carry `rel="sponsored noopener"`.
- **Quiet.** No animation, video, sound, pop-ups or sticky bars. Each slot has a fixed size,
  so an ad never shifts the page, and works in dark and light themes. The Home and API
  banners stay on one row: on phones they show the logo, the short headline and the label,
  without the name.
- **Truthful.** Claims are about your own product and are accurate. No comparisons with
  named rival products.

## Who can advertise

Welcome: AI apps and tools, model APIs, routers, relays and hosts, coding plans, developer
tools, cloud and GPU providers, and model makers, including those whose models are listed.

Not accepted: gambling; crypto tokens, trading and airdrops; adult content; weapons;
political ads; misleading health or money claims.

mekiki can turn down any ad without giving a reason.

## The API

The API is open data, and its fields are only ever added. An ad in it follows stricter
rules than one on a page:

- **One top-level object in `api.json`, and nowhere else.** No ad goes in `models[]`,
  `/api/models.json`, the per-model files or `/api/history.json`, and an ad never changes
  a value, a field or the order of anything.
- **Labelled and structured.** It is plain data a client can skip or drop:

  ```json
  "sponsor": {
    "label": "Sponsored",
    "name": "Example Co",
    "text": "Example headline",
    "url": "https://example.com/?utm_source=mekiki"
  }
  ```

  With no API advertiser, `sponsor` is `null`. Adding the field does not change `version`.
- **Not in AI-readable text.** `/llms.txt` and the Markdown versions of pages are read by
  AI agents as content; an ad there would be text injected into someone else's prompt.
  They carry no ads.
- **The same for everyone.** The API is static files, and every caller gets the same
  response.

## Booking

To book, write to [i@scarletkc.com](mailto:i@scarletkc.com) with the slot or slots, the months, your
company, the link and the ad.

- **Terms.** Calendar months, starting on the 1st, first come first served. The current
  advertiser of a slot can renew it until the 20th of the month before; after that the
  slot is open to anyone.
- **Payment.** In advance, before the ad goes live. Payment details are agreed when you
  book.
- **Review.** Each ad is checked against this document, and fixes are agreed before it
  goes live.
- **In public.** Every ad goes in through a pull request to the public repository, so which
  advertiser held which slot, and when, is on the record. The price of a booking is not.
- **Removal.** mekiki can take down an ad that breaks these rules and refunds the unused
  days. A booking cancelled before it starts is refunded in full; once a month has
  started, that month is not refunded.
- **Downtime.** There is no uptime guarantee. If mekiki is down for more than three days of
  a booked month, those days are added to the end of the booking.
- **After a booking ends.** Sites cache preview images, and the repository keeps its
  history, so a credit can still be seen for a while after a booking ends.

## Donations

The Sponsor link in the site footer goes to GitHub Sponsors. It is for donations and buys
no placement; the slots above are booked separately.

## Changes to this document

These rules and prices can change. A booking keeps the rules and the price it was made
under until it ends.
