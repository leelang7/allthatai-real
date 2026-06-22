// PoC: render one 1080x1920 shorts card fully locally (satori -> SVG -> PNG).
// No external API. Proves visual quality before building the full pipeline.
import fs from 'node:fs';
import path from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FDIR = path.join(ROOT, 'node_modules/pretendard/dist/public/static/alternative');
const reg = fs.readFileSync(path.join(FDIR, 'Pretendard-Regular.ttf'));
const bold = fs.readFileSync(path.join(FDIR, 'Pretendard-Bold.ttf'));
const xbold = fs.readFileSync(path.join(FDIR, 'Pretendard-ExtraBold.ttf'));

const W = 1080;
const H = 1920;

// Hook card for the "배민 배달비" article.
const card = {
  type: 'div',
  props: {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '140px 80px',
      background: 'linear-gradient(150deg, #2AC1BC 0%, #0B6E7C 100%)',
      fontFamily: 'Pretendard',
    },
    children: [
      // top pill label
      {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            fontSize: 46,
            fontWeight: 700,
            color: '#ffffff',
            background: 'rgba(255,255,255,0.18)',
            padding: '20px 44px',
            borderRadius: '100px',
          },
          children: '배달비 절약 꿀팁',
        },
      },
      // center title (3 lines, one highlighted)
      {
        type: 'div',
        props: {
          style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' },
          children: [
            { type: 'div', props: { style: { display: 'flex', fontSize: 138, fontWeight: 800, color: '#ffffff' }, children: '배민 배달비' } },
            { type: 'div', props: { style: { display: 'flex', fontSize: 138, fontWeight: 800, color: '#FFE15D' }, children: '매달 1만원' } },
            { type: 'div', props: { style: { display: 'flex', fontSize: 138, fontWeight: 800, color: '#ffffff' }, children: '아끼는 법' } },
          ],
        },
      },
      // bottom progress dots
      {
        type: 'div',
        props: {
          style: { display: 'flex', gap: '22px', alignItems: 'center' },
          children: [0, 1, 2, 3, 4].map((i) => ({
            type: 'div',
            props: {
              style: {
                display: 'flex',
                width: i === 0 ? '64px' : '28px',
                height: '28px',
                borderRadius: '100px',
                background: i === 0 ? '#ffffff' : 'rgba(255,255,255,0.4)',
              },
            },
          })),
        },
      },
    ],
  },
};

const svg = await satori(card as any, {
  width: W,
  height: H,
  fonts: [
    { name: 'Pretendard', data: reg, weight: 400, style: 'normal' },
    { name: 'Pretendard', data: bold, weight: 700, style: 'normal' },
    { name: 'Pretendard', data: xbold, weight: 800, style: 'normal' },
  ],
});

const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
const out = path.join(ROOT, 'scripts/shorts/_sample.png');
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
