// PoC: card with the product's REAL image as background (Steam public CDN,
// no API key). Proves visual quality vs flat gradient cards.
import fs from 'node:fs';
import path from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FDIR = path.join(ROOT, 'node_modules/pretendard/dist/public/static/alternative');
const fonts = [
  { name: 'Pretendard', data: fs.readFileSync(path.join(FDIR, 'Pretendard-Bold.ttf')), weight: 700 as const, style: 'normal' as const },
  { name: 'Pretendard', data: fs.readFileSync(path.join(FDIR, 'Pretendard-ExtraBold.ttf')), weight: 800 as const, style: 'normal' as const },
];

const W = 1080, H = 1920;

async function dataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return `data:image/jpeg;base64,${b.toString('base64')}`;
  } catch { return null; }
}

const flex = (style: Record<string, unknown>, children: unknown) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });

async function main() {
  const appid = '292030'; // The Witcher 3
  // try vertical poster first, fall back to header
  const img =
    (await dataUrl(`https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`)) ||
    (await dataUrl(`https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`));
  if (!img) { console.error('image fetch failed'); process.exit(1); }

  const card = flex(
    {
      width: '100%', height: '100%', flexDirection: 'column', justifyContent: 'flex-end',
      backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center',
      fontFamily: 'Pretendard',
    },
    [
      // dark gradient overlay for text legibility
      flex({ position: 'absolute', top: '0', left: '0', width: '1080px', height: '1920px', background: 'linear-gradient(180deg, rgba(8,40,44,0.25) 0%, rgba(8,40,44,0.55) 55%, rgba(6,30,33,0.92) 100%)' }, ''),
      // top pill
      flex({ position: 'absolute', top: '150px', left: '0', width: '1080px', justifyContent: 'center' },
        flex({ fontSize: 46, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.18)', padding: '20px 44px', borderRadius: '100px' }, '스팀 역대급 세일')),
      // bottom text
      flex({ position: 'relative', flexDirection: 'column', padding: '0 80px 230px', gap: '4px' }, [
        flex({ fontSize: 132, fontWeight: 800, color: '#fff' }, '위쳐 3'),
        flex({ fontSize: 132, fontWeight: 800, color: '#FFE15D' }, '80% 할인'),
        flex({ fontSize: 132, fontWeight: 800, color: '#fff' }, '10,960원'),
      ]),
    ],
  );

  const svg = await satori(card as any, { width: W, height: H, fonts });
  const out = path.join(ROOT, 'scripts/shorts/_sample_bg.png');
  fs.writeFileSync(out, new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng());
  console.log('wrote', out);
}

main();
