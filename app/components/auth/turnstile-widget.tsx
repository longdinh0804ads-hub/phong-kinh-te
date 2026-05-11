"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget - minimal wrapper.
 * Tự load script 1 lần, render widget khi mount, gọi onVerify(token) khi pass.
 *
 * Props:
 *  - siteKey: sitekey public từ env
 *  - onVerify: callback nhận token
 *  - onError: callback khi error
 *  - resetKey: thay đổi sẽ trigger reset widget
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact";
        }
      ) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptLoaded = false;

function loadTurnstileScript(): Promise<void> {
  if (scriptLoaded && window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (window.turnstile) {
      scriptLoaded = true;
      return resolve();
    }
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => {
        scriptLoaded = true;
        resolve();
      });
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    s.onerror = () => reject(new Error("Không tải được Turnstile"));
    document.head.appendChild(s);
  });
}

export function TurnstileWidget({
  siteKey,
  onVerify,
  onError,
  resetKey = 0,
}: {
  siteKey: string;
  onVerify: (token: string) => void;
  onError?: () => void;
  resetKey?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    loadTurnstileScript()
      .then(() => {
        if (!mounted || !containerRef.current || !window.turnstile) return;
        // Cleanup widget cũ nếu có
        if (widgetIdRef.current) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {}
        }
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onVerify(token),
          "error-callback": () => onError?.(),
          theme: "light",
          size: "normal",
        });
      })
      .catch((e) => {
        console.error(e);
        onError?.();
      });

    return () => {
      mounted = false;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
    // resetKey thay đổi → re-render widget
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, resetKey]);

  return <div ref={containerRef} className="my-2" />;
}
