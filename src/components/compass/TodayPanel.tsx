// ============================================
// TODAY PANEL — EVENTS AND HEADLINES
// ============================================
// The right-column panel under the Entry check. It shows, from the provider only:
//
//   * the next High-impact event, with a countdown
//   * today's economic calendar, in the viewer's LOCAL timezone, filtered to what
//     moves USD, Gold and US indices
//   * an event-risk flag (red inside the 60-minute-before / 30-minute-after
//     window around a High-impact event)
//   * the latest headlines, with source and time
//
// Nothing here is predicted. The "affects" tag is a rule-based classification of
// the event (core/news/impact.ts), and every number is the provider's own. When
// there is no source, the panel says so; when a source is configured but silent,
// it says "No data".
//
// It scrolls INTERNALLY: the panel has a fixed max height so the 1920x1080 screen
// never grows a page scrollbar, but nothing is hidden behind a click.

import React, { useMemo } from 'react';
import { Section } from '../common/Section';
import { cn } from '@/lib/utils';
import type { EconomicEvent, NewsHeadline } from '../../core/providers/news';
import { eventRiskFlag, nextHighImpactEvent } from '../../core/news/impact';

export interface TodayPanelProps {
  configured: boolean;
  reachable: boolean;
  label: string;
  note: string | null;
  events: EconomicEvent[];
  headlines: NewsHeadline[];
  /** Epoch ms the snapshot was fetched, for the data-age line. */
  fetchedAt: number | null;
  loading: boolean;
  /** Epoch ms, driven by the page's one-second tick for the countdown. */
  now: number;
}

/** "HH:MM" in the viewer's local timezone. */
function localTime(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '--';
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** "in 42m" / "12m ago" for a release time. */
function countdown(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '--';
  const diffMinutes = Math.round((at - now) / 60_000);
  const abs = Math.abs(diffMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  const span = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return diffMinutes >= 0 ? `in ${span}` : `${span} ago`;
}

const IMPACT_TONE: Record<string, string> = {
  High: 'text-[#ef5350]',
  Medium: 'text-amber-400',
  Low: 'text-white/40',
};

const IMPACT_DOT: Record<string, string> = {
  High: 'bg-[#ef5350]',
  Medium: 'bg-amber-400',
  Low: 'bg-white/30',
};

export const TodayPanel: React.FC<TodayPanelProps> = ({
  configured,
  reachable,
  label,
  note,
  events,
  headlines,
  fetchedAt,
  loading,
  now,
}) => {
  const nextEvent = useMemo(() => nextHighImpactEvent(events, now), [events, now]);
  const risk = useMemo(() => eventRiskFlag(events, now), [events, now]);

  const ageLine = useMemo(() => {
    if (fetchedAt === null) return 'No data';
    const seconds = Math.max(0, Math.round((now - fetchedAt) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)} min ago`;
  }, [fetchedAt, now]);

  const unavailable = !configured;

  return (
    <Section
      title="Today"
      subtitle={
        <span className="flex items-center gap-2">
          <span>{unavailable ? 'No news source' : label}</span>
          <span className={cn('rounded px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wider', risk ? 'bg-[#ef5350]/15 text-[#ef5350]' : 'bg-white/[0.04] text-white/40')}>
            {risk ? 'Event risk' : 'Calm'}
          </span>
        </span>
      }
      dense
    >
      <div className="flex max-h-[360px] flex-col gap-3 overflow-y-auto pr-1">
        {unavailable ? (
          <p className="py-2 text-body italic text-white/45">
            {reachable
              ? 'No news source configured. Set NEWS_PROVIDER and NEWS_API_KEY to enable the calendar and headlines.'
              : note ?? 'Could not reach the news route.'}
          </p>
        ) : loading && events.length === 0 && headlines.length === 0 ? (
          <p className="py-2 text-body italic text-white/45">Loading…</p>
        ) : events.length === 0 && headlines.length === 0 ? (
          <p className="py-2 text-body italic text-white/45">No data</p>
        ) : (
          <>
            {/* (a) Next high-impact event with a countdown */}
            <div>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-micro font-semibold uppercase tracking-wider text-white/40">Next high impact</span>
                <span className="text-micro text-white/30">Updated {ageLine}</span>
              </div>
              {nextEvent ? (
                <div className="flex items-baseline justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                  <span className="truncate text-label text-white/85">
                    <span className="mr-2 font-mono text-white/50">{localTime(nextEvent.time)}</span>
                    {nextEvent.name}
                  </span>
                  <span className="shrink-0 font-mono text-label font-bold text-amber-400">{countdown(nextEvent.time, now)}</span>
                </div>
              ) : (
                <p className="text-label italic text-white/35">No high-impact event today</p>
              )}
            </div>

            {/* (b) Today's economic calendar */}
            <div>
              <div className="mb-1 text-micro font-semibold uppercase tracking-wider text-white/40">
                Economic calendar · local time
              </div>
              {events.length === 0 ? (
                <p className="text-label italic text-white/35">No events today</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {events.map((event, index) => (
                    <li
                      key={`${event.time}-${event.name}-${index}`}
                      className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.01] px-2.5 py-1.5"
                    >
                      <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', IMPACT_DOT[event.impact])} aria-hidden />
                      <span className="w-11 shrink-0 font-mono text-label text-white/60">{localTime(event.time)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="font-mono text-micro text-white/45">{event.country}</span>
                          <span className="truncate text-label text-white/85">{event.name}</span>
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.625rem] text-white/40">
                          <span className={cn('font-bold', IMPACT_TONE[event.impact])}>{event.impact}</span>
                          <span>
                            Prev {event.previous ?? '--'} · Fcst {event.forecast ?? '--'} · Act{' '}
                            <span className="text-white/70">{event.actual ?? '--'}</span>
                          </span>
                          {event.affects.length > 0 && <span className="text-white/35">Affects {event.affects.join(', ')}</span>}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* (d) Latest headlines */}
            <div>
              <div className="mb-1 text-micro font-semibold uppercase tracking-wider text-white/40">Headlines</div>
              {headlines.length === 0 ? (
                <p className="text-label italic text-white/35">No data</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {headlines.map((headline, index) => (
                    <li key={`${headline.time}-${index}`} className="flex flex-col gap-0.5">
                      <a
                        href={headline.url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className={cn('text-label leading-snug text-white/85', headline.url && 'hover:text-white hover:underline')}
                      >
                        {headline.title}
                      </a>
                      <span className="text-[0.625rem] text-white/35">
                        {headline.source} · {countdown(headline.time, now)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </Section>
  );
};
