import asyncio
from urllib.parse import urljoin, urlparse
from typing import Optional
from playwright.async_api import async_playwright, Browser
from bs4 import BeautifulSoup


class WebCrawler:
    def __init__(self, timeout_ms: int = 15_000):
        self.timeout_ms = timeout_ms

    async def crawl(self, start_url: str, max_pages: int = 50) -> list[dict]:
        """Crawl website starting from start_url. Returns list of {url, title, content}."""
        base_domain = urlparse(start_url).netloc
        visited: set[str] = set()
        queue: list[str] = [start_url]
        results: list[dict] = []

        async with async_playwright() as p:
            browser: Browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()

            # Block images, fonts, and media to speed up crawling
            await page.route("**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,mp4,webm}", lambda r: r.abort())

            while queue and len(results) < max_pages:
                url = queue.pop(0)
                normalized = _normalize_url(url)
                if normalized in visited:
                    continue
                visited.add(normalized)

                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=self.timeout_ms)
                    html = await page.content()
                    soup = BeautifulSoup(html, "html.parser")

                    title = soup.title.string.strip() if soup.title else url
                    content = _extract_text(soup)

                    if content.strip():
                        results.append({"url": url, "title": title, "content": content})

                    # Discover same-domain links
                    for a in soup.find_all("a", href=True):
                        href = a["href"]
                        absolute = urljoin(url, href)
                        if urlparse(absolute).netloc == base_domain:
                            norm = _normalize_url(absolute)
                            if norm not in visited:
                                queue.append(absolute)

                except Exception:
                    continue

            await browser.close()

        return results


def _normalize_url(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}".rstrip("/")


def _extract_text(soup: BeautifulSoup) -> str:
    """Extract clean readable text, skipping nav/footer/scripts."""
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
        tag.decompose()

    main = soup.find("main") or soup.find("article") or soup.find(id="content") or soup.body
    if main is None:
        return ""

    lines = [line.strip() for line in main.get_text(separator="\n").splitlines()]
    return "\n".join(line for line in lines if line)
