"""
SSRF-Hardened Business Website Intelligence Fetcher & Catalog Analyzer
----------------------------------------------------------------------
Safely fetches a client's public business website (or public CSV/JSON feed),
extracts business metadata, product/service catalogs, prices (KES/USD/EUR),
contact channels (WhatsApp/Phone/Email), and runs a Data Scientist catalog &
pricing distribution audit ready for one-click import into BizWave.
"""

from __future__ import annotations

import csv
import io
import ipaddress
import json
import math
import re
import socket
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import httpx
import numpy as np
from bs4 import BeautifulSoup

MAX_BYTES = 2 * 1024 * 1024  # 2 MB cap
REQUEST_TIMEOUT = 10.0

PRICE_NUMBER = r"(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]{1,2})?"
CURRENCY_MARKER = r"(?:KES|Kshs?\.?|USD|US\$|\$|EUR|€|UGX|TZS)"
PRICE_RE = re.compile(rf"{CURRENCY_MARKER}\s*({PRICE_NUMBER})(?![0-9.,])", re.IGNORECASE)
PHONE_RE = re.compile(r"(?:\+254|254|0)(?:7\d{8}|1\d{8})")
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")


class UnsafeUrlError(ValueError):
    """Raised when a URL fails SSRF / scheme / host safety validation."""


def _resolve_public_url(raw_url: str) -> Tuple[str, List[str]]:
    """Resolve once, reject every non-public answer, and return the pinned IPs."""
    url = (raw_url or "").strip()
    if not url:
        raise UnsafeUrlError("Please enter a valid business website URL.")
    if not re.match(r"^https?://", url, re.IGNORECASE):
        if "://" in url:
            raise UnsafeUrlError("Only http:// and https:// website URLs are supported.")
        url = "https://" + url
    if any(ord(ch) < 32 for ch in url):
        raise UnsafeUrlError("Invalid website URL.")
    parsed = urlparse(url)
    try:
        port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
        host = (parsed.hostname or "").encode("idna").decode("ascii").lower()
    except (ValueError, UnicodeError) as exc:
        raise UnsafeUrlError("Invalid website address or port.") from exc
    if parsed.scheme.lower() not in ("http", "https") or not host or parsed.username or parsed.password:
        raise UnsafeUrlError("Use a public http or https URL without credentials.")
    if host in ("localhost", "127.0.0.1", "0.0.0.0", "::1") or host.endswith((".local", ".internal", ".localhost")):
        raise UnsafeUrlError("Private, localhost, or internal network addresses are blocked for security.")
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, OSError) as exc:
        raise UnsafeUrlError(f"Could not resolve domain '{host}'. Check the URL spelling.") from exc
    if not infos:
        raise UnsafeUrlError(f"No public IP address found for '{host}'.")
    addresses: List[str] = []
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError as exc:
            raise UnsafeUrlError("Invalid network address.") from exc
        # is_global also rejects shared carrier-grade NAT and other non-routable ranges.
        if not ip.is_global or ip.is_multicast or ip.is_unspecified:
            raise UnsafeUrlError(f"Blocked non-public network target ({host}) to protect platform security.")
        if str(ip) not in addresses:
            addresses.append(str(ip))
    return url, addresses


def validate_public_url(raw_url: str) -> str:
    return _resolve_public_url(raw_url)[0]


def _safe_fetch(client: httpx.Client, url: str) -> Tuple[Optional[httpx.Response], Optional[str]]:
    """Pin each connection to a verified public IP, preserving Host and TLS SNI.

    Redirect destinations are resolved and checked independently. The response is
    streamed with an actual byte limit; compressed bodies are refused so a tiny
    compressed response cannot expand into an unbounded decompression bomb.
    """
    cur_url = url
    deadline = time.monotonic() + REQUEST_TIMEOUT * 2
    for _ in range(4):
        validated, addresses = _resolve_public_url(cur_url)
        logical = httpx.URL(validated)
        hostname = logical.raw_host.decode("ascii")
        host_header = logical.netloc.decode("ascii")
        last_error: Optional[Exception] = None
        redirect: Optional[str] = None
        for address in addresses:
            response: Optional[httpx.Response] = None
            try:
                pinned = logical.copy_with(host=address)
                request = client.build_request("GET", pinned, headers={"Host": host_header, "Accept-Encoding": "identity", "Connection": "close"},
                                               extensions={"sni_hostname": hostname})
                response = client.send(request, stream=True, follow_redirects=False)
                if response.status_code in (301, 302, 303, 307, 308) and response.headers.get("location"):
                    redirect = urljoin(validated, response.headers["location"])
                    break
                encoding = response.headers.get("content-encoding", "identity").strip().lower()
                if encoding not in ("", "identity"):
                    return None, "Compressed website responses are not supported by the safe importer."
                try:
                    if int(response.headers.get("content-length", "0")) > MAX_BYTES:
                        return None, "Response exceeded 2 MB safety limit."
                except ValueError:
                    return None, "Website returned an invalid content length."
                chunks: List[bytes] = []
                size = 0
                for chunk in response.iter_raw():
                    size += len(chunk)
                    if size > MAX_BYTES:
                        return None, "Response exceeded 2 MB safety limit."
                    if time.monotonic() > deadline:
                        return None, "Website took too long to respond."
                    chunks.append(chunk)
                # Expose the logical URL, never the pinned IP, to callers and users.
                return httpx.Response(response.status_code, headers=response.headers, content=b"".join(chunks),
                                      request=httpx.Request("GET", validated)), None
            except httpx.HTTPError as exc:
                last_error = exc
            finally:
                if response is not None:
                    response.close()
        if redirect:
            cur_url = redirect
            continue
        if last_error is not None:
            return None, "Could not connect to the public website."
        return None, "Could not fetch the website."
    return None, "Too many redirects while fetching website."


def _parse_price(raw: Any) -> Optional[float]:
    if raw is None or isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        value = float(raw)
    else:
        # Parse a complete price, not just a numeric prefix of a range,
        # negative number, malformed grouping or higher-precision amount.
        text = str(raw).strip()
        match = re.fullmatch(rf"(?:{CURRENCY_MARKER}\s*)?({PRICE_NUMBER})(?:\s*{CURRENCY_MARKER})?", text, re.IGNORECASE)
        if not match:
            return None
        value = float(match.group(1).replace(",", ""))
    return value if math.isfinite(value) and 0 < value < 50_000_000 else None


def _normalize_currency(value: Any) -> Optional[str]:
    text = str(value or "").strip().upper()
    return text if re.fullmatch(r"[A-Z]{3}", text) else None


def _detect_currency(text: str) -> Optional[str]:
    t = text.upper()
    if "KES" in t or "KSH" in t:
        return "KES"
    if "USD" in t or "US$" in t:
        return "USD"
    if "EUR" in t or "€" in t:
        return "EUR"
    if "UGX" in t:
        return "UGX"
    if "TZS" in t:
        return "TZS"
    # A bare dollar sign and a missing currency are ambiguous.
    return None


def _extract_from_json_ld(soup: BeautifulSoup) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    org_meta: Dict[str, Any] = {}
    items: List[Dict[str, Any]] = []

    def walk(node: Any):
        if isinstance(node, list):
            for x in node:
                walk(x)
            return
        if not isinstance(node, dict):
            return
        if "@graph" in node:
            walk(node["@graph"])
        t = str(node.get("@type", "")).lower()
        if any(k in t for k in ("organization", "localbusiness", "store", "restaurant")):
            if node.get("name") and not org_meta.get("name"):
                org_meta["name"] = str(node["name"]).strip()[:140]
            if node.get("telephone") and not org_meta.get("phone"):
                org_meta["phone"] = str(node["telephone"]).strip()
            if node.get("email") and not org_meta.get("email"):
                org_meta["email"] = str(node["email"]).strip()
        if any(k in t for k in ("product", "menuitem", "service")):
            name = str(node.get("name", "")).strip()
            offers = node.get("offers")
            price = None
            currency = None
            in_stock = True
            if isinstance(offers, list) and offers:
                offers = offers[0]
            if isinstance(offers, dict):
                price = _parse_price(offers.get("price") or offers.get("lowPrice"))
                currency = _normalize_currency(offers.get("priceCurrency"))
                avail = str(offers.get("availability", "")).lower()
                if "outofstock" in avail:
                    in_stock = False
            if name:
                items.append(
                    {
                        "name": name[:160],
                        "sku": str(node.get("sku") or "")[:48] or None,
                        "category": str(node.get("category") or "Website Catalog")[:80],
                        "price": price,
                        "currency": currency,
                        "in_stock": in_stock,
                        "source": "json_ld",
                    }
                )
        for v in node.values():
            if isinstance(v, (dict, list)):
                walk(v)

    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = script.string or script.get_text() or ""
        try:
            walk(json.loads(raw))
        except Exception:
            continue
    return org_meta, items


def _extract_from_html_cards(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    """Heuristic extraction of product/service cards containing a name + price."""
    items: List[Dict[str, Any]] = []
    seen = set()
    candidates = soup.find_all(["article", "li", "div", "tr"], limit=500)
    for el in candidates:
        txt = " ".join(el.get_text(" ", strip=True).split())
        if not txt or len(txt) > 260 or len(txt) < 6:
            continue
        pm = PRICE_RE.search(txt)
        if not pm:
            continue
        price = _parse_price(pm.group(1))
        if not price:
            continue
        heading = el.find(["h1", "h2", "h3", "h4", "h5", "strong", "a"])
        name = heading.get_text(" ", strip=True) if heading else txt[: pm.start()].strip(" -|:•")
        name = " ".join(name.split())[:140]
        if len(name) < 2 or name.lower() in seen or PRICE_RE.fullmatch(name):
            continue
        seen.add(name.lower())
        items.append(
            {
                "name": name,
                "sku": None,
                "category": "Website Catalog",
                "price": price,
                "currency": _detect_currency(pm.group(0)),
                "in_stock": True,
                "source": "html_catalog",
            }
        )
        if len(items) >= 80:
            break
    return items


def _extract_from_csv_text(text: str) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        norm = {str(k).strip().lower(): str(v).strip() for k, v in row.items() if k}
        name = norm.get("name") or norm.get("product") or norm.get("item") or norm.get("title")
        price = _parse_price(norm.get("price") or norm.get("selling_price") or norm.get("unit_price") or norm.get("amount"))
        if name:
            items.append(
                {
                    "name": name[:160],
                    "sku": (norm.get("sku") or norm.get("code") or "")[:48] or None,
                    "category": (norm.get("category") or "Website CSV Feed")[:80],
                    "price": price,
                    "currency": _normalize_currency(norm.get("currency")) or _detect_currency(norm.get("price") or norm.get("selling_price") or norm.get("unit_price") or norm.get("amount") or ""),
                    "in_stock": True,
                    "source": "csv_feed",
                }
            )
        if len(items) >= 150:
            break
    return items


def analyze_html_snapshot(url: str, html: str, extra_products: Optional[List[Dict[str, Any]]] = None, platform_hint: str = "Custom Website") -> Dict[str, Any]:
    """Pure analyzer function (also directly unit-testable without network calls)."""
    soup = BeautifulSoup(html, "html.parser")
    title = (soup.title.get_text(strip=True) if soup.title else "")[:160]
    meta_desc = ""
    md = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"property": "og:description"})
    if md and md.get("content"):
        meta_desc = str(md["content"]).strip()[:300]

    full_text = soup.get_text(" ", strip=True)
    phones = sorted(set(PHONE_RE.findall(full_text)))[:5]
    emails = sorted(set(e for e in EMAIL_RE.findall(full_text) if not e.endswith((".png", ".jpg", ".svg"))))[:5]
    has_whatsapp = bool(soup.find("a", href=re.compile(r"wa\.me|whatsapp\.com", re.I)))

    org_meta, ld_items = _extract_from_json_ld(soup)
    html_items = _extract_from_html_cards(soup)

    # Detect platform signatures
    lower_html = html.lower()
    platform = platform_hint
    if platform == "Custom Website":
        if "cdn.shopify.com" in lower_html or "shopify" in lower_html:
            platform = "Shopify Storefront"
        elif "woocommerce" in lower_html or "wp-content" in lower_html:
            platform = "WooCommerce / WordPress"
        elif "wixstatic.com" in lower_html:
            platform = "Wix Business Site"
        elif "squarespace" in lower_html:
            platform = "Squarespace"

    # Merge & deduplicate extracted catalog items (Shopify/Woo -> JSON-LD -> HTML cards)
    merged: List[Dict[str, Any]] = []
    seen_names = set()
    for src_list in (extra_products or [], ld_items, html_items):
        if len(merged) >= 120:
            break
        for item in src_list:
            key = item["name"].strip().lower()
            if not key or key in seen_names:
                continue
            seen_names.add(key)
            merged.append(item)
            if len(merged) >= 120:
                break

    # Never combine mixed or unspecified currencies into one price statistic.
    priced_items = [i for i in merged if i.get("price") and float(i["price"]) > 0]
    currency_set = {i.get("currency") or "unknown" for i in priced_items}
    currency = next(iter(currency_set)) if len(currency_set) == 1 and "unknown" not in currency_set else None
    priced = [float(i["price"]) for i in priced_items] if currency else []
    pricing_stats: Dict[str, Any] = {
        "currency": currency,
        "total_items_found": len(merged),
        "priced_items_count": len(priced_items),
        "comparable_prices": bool(currency),
        "min_price": round(float(np.min(priced)), 2) if priced else None,
        "median_price": round(float(np.median(priced)), 2) if priced else None,
        "mean_price": round(float(np.mean(priced)), 2) if priced else None,
        "max_price": round(float(np.max(priced)), 2) if priced else None,
        "price_std": round(float(np.std(priced)), 2) if len(priced) >= 2 else None,
    }

    # Category Pie & Price-Tier Pie
    cat_counts: Dict[str, int] = {}
    for item in merged:
        cat = item.get("category") or "Website Catalog"
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
    category_pie = [
        {"label": k, "value": v}
        for k, v in sorted(cat_counts.items(), key=lambda kv: kv[1], reverse=True)[:8]
    ]

    price_tier_pie: List[Dict[str, Any]] = []
    if priced:
        q33 = float(np.percentile(priced, 33))
        q66 = float(np.percentile(priced, 66))
        budget = sum(1 for p in priced if p <= q33)
        core = sum(1 for p in priced if q33 < p <= q66)
        premium = sum(1 for p in priced if p > q66)
        price_tier_pie = [
            {"label": f"Entry (≤ {currency} {round(q33):,})", "value": budget},
            {"label": f"Core ({currency} {round(q33):,}–{round(q66):,})", "value": core},
            {"label": f"Premium (> {currency} {round(q66):,})", "value": premium},
        ]
        price_tier_pie = [x for x in price_tier_pie if x["value"] > 0]

    # Readiness score & Pro Recommendations
    score = 35
    if title:
        score += 10
    if meta_desc:
        score += 10
    if phones or emails or has_whatsapp:
        score += 15
    if len(merged) >= 3:
        score += 15
    if len(priced) >= 3:
        score += 15
    readiness_score = min(100, score)

    insights: List[str] = []
    insights_sw: List[str] = []
    if len(merged) > 0:
        if priced:
            insights.append(f"Found {len(merged)} catalog items ({len(priced_items)} with public prices). Median detected price: {currency} {round(pricing_stats['median_price']):,}.")
            insights_sw.append(f"Bidhaa {len(merged)} zimepatikana ({len(priced_items)} zina bei ya wazi). Bei ya katikati: {currency} {round(pricing_stats['median_price']):,}.")
        else:
            insights.append(f"Found {len(merged)} catalog items ({len(priced_items)} with public prices). Prices with mixed or unspecified currencies are not combined.")
            insights_sw.append(f"Bidhaa {len(merged)} zimepatikana ({len(priced_items)} zina bei ya wazi). Bei zenye sarafu tofauti au isiyojulikana hazijachanganywa.")
        insights.append("Only items with an explicit positive KES price can be imported. Purchase costs and opening stock are not inferred.")
        insights_sw.append("Bidhaa zenye bei ya KES iliyo wazi pekee zinaweza kuingizwa. Gharama na kiasi cha stoo havikadiriwi.")
    else:
        insights.append(
            "Website profile loaded, but no structured public product prices were exposed on the landing page. You can link a specific /shop or /menu page URL or published CSV link for deeper catalog import."
        )
        insights_sw.append("Tovuti imefunguliwa lakini hakuna bei za bidhaa zilizopatikana kwenye ukurasa huu. Jaribu ukurasa wa bidhaa, menyu au faili ya CSV iliyo wazi.")
    if not has_whatsapp:
        insights.append("No direct WhatsApp click-to-chat link detected on this page.")
        insights_sw.append("Hakuna kiungo cha moja kwa moja cha WhatsApp kilichopatikana kwenye ukurasa huu.")
    if priced and pricing_stats["max_price"] > pricing_stats["median_price"] * 2.5:
        insights.append(
            f"Wide pricing spread ({currency} {round(pricing_stats['min_price']):,} to {currency} {round(pricing_stats['max_price']):,}) may be worth reviewing when you plan bundles."
        )
        insights_sw.append(f"Bei zinatofautiana kutoka {currency} {round(pricing_stats['min_price']):,} hadi {currency} {round(pricing_stats['max_price']):,}; unaweza kuzikagua unapopanga vifurushi.")
    if not meta_desc:
        insights.append("No meta description detected. Consider adding a clear description of your business and location.")
        insights_sw.append("Hakuna maelezo ya ukurasa yaliyopatikana. Fikiria kuongeza maelezo ya biashara yako na mahali ilipo.")

    return {
        "url": url,
        "business_profile": {
            "name": org_meta.get("name") or title or urlparse(url).hostname,
            "title": title,
            "description": meta_desc,
            "platform": platform,
            "phones": phones or ([org_meta["phone"]] if org_meta.get("phone") else []),
            "emails": emails or ([org_meta["email"]] if org_meta.get("email") else []),
            "has_whatsapp_link": has_whatsapp,
            "readiness_score": readiness_score,
        },
        "pricing_stats": pricing_stats,
        "charts": {
            "category_pie": category_pie,
            "price_tier_pie": price_tier_pie,
        },
        "products": merged,
        "insights": insights,
        "insights_sw": insights_sw,
    }


def analyze_business_website(raw_url: str) -> Dict[str, Any]:
    """Fetch a live public SME website (or public CSV/JSON feed) safely & analyze all business records."""
    safe_url = validate_public_url(raw_url)
    headers = {
        "User-Agent": "BizWave-IntelligenceBot/2.0 (+https://bizwave.co.ke; SME Analytics Sync)",
        "Accept": "text/html,application/json,text/csv;q=0.9,*/*;q=0.8",
    }

    with httpx.Client(timeout=REQUEST_TIMEOUT, headers=headers, trust_env=False, limits=httpx.Limits(max_keepalive_connections=0)) as client:
        resp, err = _safe_fetch(client, safe_url)
        if err or resp is None:
            raise UnsafeUrlError(err or "Unable to fetch website.")
        if resp.status_code >= 400:
            raise UnsafeUrlError(f"Website returned HTTP {resp.status_code}. Check that the page is publicly reachable.")

        ctype = (resp.headers.get("content-type") or "").lower()
        body_text = resp.text

        # Direct CSV feed support (e.g., published Google Sheet / catalog CSV)
        if "text/csv" in ctype or safe_url.lower().endswith(".csv"):
            items = _extract_from_csv_text(body_text)
            return analyze_html_snapshot(safe_url, f"<html><head><title>{urlparse(safe_url).hostname} CSV Feed</title></head><body></body></html>", items, "Public CSV Data Feed")

        # Direct JSON catalog feed support
        if "application/json" in ctype or safe_url.lower().endswith(".json"):
            try:
                parsed_json = resp.json()
                raw_list = parsed_json.get("products", parsed_json) if isinstance(parsed_json, dict) else parsed_json
                items = []
                if isinstance(raw_list, list):
                    for row in raw_list[:120]:
                        if not isinstance(row, dict):
                            continue
                        name = str(row.get("title") or row.get("name") or "").strip()
                        price = _parse_price(row.get("price") or (row.get("variants", [{}])[0].get("price") if isinstance(row.get("variants"), list) and row.get("variants") else None))
                        if name:
                            items.append(
                                {
                                    "name": name[:160],
                                    "sku": str(row.get("sku") or row.get("handle") or "")[:48] or None,
                                    "category": str(row.get("product_type") or row.get("category") or "JSON Catalog")[:80],
                                    "price": price,
                                    "currency": _normalize_currency(row.get("currency") or (parsed_json.get("currency") if isinstance(parsed_json, dict) else None)),
                                    "in_stock": True,
                                    "source": "json_feed",
                                }
                            )
                return analyze_html_snapshot(safe_url, f"<html><head><title>{urlparse(safe_url).hostname} JSON Feed</title></head><body></body></html>", items, "Public JSON Store API")
            except Exception:
                pass

        # Standard Website HTML + automatic Shopify / WooCommerce storefront catalog probing
        parsed = urlparse(str(resp.url))
        origin = f"{parsed.scheme}://{parsed.netloc}"
        extra_products: List[Dict[str, Any]] = []
        platform_hint = "Custom Website"

        lower_html = body_text.lower()
        if "shopify" in lower_html:
            platform_hint = "Shopify Storefront"
            try:
                s_resp, _ = _safe_fetch(client, f"{origin}/products.json?limit=80")
                if s_resp and s_resp.status_code == 200:
                    data = s_resp.json()
                    for p in data.get("products", [])[:80]:
                        variants = p.get("variants") or []
                        v0 = variants[0] if variants else {}
                        extra_products.append(
                            {
                                "name": str(p.get("title", ""))[:160],
                                "sku": str(v0.get("sku") or p.get("handle") or "")[:48] or None,
                                "category": str(p.get("product_type") or "Shopify Store")[:80],
                                "price": _parse_price(v0.get("price")),
                                "currency": None,  # Shopify products.json does not declare a currency.
                                "in_stock": bool(v0.get("available", True)),
                                "source": "shopify_api",
                            }
                        )
            except Exception:
                pass
        elif "woocommerce" in lower_html or "wp-content" in lower_html:
            platform_hint = "WooCommerce / WordPress"
            try:
                w_resp, _ = _safe_fetch(client, f"{origin}/wp-json/wc/store/v1/products?per_page=80")
                if w_resp and w_resp.status_code == 200:
                    arr = w_resp.json()
                    if isinstance(arr, list):
                        for p in arr[:80]:
                            prices = p.get("prices") or {}
                            minor_raw = prices.get("currency_minor_unit")
                            minor = int(minor_raw) if minor_raw is not None and str(minor_raw).isdigit() and 0 <= int(minor_raw) <= 4 else None
                            raw_p = _parse_price(prices.get("price"))
                            adj_p = round(raw_p / (10 ** minor), 2) if raw_p is not None and minor is not None else None
                            cats = p.get("categories") or []
                            extra_products.append(
                                {
                                    "name": str(p.get("name", ""))[:160],
                                    "sku": str(p.get("sku") or "")[:48] or None,
                                    "category": str(cats[0].get("name") if cats else "WooCommerce")[:80],
                                    "price": adj_p,
                                    "currency": _normalize_currency(prices.get("currency_code")),
                                    "in_stock": bool(p.get("is_in_stock", True)),
                                    "source": "woocommerce_api",
                                }
                            )
            except Exception:
                pass

        return analyze_html_snapshot(str(resp.url), body_text, extra_products, platform_hint)
