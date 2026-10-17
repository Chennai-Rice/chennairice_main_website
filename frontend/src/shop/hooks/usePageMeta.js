import { useEffect } from "react";

const SITE = "https://chennairiceindustries.com";

function setTag(selector, attr, name, content) {
  let tag = document.head.querySelector(selector);
  if (content == null) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement(selector.startsWith("link") ? "link" : "meta");
    tag.setAttribute(attr, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute(selector.startsWith("link") ? "href" : "content", content);
}

/**
 * Each original HTML file had its own <title> and meta description. With client
 * routing there is one document, so every page sets them on mount, together
 * with the canonical URL, the link-preview (Open Graph) title, description and
 * URL, and — for pages that should stay out of Google (`{ noindex: true }`) —
 * a robots noindex. scripts/prerender-head.mjs writes the same tags into each
 * page's HTML for crawlers that do not run JavaScript.
 */
export default function usePageMeta(title, description, { noindex = false } = {}) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) setTag('meta[name="description"]', "name", "description", description);
    const url = SITE + (window.location.pathname.replace(/\/+$/, "") || "/");
    setTag('link[rel="canonical"]', "rel", "canonical", noindex ? null : url);
    setTag('meta[name="robots"]', "name", "robots", noindex ? "noindex, follow" : null);
    if (title) setTag('meta[property="og:title"]', "property", "og:title", title);
    if (description) setTag('meta[property="og:description"]', "property", "og:description", description);
    setTag('meta[property="og:url"]', "property", "og:url", url);
  }, [title, description, noindex]);
}
