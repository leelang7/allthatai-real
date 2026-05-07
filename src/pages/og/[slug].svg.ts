/**
 * Per-article Open Graph image (SVG, 1200x630).
 *
 * Build-time rendered: getStaticPaths walks every guide + auto-guide and emits
 * a styled card with the article title, tag pill, and brand mark. Naver/X/Discord
 * render SVG OG images directly; Facebook prefers PNG but falls back to SVG-ext.
 *
 * No runtime / no external API — pure string template, ~2KB per article.
 */
import type { APIRoute } from 'astro';
import { allGuides } from '../../data/guides';
import { autoGuides } from '../../data/guides.auto';

interface OgItem { slug: string; title: string; tag: string }

export async function getStaticPaths() {
  const items: OgItem[] = [
    ...allGuides.map((g) => ({ slug: g.slug, title: g.title, tag: g.tag })),
    ...autoGuides.map((g) => ({ slug: g.slug, title: g.title, tag: g.tag })),
  ];
  return items.map((it) => ({
    params: { slug: it.slug },
    props: { item: it },
  }));
}

const tagAccent: Record<string, string> = {
  OTT: '#fb7185',
  '정부지원': '#34d399',
  AI: '#22d3ee',
  'AI 도구': '#22d3ee',
  세금: '#fbbf24',
  사업자: '#fbbf24',
  직구: '#60a5fa',
  '직구/쇼핑': '#60a5fa',
  '카드/핀테크': '#fbbf24',
  'Play Store': '#a78bfa',
  '주택/청약': '#2dd4bf',
  '게임할인': '#a78bfa',
  Steam: '#a78bfa',
  '항공/여행': '#34d399',
  '소프트웨어': '#818cf8',
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Crude-but-effective line wrapping: split on chars, fit ~22 Hangul / 38 Latin per line.
function wrap(title: string, maxPerLine = 22, maxLines = 3): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of title) {
    if (cur.length + 1 > maxPerLine) {
      lines.push(cur);
      cur = '';
      if (lines.length >= maxLines - 1) break;
    }
    cur += ch;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && title.length > lines.join('').length) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
  }
  return lines;
}

export const GET: APIRoute = ({ props }) => {
  const item = (props as { item: OgItem }).item;
  const accent = tagAccent[item.tag] || '#22d3ee';
  const lines = wrap(item.title);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#09090b"/>
      <stop offset="100%" stop-color="#18181b"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.2" cy="0" r="0.7">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="50%" stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- accent bar -->
  <rect x="80" y="80" width="120" height="6" rx="3" fill="${accent}"/>

  <!-- tag pill -->
  <g transform="translate(80, 110)">
    <rect width="${Math.max(80, item.tag.length * 28 + 32)}" height="48" rx="24" fill="${accent}" fill-opacity="0.15" stroke="${accent}" stroke-opacity="0.4"/>
    <text x="24" y="32" font-family="'Pretendard', system-ui, sans-serif" font-size="22" font-weight="700" fill="${accent}">${escapeXml(item.tag)}</text>
  </g>

  <!-- title (up to 3 lines) -->
  <text font-family="'Pretendard', system-ui, sans-serif" font-size="64" font-weight="900" fill="#fafafa" letter-spacing="-2">
    ${lines.map((l, i) => `<tspan x="80" y="${260 + i * 84}">${escapeXml(l)}</tspan>`).join('\n    ')}
  </text>

  <!-- brand -->
  <g transform="translate(80, 540)">
    <rect width="56" height="56" rx="14" fill="url(#brand)"/>
    <text x="28" y="40" text-anchor="middle" font-family="system-ui, sans-serif" font-size="32" font-weight="900" fill="#09090b">✓</text>
    <text x="76" y="36" font-family="'Pretendard', system-ui, sans-serif" font-size="28" font-weight="800" fill="#fafafa">AllThatAI <tspan fill="#22d3ee">Real</tspan></text>
    <text x="76" y="60" font-family="'Pretendard', system-ui, sans-serif" font-size="16" fill="#71717a">대행 안 거치는 진짜 무료 경로</text>
  </g>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
