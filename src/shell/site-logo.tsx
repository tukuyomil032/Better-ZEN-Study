import { useEffect, useState, type ReactNode } from "react";
import styles from "./site-logo.module.css";

// The site's own logo is read from its header image at run time, not copied into the extension:
// the file name carries a hash that changes when the site is updated. Only the mark is shown; the
// site's wordmark is dark navy and would not read on the dark shell.
const LOGO_ALT = "ZEN Study";
const WAIT_MS = 10000;

// The first site logo on the page that is not inside the shell.
function findLogoSource(): string | undefined {
  const images = document.querySelectorAll<HTMLImageElement>(`img[alt="${LOGO_ALT}"]`);
  for (const image of images) {
    if (image.closest("#bzs-app")) continue;
    const source = image.getAttribute("src");
    if (source) return source;
  }
  return undefined;
}

// The logo's address, once the site has drawn its header. Until then, or if it never appears,
// the caller shows its fallback.
export function useSiteLogoSource(): string | undefined {
  const [source, setSource] = useState<string | undefined>(() => findLogoSource());

  useEffect(() => {
    if (source) return;
    const observer = new MutationObserver(() => {
      const found = findLogoSource();
      if (found) {
        setSource(found);
        observer.disconnect();
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "alt"],
    });
    const timer = window.setTimeout(() => observer.disconnect(), WAIT_MS);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [source]);

  return source;
}

// The site's mark on a white tile. Shows the fallback until the site's logo is found.
export function SiteMark({ fallback }: { fallback: ReactNode }) {
  const source = useSiteLogoSource();
  if (!source) return <>{fallback}</>;
  return (
    <span className={styles.tile} aria-hidden="true">
      <img className={styles.image} src={source} alt="" />
    </span>
  );
}
