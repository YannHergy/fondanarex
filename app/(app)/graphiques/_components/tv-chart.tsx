"use client";

import { useEffect, useRef } from "react";

import { Icon } from "@/components/ui/icon";
import { toTradingViewSymbol } from "@/domain/charts/timeframes";

const WIDGET_SRC = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

/**
 * TradingView advanced chart.
 *
 * The widget is a third-party script that replaces its own container, so it has
 * to be mounted imperatively. Two details matter:
 *
 *   - the config goes in as JSON built by JSON.stringify, never by string
 *     concatenation, and the symbol is validated by `toTradingViewSymbol`
 *     first. The pair reaches this component from a select, but it is still
 *     data going into a script element;
 *   - the container is emptied on teardown. The widget appends an iframe and
 *     its own listeners, and React does not own those nodes — without the
 *     cleanup, switching pair or timeframe stacks a new chart on the old one.
 *
 * TEARDOWN DETACHES A WRAPPER RATHER THAN WIPING innerHTML, and that is the
 * difference between a chart and a blank rectangle.
 *
 * The widget script is async. Removing it from the document does not abort it:
 * it still runs, and on running it reaches for its own parent to find the
 * container it must replace. `innerHTML = ""` leaves that parent NULL, so the
 * script threw `Cannot read properties of null (reading 'querySelector')` and
 * the page was left showing nothing at all — every time a pair, timeframe or
 * theme changed before the script had finished loading.
 *
 * Detaching the wrapper instead keeps `script.parentNode` pointing at a live
 * node. A late script then renders harmlessly into a subtree that is no longer
 * in the document, and gets collected with it.
 */
export function TradingViewChart({
  pair,
  interval,
  theme,
}: {
  pair: string;
  interval: string;
  theme: "dark" | "light";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const symbol = toTradingViewSymbol(pair);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !symbol) return;

    container.innerHTML = "";

    // The wrapper exists solely so teardown has something to detach that keeps
    // the script's parent alive. See the note above the component.
    const mount = document.createElement("div");
    mount.style.cssText = "height:100%;width:100%;";
    container.appendChild(mount);

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.cssText = "height:100%;width:100%;";
    mount.appendChild(widget);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = WIDGET_SRC;
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "Europe/Paris",
      theme,
      style: "1",
      locale: "fr",
      enable_publishing: false,
      allow_symbol_change: true,
      hide_side_toolbar: false,
      withdateranges: true,
      // The two EMAs the whole methodology is written around.
      studies: ["MAExp@tv-basicstudies|50", "MAExp@tv-basicstudies|200"],
    });
    mount.appendChild(script);

    return () => {
      mount.remove();
    };
  }, [symbol, interval, theme]);

  if (!symbol) {
    return (
      <div className="text-subtle flex h-full flex-col items-center justify-center gap-2">
        <Icon name="error_outline" size={24} />
        <p className="text-sm">Paire non reconnue : {pair}</p>
      </div>
    );
  }

  return <div ref={containerRef} className="tradingview-widget-container h-full w-full" />;
}
