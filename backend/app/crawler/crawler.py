"""
Lightweight HTTP-based crawler (httpx + BeautifulSoup).

Why not Playwright: 300+ MB RAM per browser; Render free tier is 512 MB total.
This crawler uses ~20 MB, completes in ~1 sec/page, and works on any platform.
Trade-off: JS-rendered content (heavy SPAs) won't be captured — they show as
empty pages. For static sites and SSR pages this works perfectly.
"""
import httpx
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup


USER_AGENT = "WebTalkAI-Crawler/1.0 (+https://web-talk-ai.vercel.app)"
SKIP_EXTENSIONS = (
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".bmp",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".mp4", ".webm", ".mp3", ".wav", ".ogg",
    ".pdf", ".zip", ".tar", ".gz", ".rar",
    ".css", ".js",
)


class WebCrawler:
    def __init__(self, timeout: int = 12):
        self.timeout = timeout

    async def crawl(self, start_url: str, max_pages: int = 50) -> list[dict]:
        """Crawl same-domain links breadth-first. Returns [{url, title, content}]."""
        base_domain = urlparse(start_url).netloc
        visited: set[str] = set()
        queue: list[str] = [start_url]
        results: list[dict] = []

        async with httpx.AsyncClient(
            timeout=self.timeout,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
        ) as client:
            while queue and len(results) < max_pages:
                url = queue.pop(0)
                normalized = _normalize_url(url)
                if normalized in visited:
                    continue
                visited.add(normalized)

                if any(url.lower().endswith(ext) for ext in SKIP_EXTENSIONS):
                    continue

                try:
                    resp = await client.get(url)
                except (httpx.RequestError, httpx.TimeoutException):
                    continue

                if resp.status_code != 200:
                    continue
                content_type = resp.headers.get("content-type", "").lower()
                if "html" not in content_type:
                    continue

                try:
                    soup = BeautifulSoup(resp.text, "html.parser")
                except Exception:
                    continue

                title = soup.title.string.strip() if soup.title and soup.title.string else url
                content = _extract_text(soup)
                if content.strip():
                    results.append({"url": url, "title": title, "content": content})

                # Discover same-domain links
                for a in soup.find_all("a", href=True):
                    href = a["href"].strip()
                    if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
                        continue
                    absolute = urljoin(url, href)
                    if urlparse(absolute).netloc == base_domain:
                        norm = _normalize_url(absolute)
                        if norm not in visited:
                            queue.append(absolute)

        return results


def _normalize_url(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}".rstrip("/")


def _extract_text(soup: BeautifulSoup) -> str:
    """Strip noise, return readable text from <main>/<article>/<body>."""
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript", "iframe"]):
        tag.decompose()

    main = (
        soup.find("main")
        or soup.find("article")
        or soup.find(id="content")
        or soup.find(class_=lambda c: c and "content" in c.lower())
        or soup.body
    )
    if main is None:
        return ""

    lines = [line.strip() for line in main.get_text(separator="\n").splitlines()]
    return "\n".join(line for line in lines if line)
