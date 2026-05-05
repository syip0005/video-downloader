"""Best-effort URL canonicalization for cache lookups.

Reduces equivalent URLs to a stable identifier so the cache hits even when
the user pastes a tracking-decorated or short-form variant. Pure string
manipulation — no network calls, so canonicalization is safe to do inline
on the request path.

Trade-off: shortened links that require an HTTP redirect to resolve (e.g.
`vm.tiktok.com/<token>`) can't be deduped against the underlying canonical
URL without a fetch. We treat them as a distinct identifier rather than
pretending we can.
"""

import re
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

_TRACKING_PARAMS = frozenset(
    {
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "si",
        "fbclid",
        "gclid",
        "igshid",
        "spm",
        "ref",
        "ref_src",
        "ref_url",
        "feature",
        "feature_id",
        "_branch_match_id",
        "t",  # YouTube/X timestamp — same video, different start time.
    }
)


def canonicalize(url: str) -> str:
    """Return a stable identifier for `url`.

    Falls back to a normalized form (lowercased host, tracking params dropped,
    trailing slash trimmed) for hosts we don't have a specific rule for.
    """
    try:
        u = urlparse(url.strip())
    except ValueError:
        return url

    host = (u.hostname or "").lower().lstrip(".")

    if vid := _youtube_id(host, u):
        return f"youtube:{vid}"
    if vid := _twitter_id(host, u):
        return f"twitter:{vid}"
    if vid := _reddit_id(host, u):
        return f"reddit:{vid}"
    if vid := _tiktok_id(host, u):
        return f"tiktok:{vid}"

    clean_query = urlencode(
        [
            (k, v)
            for k, v in parse_qsl(u.query, keep_blank_values=True)
            if k not in _TRACKING_PARAMS
        ]
    )
    path = u.path.rstrip("/") or "/"
    return urlunparse((u.scheme.lower(), host, path, "", clean_query, ""))


def _youtube_id(host: str, u) -> str | None:  # type: ignore[no-untyped-def]
    if host == "youtu.be":
        return u.path.lstrip("/").split("/")[0] or None
    if host == "youtube.com" or host.endswith(".youtube.com"):
        if u.path == "/watch":
            return dict(parse_qsl(u.query)).get("v")
        m = re.match(r"^/(?:shorts|embed|v|live)/([^/?#]+)", u.path)
        if m:
            return m.group(1)
    return None


def _twitter_id(host: str, u) -> str | None:  # type: ignore[no-untyped-def]
    if host in {"twitter.com", "x.com", "mobile.twitter.com", "mobile.x.com"}:
        m = re.match(r"^/[^/]+/status/(\d+)", u.path)
        if m:
            return m.group(1)
    return None


def _reddit_id(host: str, u) -> str | None:  # type: ignore[no-untyped-def]
    if host == "reddit.com" or host.endswith(".reddit.com"):
        m = re.match(r"^/r/[^/]+/comments/([^/]+)", u.path)
        if m:
            return m.group(1)
    return None


def _tiktok_id(host: str, u) -> str | None:  # type: ignore[no-untyped-def]
    if host.endswith("tiktok.com"):
        m = re.match(r"^/@[^/]+/video/(\d+)", u.path)
        if m:
            return m.group(1)
        if host == "vm.tiktok.com":
            m = re.match(r"^/([^/?#]+)", u.path)
            if m:
                return f"vm:{m.group(1)}"
    return None
