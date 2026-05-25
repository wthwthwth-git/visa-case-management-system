"use client";

import { useEffect, useState } from "react";

const activeClassName = "scrollbar-active";
const hideDelayMs = 700;
const minThumbHeight = 44;

function getScrollElement(target: EventTarget | null): HTMLElement | null {
  if (
    target === document ||
    target === document.scrollingElement ||
    target === document.documentElement ||
    target === document.body
  ) {
    return document.documentElement;
  }

  return target instanceof HTMLElement ? target : null;
}

export function GlobalScrollbarActivity() {
  const [documentScrollbar, setDocumentScrollbar] = useState({
    isVisible: false,
    height: 0,
    top: 0,
  });

  useEffect(() => {
    const activeElements = new Set<HTMLElement>();
    const timers = new WeakMap<HTMLElement, number>();
    let documentTimer: number | undefined;

    function updateDocumentScrollbar() {
      const scrollElement = document.scrollingElement ?? document.documentElement;
      const scrollTop = scrollElement.scrollTop;
      const scrollHeight = scrollElement.scrollHeight;
      const viewportHeight = window.innerHeight;
      const maxScrollTop = Math.max(scrollHeight - viewportHeight, 0);

      if (maxScrollTop <= 0) {
        setDocumentScrollbar({
          isVisible: false,
          height: 0,
          top: 0,
        });
        return;
      }

      const thumbHeight = Math.max(
        minThumbHeight,
        Math.round((viewportHeight / scrollHeight) * viewportHeight),
      );
      const maxThumbTop = viewportHeight - thumbHeight;
      const thumbTop = Math.round((scrollTop / maxScrollTop) * maxThumbTop);

      setDocumentScrollbar({
        isVisible: true,
        height: thumbHeight,
        top: thumbTop,
      });

      if (documentTimer) {
        window.clearTimeout(documentTimer);
      }

      documentTimer = window.setTimeout(() => {
        setDocumentScrollbar((current) => ({
          ...current,
          isVisible: false,
        }));
      }, hideDelayMs);
    }

    function markActive(element: HTMLElement) {
      element.classList.add(activeClassName);
      activeElements.add(element);

      const existingTimer = timers.get(element);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

      const timer = window.setTimeout(() => {
        element.classList.remove(activeClassName);
        activeElements.delete(element);
      }, hideDelayMs);

      timers.set(element, timer);
    }

    function handleScroll(event: Event) {
      const element = getScrollElement(event.target);

      if (element) {
        markActive(element);
      }

      if (element === document.documentElement) {
        updateDocumentScrollbar();
      }
    }

    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", updateDocumentScrollbar);

    return () => {
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", updateDocumentScrollbar);

      for (const element of activeElements) {
        element.classList.remove(activeClassName);
        const timer = timers.get(element);
        if (timer) {
          window.clearTimeout(timer);
        }
      }

      if (documentTimer) {
        window.clearTimeout(documentTimer);
      }
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`global-scrollbar-overlay ${documentScrollbar.isVisible ? "global-scrollbar-overlay-visible" : ""}`}
    >
      <div
        className="global-scrollbar-overlay-thumb"
        style={{
          height: `${documentScrollbar.height}px`,
          transform: `translateY(${documentScrollbar.top}px)`,
        }}
      />
    </div>
  );
}
