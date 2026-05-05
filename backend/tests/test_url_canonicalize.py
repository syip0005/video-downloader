from app.services.downloader.url import canonicalize


def test_youtube_long_form():
    assert canonicalize("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "youtube:dQw4w9WgXcQ"


def test_youtube_long_and_short_collapse():
    a = canonicalize("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    b = canonicalize("https://youtu.be/dQw4w9WgXcQ")
    assert a == b == "youtube:dQw4w9WgXcQ"


def test_youtube_tracking_params_dropped():
    a = canonicalize("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    b = canonicalize("https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=ABC&t=42&feature=share")
    assert a == b


def test_youtube_shorts_and_embed():
    a = canonicalize("https://www.youtube.com/watch?v=abc123")
    b = canonicalize("https://www.youtube.com/shorts/abc123")
    c = canonicalize("https://www.youtube.com/embed/abc123")
    assert a == b == c == "youtube:abc123"


def test_youtube_different_ids_stay_distinct():
    a = canonicalize("https://www.youtube.com/watch?v=AAA")
    b = canonicalize("https://www.youtube.com/watch?v=BBB")
    assert a != b


def test_twitter_x_collapse():
    a = canonicalize("https://twitter.com/jack/status/20")
    b = canonicalize("https://x.com/jack/status/20")
    c = canonicalize("https://mobile.x.com/jack/status/20?s=20")
    assert a == b == c == "twitter:20"


def test_reddit_thread():
    a = canonicalize("https://www.reddit.com/r/videos/comments/abc123/some_title/")
    b = canonicalize("https://reddit.com/r/videos/comments/abc123")
    assert a == b == "reddit:abc123"


def test_tiktok_user_video():
    a = canonicalize("https://www.tiktok.com/@user/video/7000000000000000000")
    b = canonicalize("https://www.tiktok.com/@user/video/7000000000000000000?lang=en")
    assert a == b == "tiktok:7000000000000000000"


def test_tiktok_short_link_kept_as_distinct_identifier():
    # We can't resolve vm.tiktok.com short links without a network call, so
    # they stay distinct from the canonical /@user/video/<id> form. Documented
    # trade-off — at least the same short link still hits its own cache.
    a = canonicalize("https://vm.tiktok.com/ZSAbcdef/")
    b = canonicalize("https://vm.tiktok.com/ZSAbcdef")
    assert a == b
    assert a != "tiktok:7000000000000000000"


def test_generic_url_strips_tracking_and_lowercases_host():
    a = canonicalize("https://Example.COM/v/abc?utm_source=fb&fbclid=xx&q=keep")
    b = canonicalize("https://example.com/v/abc?q=keep")
    assert a == b


def test_generic_url_drops_trailing_slash():
    a = canonicalize("https://example.com/foo/")
    b = canonicalize("https://example.com/foo")
    assert a == b


def test_invalid_url_returned_unchanged():
    # Pathological input shouldn't crash.
    assert canonicalize("not a url") == "not a url"
