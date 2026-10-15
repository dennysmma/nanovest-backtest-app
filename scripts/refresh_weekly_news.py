#!/usr/bin/env python3
"""Build the public NanoMind weekly news snapshot for GitHub Pages."""

from __future__ import annotations

import email.utils
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path


COMPANIES = [
    ("AAPL", "Apple", ["apple", "iphone"]),
    ("MSFT", "Microsoft", ["microsoft", "azure"]),
    ("NVDA", "NVIDIA", ["nvidia"]),
    ("GOOGL", "Alphabet", ["alphabet", "google"]),
    ("AMZN", "Amazon", ["amazon", "aws"]),
    ("META", "Meta Platforms", ["meta platforms", "facebook"]),
    ("TSLA", "Tesla", ["tesla"]),
    ("AVGO", "Broadcom", ["broadcom"]),
    ("AMD", "Advanced Micro Devices", ["advanced micro devices"]),
    ("JPM", "JPMorgan Chase", ["jpmorgan", "jp morgan"]),
    ("WMT", "Walmart", ["walmart"]),
    ("LLY", "Eli Lilly", ["eli lilly"]),
    ("NFLX", "Netflix", ["netflix"]),
    ("ORCL", "Oracle", ["oracle"]),
    ("BABA", "Alibaba", ["alibaba"]),
    ("005930.KS", "Samsung Electronics", ["samsung electronics"]),
    ("7203.T", "Toyota Motor", ["toyota motor", "toyota"]),
    ("0700.HK", "Tencent", ["tencent"]),
    ("BBCA.JK", "Bank Central Asia", ["bank central asia", "bca"]),
    ("BBRI.JK", "Bank Rakyat Indonesia", ["bank rakyat indonesia", "bri"]),
    ("TLKM.JK", "Telkom Indonesia", ["telkom indonesia", "telkomsel"]),
    ("GOTO.JK", "GoTo Gojek Tokopedia", ["goto group", "gojek", "tokopedia"]),
    ("ANTM.JK", "Aneka Tambang", ["antam", "aneka tambang"]),
    ("ASII.JK", "Astra International", ["astra international"]),
    ("UNVR.JK", "Unilever Indonesia", ["unilever indonesia"]),
]

POSITIVE = re.compile(
    r"\b(beat|beats|record|surge|surges|soar|soars|raise|raises|raised|upgrade|upgrades|profit|growth|approved|approval|wins|won|rally|rallies|rallied|rise|rises|rose|gain|gains|gained|climb|climbs|climbed|jump|jumps|jumped|higher|strong|outperform|outperformed|soared|boost|boosts)\b",
    re.I,
)
NEGATIVE = re.compile(
    r"\b(miss|misses|missed|cut|cuts|cutting|downgrade|downgrades|loss|losses|decline|declines|fall|falls|fell|drop|drops|dropped|plunge|plunges|plunged|tumble|tumbles|tumbled|slump|slumps|slumped|sink|sinks|sank|lower|investigation|probe|recall|recalls|layoff|layoffs|weak|warning|warns|lawsuit|fine|fined|selloff)\b",
    re.I,
)
UNCERTAIN = re.compile(r"\?|\b(can|could|might|may|will)\b", re.I)
WINDOW = timedelta(days=7)


def query_groups():
    names = [company[1] for company in COMPANIES]
    for offset in range(0, len(names), 4):
        group = names[offset : offset + 4]
        terms = " OR ".join(f'"{name}"' if " " in name else name for name in group)
        yield f"({terms}) (stock OR shares OR earnings OR revenue OR profit OR guidance OR outlook) when:7d"


def fetch_group(query: str) -> list[dict]:
    params = urllib.parse.urlencode(
        {"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"}
    )
    url = "https://news.google.com/rss/search?" + params
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; NanoMindWeekly/1.0)"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        root = ET.fromstring(response.read())
    channel = root.find("channel")
    if channel is None:
        raise ValueError("Google News returned an invalid RSS feed")

    items = []
    for item in channel.findall("item"):
        title = (item.findtext("title") or "").strip()
        url = (item.findtext("link") or "").strip()
        raw_date = item.findtext("pubDate")
        source_node = item.find("source")
        source = (source_node.text or "").strip() if source_node is not None else ""
        parts = title.rsplit(" - ", 1)
        if not source:
            source = parts[-1].strip() if len(parts) > 1 else "Google News"
        try:
            published = email.utils.parsedate_to_datetime(raw_date)
            if published.tzinfo is None:
                published = published.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError, OverflowError):
            published = datetime.now(timezone.utc)
        if title and url:
            items.append(
                {
                    "title": title,
                    "url": url,
                    "source": source,
                    "publishedAt": published.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
                }
            )
    return items


def build_snapshot() -> dict:
    all_items = []
    failures = []
    for index, query in enumerate(query_groups(), start=1):
        try:
            all_items.extend(fetch_group(query))
        except Exception as error:  # Keep usable results if one query is temporarily unavailable.
            failures.append(f"query {index}: {error}")
        if index < 7:
            time.sleep(0.4)

    unique = {item["url"]: item for item in all_items if item["url"]}
    now = datetime.now(timezone.utc)
    cutoff = now - WINDOW
    news = [
        item
        for item in unique.values()
        if datetime.fromisoformat(item["publishedAt"].replace("Z", "+00:00")) >= cutoff
    ]
    news.sort(key=lambda item: item["publishedAt"], reverse=True)
    if not news:
        details = "; ".join(failures) if failures else "Google News returned no recent headlines"
        raise RuntimeError(f"No recent public news was collected ({details})")

    matched = {}
    for item in news:
        title = item["title"]
        uncertain = bool(UNCERTAIN.search(title))
        positive = bool(not uncertain and POSITIVE.search(title))
        negative = bool(not uncertain and NEGATIVE.search(title))
        for ticker, company, aliases in COMPANIES:
            if not any(re.search(r"\b" + re.escape(alias) + r"\b", title, re.I) for alias in aliases):
                continue
            row = matched.setdefault(
                ticker,
                {
                    "ticker": ticker,
                    "company": company,
                    "positive": 0,
                    "negative": 0,
                    "unclear": 0,
                    "mentions": 0,
                    "sources": [],
                },
            )
            row["mentions"] += 1
            if positive and not negative:
                row["positive"] += 1
            elif negative and not positive:
                row["negative"] += 1
            else:
                row["unclear"] += 1
            if len(row["sources"]) < 4:
                row["sources"].append(item)

    items = []
    for row in matched.values():
        if row["positive"] > row["negative"]:
            outlook = "Bullish"
        elif row["negative"] > row["positive"]:
            outlook = "Bearish"
        elif row["positive"] + row["negative"]:
            outlook = "Mixed"
        else:
            outlook = "No clear signal"
        row["outlook"] = outlook
        mentions = row["mentions"]
        row["impact"] = (
            f"{mentions} related headline{'s' if mentions != 1 else ''} · "
            f"{row['positive']} bullish, {row['negative']} bearish, "
            f"{row['unclear']} without a clear direction"
        )
        items.append(row)
    items.sort(key=lambda row: (-row["mentions"], row["company"].casefold()))
    items = items[:10]

    bullish = sum(row["outlook"] == "Bullish" for row in items)
    bearish = sum(row["outlook"] == "Bearish" for row in items)
    leading = ", ".join(f"{row['company']} ({row['outlook'].lower()})" for row in items[:3])
    if items:
        summary = (
            f"The scan reviewed {len(news)} unique, company-related headlines from the past seven days. "
            f"The most-covered tracked companies were {leading}. Across the top {len(items)}, "
            f"{bullish} showed more bullish than bearish headline signals and {bearish} showed more bearish; "
            "mixed or non-directional coverage is labeled without assigning an outlook."
        )
    else:
        summary = (
            f"The scan reviewed {len(news)} company-related headlines from the past seven days but found "
            "no verified matches to the tracked ticker list, so no ticker impacts are shown."
        )

    snapshot = {
        "updatedAt": now.isoformat().replace("+00:00", "Z"),
        "brief": news[:8],
        "items": items,
        "summary": summary,
    }
    if failures:
        print("Some news queries failed: " + "; ".join(failures), file=sys.stderr)
    return snapshot


def main() -> None:
    output = Path(sys.argv[1] if len(sys.argv) > 1 else "weekly-updates.json")
    snapshot = build_snapshot()
    output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {output}: {snapshot['updatedAt']}, "
        f"{len(snapshot['brief'])} brief headlines, {len(snapshot['items'])} ticker matches"
    )


if __name__ == "__main__":
    main()
