import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Express, Request, Response } from 'express';

// Serves the imported Beyond the Blueprint story and the About Earth scene
// as standalone pages. Source files stay as imported; only the template
// placeholders are filled in (port of the preserved V1.4 chapter renderer).

interface Chapter {
  id: string;
  lede: string;
  headlineHtml: string;
  cta?: string;
  frame: number;
}
interface Rung {
  id: string;
  version: string;
  title: string;
  lede: string;
  what: string;
  why: string;
  produces: string;
  image?: string;
  alt?: string;
  caption?: string;
}
interface Storyboard {
  chapters: Chapter[];
  process: { overline: string; title: string; intro: string; status: string; rungs: Rung[] };
}

const esc = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const safeHeadline = (value: string): string =>
  esc(value)
    .replaceAll('&lt;em&gt;', '<em>')
    .replaceAll('&lt;/em&gt;', '</em>')
    .replaceAll('&lt;span class=&quot;btb-dot&quot;&gt;', '<span class="btb-dot">')
    .replaceAll('&lt;/span&gt;', '</span>');

function renderChapters(storyboard: Storyboard): string {
  if (storyboard.chapters.length !== 7) throw new Error('Beyond storyboard requires seven chapters');
  return storyboard.chapters
    .map((item, index) => {
      if (!/^[a-z][a-z0-9-]*$/.test(item.id) || item.frame !== index) {
        throw new Error('Invalid Beyond chapter');
      }
      const heading = index ? 'h2' : 'h1';
      const cta = item.cta
        ? '<div class="btb-cta-row"><a class="' +
          (index === 0 || index === 6 ? 'btb-cta' : 'btb-inline-link') +
          '" href="' +
          (index === 0 ? '#' + storyboard.chapters[1].id : '#architectural-evidence') +
          '">' + esc(item.cta) + ' <span aria-hidden="true">↗</span></a></div>'
        : '';
      const technical =
        item.id === 'capability'
          ? '<div class="btb-technical-note"><span>ARCHITECTURAL LAYER</span><strong>Geometry → structure → material</strong><small>V1.2 conceptual model and source-backed drawings</small></div>'
          : '';
      const identity =
        item.id === 'understanding'
          ? '<aside class="btb-model-tag"><span>MODEL LINEAGE</span><strong>DreamHouse V1.2</strong><small>Conceptual GLB / BIM sources retained separately</small></aside>'
          : '';
      return (
        '<section class="btb-chapter' + (index === 0 ? ' btb-chapter--first' : '') +
        '" id="' + item.id + '" data-chapter="' + index + '" data-scene-id="' + item.id +
        '" aria-labelledby="btb-title-' + (index + 1) + '"><div class="btb-chapter__inner"><div class="btb-copy"><' +
        heading + ' id="btb-title-' + (index + 1) + '">' + safeHeadline(item.headlineHtml) +
        '</' + heading + '><p class="btb-lede">' + esc(item.lede) + '</p>' + cta +
        '</div></div>' + technical + identity + '</section>'
      );
    })
    .join('\n');
}

function renderProcessRungs(storyboard: Storyboard): string {
  const p = storyboard.process;
  return (
    '<div class="btb-process"><div class="btb-process__head"><p class="btb-overline">' +
    esc(p.overline) + '</p><h3>' + esc(p.title) + '</h3><p>' + esc(p.intro) + '</p></div>' +
    p.rungs
      .map((item, index) => {
        const media = item.image
          ? '<figure><img src="/beyond/media/' + esc(item.image) + '" alt="' + esc(item.alt) +
            '" loading="lazy" decoding="async"><figcaption>' + esc(item.caption) + '</figcaption></figure>'
          : '';
        return (
          '<article class="btb-rung' + (item.image ? '' : ' btb-rung--next') +
          '" id="rung-' + esc(item.id) + '"><div class="btb-rung__copy"><span class="btb-rung__index">' +
          String(index + 1).padStart(2, '0') + ' / ' + esc(item.version) +
          '</span><h3>' + esc(item.title) + '</h3><p class="btb-rung__lede">' + esc(item.lede) +
          '</p><dl><div><dt>What it is</dt><dd>' + esc(item.what) +
          '</dd></div><div><dt>Why it exists</dt><dd>' + esc(item.why) +
          '</dd></div><div><dt>What it produces</dt><dd>' + esc(item.produces) +
          '</dd></div></dl></div>' + media + '</article>'
        );
      })
      .join('') +
    '</div>'
  );
}

export function renderBeyondPage(root: string): string {
  const dir = path.join(root, 'src', 'beyond');
  const storyboard = JSON.parse(fs.readFileSync(path.join(dir, 'chapters.json'), 'utf8')) as Storyboard;
  const template = fs.readFileSync(path.join(dir, 'template.html'), 'utf8');
  const chapters = renderChapters(storyboard);
  const rungs = renderProcessRungs(storyboard);
  const status = esc(storyboard.process.status);
  return template
    .replace('{{STORY_CHAPTERS}}', () => chapters)
    .replace('{{PROCESS_RUNGS}}', () => rungs)
    .replace('{{EVIDENCE_STATUS}}', () => status)
    .replace('<!--IA_CHROME_HEADER-->', '')
    .replace('<!--IA_CHROME_FOOTER-->', '');
}

/** The PrimeTech public site runs as its own local app; /site hands the visitor to it on the same host. */
const SITE_PORT = 4363;

export function registerLibraryRoutes(app: Express, root: string): void {
  const three = path.join(root, 'node_modules', 'three');

  app.get('/site', (req: Request, res: Response) => {
    const host = (req.headers.host ?? 'localhost').replace(/:\d+$/, '');
    res.redirect(307, `http://${host}:${SITE_PORT}/`);
  });

  // The Beyond template's import map points three at /beyond/vendor.
  app.use('/beyond/vendor/addons', express.static(path.join(three, 'examples', 'jsm')));
  app.use('/beyond/vendor', express.static(path.join(three, 'build')));

  app.get(['/beyond', '/beyond/'], (_req: Request, res: Response) => {
    try {
      res.type('html').send(renderBeyondPage(root));
    } catch (err) {
      res.status(500).type('text').send(err instanceof Error ? err.message : 'Beyond page failed to render.');
    }
  });
  // world.js loads the V1.2 reference model from /beyond/media; serve the tracked library copy instead of duplicating it.
  app.get('/beyond/media/dreamhouse-v1.2.glb', (_req: Request, res: Response) => {
    res.sendFile(path.join(root, 'public', 'library', 'dreamhouse', 'v1.2', 'DreamHouse-V1.2.glb'));
  });
  app.use('/beyond', express.static(path.join(root, 'src', 'beyond'), { index: false }));

  app.get(['/about-earth', '/about-earth/'], (_req: Request, res: Response) => {
    res.sendFile(path.join(root, 'public', 'library', 'about-earth', 'index.html'));
  });
}
