import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface StudioTemplateRow {
  id: string;
  sku: string | null;
  app_id: string;
  resource_kind: string;
  pack_slug: string | null;
  pack_title: string | null;
  category: string;
  title: string;
  description: string | null;
  use_case: string | null;
  tags_json: string;
  specs_json: string;
  payload_bucket_id: string | null;
  payload_r2_key: string | null;
  payload_sha256: string | null;
  payload_schema_uri: string | null;
  preview_bucket_id: string | null;
  preview_r2_key: string | null;
  renderer_key: string | null;
  compatible_apps_json: string;
  source_refs_json: string;
  version: number;
  status: 'draft' | 'active' | 'archived';
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface StudioTemplateHydrated {
  id: string;
  sku: string | null;
  app_id: string;
  resource_kind: string;
  pack_slug: string | null;
  pack_title: string | null;
  category: string;
  title: string;
  description: string | null;
  use_case: string | null;
  tags: string[];
  specs: Record<string, unknown>;
  payload_bucket_id: string | null;
  payload_r2_key: string | null;
  payload_sha256: string | null;
  payload_schema_uri: string | null;
  preview_bucket_id: string | null;
  preview_r2_key: string | null;
  renderer_key: string | null;
  compatible_apps: string[];
  source_refs: string[];
  version: number;
  status: 'draft' | 'active' | 'archived';
  sort_order: number;
  created_at: number;
  updated_at: number;
  payload?: Record<string, unknown> | null;
}

export interface CreateStudioTemplateInput {
  id?: string;
  sku?: string | null;
  app_id?: string;
  resource_kind: string;
  pack_slug?: string | null;
  pack_title?: string | null;
  category: string;
  title: string;
  description?: string | null;
  use_case?: string | null;
  tags?: string[];
  specs?: Record<string, unknown>;
  payload?: Record<string, unknown> | null;
  payload_bucket_id?: string | null;
  payload_r2_key?: string | null;
  payload_schema_uri?: string | null;
  preview_bucket_id?: string | null;
  preview_r2_key?: string | null;
  renderer_key?: string | null;
  compatible_apps?: string[];
  source_refs?: string[];
  version?: number;
  status?: 'draft' | 'active' | 'archived';
  sort_order?: number;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'template'
  );
}

function sha256Hex(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function sqlLiteral(val: string | number | null): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

export class StudioTemplatesRepository {
  private db: DatabaseSync;

  constructor(dbFilePath: string) {
    const dir = path.dirname(dbFilePath);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(dbFilePath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.initSchema();
    this.seedDefaultsIfEmpty();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS r2_buckets (
        id TEXT PRIMARY KEY,
        bucket_name TEXT NOT NULL,
        region TEXT DEFAULT 'auto',
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      INSERT OR IGNORE INTO r2_buckets (id, bucket_name, region)
      VALUES
        ('r2-samscene-payloads', 'samscene-studio-payloads', 'auto'),
        ('r2-samscene-previews', 'samscene-studio-previews', 'auto');

      CREATE TABLE IF NOT EXISTS studio_templates (
        id TEXT PRIMARY KEY,
        sku TEXT UNIQUE,
        app_id TEXT NOT NULL,
        resource_kind TEXT NOT NULL,
        pack_slug TEXT,
        pack_title TEXT,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        use_case TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]'
          CHECK (json_valid(tags_json) AND json_type(tags_json) = 'array'),
        specs_json TEXT NOT NULL DEFAULT '{}'
          CHECK (json_valid(specs_json) AND json_type(specs_json) = 'object'),
        payload_bucket_id TEXT REFERENCES r2_buckets(id) ON DELETE SET NULL,
        payload_r2_key TEXT,
        payload_sha256 TEXT,
        payload_schema_uri TEXT,
        preview_bucket_id TEXT REFERENCES r2_buckets(id) ON DELETE SET NULL,
        preview_r2_key TEXT,
        renderer_key TEXT,
        compatible_apps_json TEXT NOT NULL DEFAULT '[]'
          CHECK (json_valid(compatible_apps_json) AND json_type(compatible_apps_json) = 'array'),
        source_refs_json TEXT NOT NULL DEFAULT '[]'
          CHECK (json_valid(source_refs_json) AND json_type(source_refs_json) = 'array'),
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft','active','archived')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS studio_template_payloads (
        template_id TEXT PRIMARY KEY REFERENCES studio_templates(id) ON DELETE CASCADE,
        r2_key TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE INDEX IF NOT EXISTS idx_studio_templates_category
        ON studio_templates(category, status, sort_order);
      CREATE INDEX IF NOT EXISTS idx_studio_templates_pack
        ON studio_templates(pack_slug, sort_order);
    `);
  }

  private hydrateRow(row: StudioTemplateRow, includePayload = false): StudioTemplateHydrated {
    let payload: Record<string, unknown> | null | undefined;
    if (includePayload) {
      const pStmt = this.db.prepare(
        'SELECT payload_json FROM studio_template_payloads WHERE template_id = ?'
      );
      const pRow = pStmt.get(row.id) as { payload_json?: string } | undefined;
      if (pRow?.payload_json) {
        try {
          payload = JSON.parse(pRow.payload_json) as Record<string, unknown>;
        } catch {
          payload = null;
        }
      } else {
        payload = null;
      }
    }

    return {
      id: row.id,
      sku: row.sku,
      app_id: row.app_id,
      resource_kind: row.resource_kind,
      pack_slug: row.pack_slug,
      pack_title: row.pack_title,
      category: row.category,
      title: row.title,
      description: row.description,
      use_case: row.use_case,
      tags: JSON.parse(row.tags_json || '[]') as string[],
      specs: JSON.parse(row.specs_json || '{}') as Record<string, unknown>,
      payload_bucket_id: row.payload_bucket_id,
      payload_r2_key: row.payload_r2_key,
      payload_sha256: row.payload_sha256,
      payload_schema_uri: row.payload_schema_uri,
      preview_bucket_id: row.preview_bucket_id,
      preview_r2_key: row.preview_r2_key,
      renderer_key: row.renderer_key,
      compatible_apps: JSON.parse(row.compatible_apps_json || '[]') as string[],
      source_refs: JSON.parse(row.source_refs_json || '[]') as string[],
      version: row.version,
      status: row.status,
      sort_order: row.sort_order,
      created_at: row.created_at,
      updated_at: row.updated_at,
      ...(includePayload ? { payload } : {}),
    };
  }

  public listTemplates(filters?: {
    category?: string;
    resource_kind?: string;
    pack_slug?: string;
    status?: string;
    q?: string;
    includePayload?: boolean;
  }): StudioTemplateHydrated[] {
    const clauses: string[] = [];
    const args: Array<string | number> = [];

    if (filters?.category && filters.category !== 'all') {
      clauses.push('category = ?');
      args.push(filters.category);
    }
    if (filters?.resource_kind && filters.resource_kind !== 'all') {
      clauses.push('resource_kind = ?');
      args.push(filters.resource_kind);
    }
    if (filters?.pack_slug) {
      clauses.push('pack_slug = ?');
      args.push(filters.pack_slug);
    }
    if (filters?.status && filters.status !== 'all') {
      clauses.push('status = ?');
      args.push(filters.status);
    }
    if (filters?.q && filters.q.trim()) {
      const qLike = `%${filters.q.trim().toLowerCase()}%`;
      clauses.push(
        '(LOWER(title) LIKE ? OR LOWER(COALESCE(description, \'\')) LIKE ? OR LOWER(COALESCE(pack_title, \'\')) LIKE ? OR LOWER(tags_json) LIKE ?)'
      );
      args.push(qLike, qLike, qLike, qLike);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const stmt = this.db.prepare(
      `SELECT * FROM studio_templates ${whereSql} ORDER BY sort_order ASC, updated_at DESC`
    );
    const rows = stmt.all(...args) as unknown as StudioTemplateRow[];
    return rows.map((r) => this.hydrateRow(r, Boolean(filters?.includePayload)));
  }

  public getTemplateById(id: string): StudioTemplateHydrated | null {
    const stmt = this.db.prepare('SELECT * FROM studio_templates WHERE id = ?');
    const row = stmt.get(id) as unknown as StudioTemplateRow | undefined;
    if (!row) return null;
    return this.hydrateRow(row, true);
  }

  public createTemplate(input: CreateStudioTemplateInput): StudioTemplateHydrated {
    const id =
      input.id || `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const appId = input.app_id || 'samscene-studio';
    const packSlug = input.pack_slug || null;
    const baseSlug = slugify(input.title);
    const sku =
      input.sku !== undefined
        ? input.sku
        : `SAM-${input.resource_kind.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)}-${baseSlug
            .toUpperCase()
            .slice(0, 14)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

    const tagsJson = JSON.stringify(Array.isArray(input.tags) ? input.tags : []);
    const specsJson = JSON.stringify(
      input.specs && typeof input.specs === 'object' ? input.specs : {}
    );
    const compatibleJson = JSON.stringify(
      Array.isArray(input.compatible_apps)
        ? input.compatible_apps
        : ['samscene', 'samspeak', 'web-embed']
    );
    const sourceRefsJson = JSON.stringify(
      Array.isArray(input.source_refs) ? input.source_refs : []
    );

    const payloadObj = input.payload ?? null;
    const payloadJsonStr = payloadObj ? JSON.stringify(payloadObj) : null;
    const payloadSha = payloadJsonStr ? sha256Hex(payloadJsonStr) : null;
    const payloadBucket =
      input.payload_bucket_id !== undefined
        ? input.payload_bucket_id
        : payloadJsonStr
          ? 'r2-samscene-payloads'
          : null;
    const payloadR2Key =
      input.payload_r2_key ||
      (payloadJsonStr
        ? `templates/${packSlug || 'standalone'}/${baseSlug}-${id.slice(-5)}.json`
        : null);
    const previewBucket =
      input.preview_bucket_id !== undefined ? input.preview_bucket_id : 'r2-samscene-previews';
    const previewR2Key =
      input.preview_r2_key || `previews/${packSlug || 'standalone'}/${baseSlug}.webp`;

    const status =
      input.status === 'draft' || input.status === 'active' || input.status === 'archived'
        ? input.status
        : 'active';

    const insertStmt = this.db.prepare(`
      INSERT INTO studio_templates (
        id, sku, app_id, resource_kind, pack_slug, pack_title, category, title,
        description, use_case, tags_json, specs_json, payload_bucket_id, payload_r2_key,
        payload_sha256, payload_schema_uri, preview_bucket_id, preview_r2_key, renderer_key,
        compatible_apps_json, source_refs_json, version, status, sort_order
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        use_case = excluded.use_case,
        tags_json = excluded.tags_json,
        specs_json = excluded.specs_json,
        payload_sha256 = excluded.payload_sha256,
        status = excluded.status,
        version = studio_templates.version + 1,
        updated_at = unixepoch()
    `);

    insertStmt.run(
      id,
      sku,
      appId,
      input.resource_kind,
      packSlug,
      input.pack_title || null,
      input.category,
      input.title,
      input.description || null,
      input.use_case || null,
      tagsJson,
      specsJson,
      payloadBucket,
      payloadR2Key,
      payloadSha,
      input.payload_schema_uri || 'https://schemas.samscene.studio/v1/template-payload.json',
      previewBucket,
      previewR2Key,
      input.renderer_key || 'threejs.samscene.sky-stage.v1',
      compatibleJson,
      sourceRefsJson,
      input.version ?? 1,
      status,
      input.sort_order ?? 0
    );

    if (payloadJsonStr && payloadR2Key) {
      const payloadStmt = this.db.prepare(`
        INSERT INTO studio_template_payloads (template_id, r2_key, payload_json, updated_at)
        VALUES (?, ?, ?, unixepoch())
        ON CONFLICT(template_id) DO UPDATE SET
          r2_key = excluded.r2_key,
          payload_json = excluded.payload_json,
          updated_at = unixepoch()
      `);
      payloadStmt.run(id, payloadR2Key, payloadJsonStr);
    }

    return this.getTemplateById(id)!;
  }

  public updateTemplateStatus(
    id: string,
    patch: { status?: 'draft' | 'active' | 'archived'; title?: string; use_case?: string }
  ): StudioTemplateHydrated | null {
    const existing = this.getTemplateById(id);
    if (!existing) return null;
    const nextStatus = patch.status || existing.status;
    const nextTitle = patch.title !== undefined ? patch.title : existing.title;
    const nextUseCase = patch.use_case !== undefined ? patch.use_case : existing.use_case;

    const stmt = this.db.prepare(`
      UPDATE studio_templates
      SET status = ?, title = ?, use_case = ?, updated_at = unixepoch()
      WHERE id = ?
    `);
    stmt.run(nextStatus, nextTitle, nextUseCase, id);
    return this.getTemplateById(id);
  }

  public deleteTemplate(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM studio_templates WHERE id = ?');
    const res = stmt.run(id);
    return Number(res.changes) > 0;
  }

  public exportSqlSeed(): string {
    const stmt = this.db.prepare('SELECT * FROM studio_templates ORDER BY sort_order ASC, created_at ASC');
    const rows = stmt.all() as unknown as StudioTemplateRow[];
    const lines: string[] = [
      '-- SamScene studio_templates portable SQLite / Cloudflare D1 seed export',
      `-- Generated at ${new Date().toISOString()}`,
      '',
    ];

    for (const r of rows) {
      lines.push(
        `INSERT OR REPLACE INTO studio_templates (id, sku, app_id, resource_kind, pack_slug, pack_title, category, title, description, use_case, tags_json, specs_json, payload_bucket_id, payload_r2_key, payload_sha256, payload_schema_uri, preview_bucket_id, preview_r2_key, renderer_key, compatible_apps_json, source_refs_json, version, status, sort_order, created_at, updated_at) VALUES (${[
          sqlLiteral(r.id),
          sqlLiteral(r.sku),
          sqlLiteral(r.app_id),
          sqlLiteral(r.resource_kind),
          sqlLiteral(r.pack_slug),
          sqlLiteral(r.pack_title),
          sqlLiteral(r.category),
          sqlLiteral(r.title),
          sqlLiteral(r.description),
          sqlLiteral(r.use_case),
          sqlLiteral(r.tags_json),
          sqlLiteral(r.specs_json),
          sqlLiteral(r.payload_bucket_id),
          sqlLiteral(r.payload_r2_key),
          sqlLiteral(r.payload_sha256),
          sqlLiteral(r.payload_schema_uri),
          sqlLiteral(r.preview_bucket_id),
          sqlLiteral(r.preview_r2_key),
          sqlLiteral(r.renderer_key),
          sqlLiteral(r.compatible_apps_json),
          sqlLiteral(r.source_refs_json),
          sqlLiteral(r.version),
          sqlLiteral(r.status),
          sqlLiteral(r.sort_order),
          sqlLiteral(r.created_at),
          sqlLiteral(r.updated_at),
        ].join(', ')});`
      );
    }

    return lines.join('\n');
  }

  private seedDefaultsIfEmpty(): void {
    const countRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM studio_templates')
      .get() as { cnt: number };
    if (countRow.cnt > 0) return;

    this.createTemplate({
      id: 'tpl-sky-diurnal-hover',
      sku: 'SAM-SKY-DIURNAL-001',
      app_id: 'samscene-studio',
      resource_kind: 'hover_scroll_scene',
      pack_slug: 'celestial-sky-horizons',
      pack_title: 'Celestial Sky & Horizon Pack',
      category: 'sky-atmosphere',
      title: 'Diurnal Cirrus Hover & Scroll Sky',
      description:
        'Interactive multi-phase sky shader transitioning from starry indigo night through lavender dawn into sunlit azure cirrus clouds on pointer hover or scroll.',
      use_case: 'Hero landing backdrop, hover-reactive showcase header, scroll-driven chapter sky',
      tags: ['sky', 'cirrus', 'hover-trigger', 'scroll-trigger', 'diurnal', 'clouds'],
      specs: {
        triggerMode: 'hover-reactive',
        presetId: 'diurnal-cloudscape',
        swatchHex: '#7d8be8',
        fpsTarget: 60,
        interactiveAxes: ['pointerX', 'pointerY', 'scrollY'],
      },
      payload: {
        environmentId: 'coastal-observatory',
        moodId: 'twilight',
        skyPresetId: 'diurnal-cloudscape',
        triggerMode: 'hover-reactive',
        immersiveSkyOnly: true,
      },
      renderer_key: 'threejs.samscene.sky-dome.v1',
      source_refs: ['/assets/aistudio/Screen_Recording_2026-11-18_at_12.18.29_pm_ced0d7d7.mov'],
      status: 'active',
      sort_order: 1,
    });

    this.createTemplate({
      id: 'tpl-sky-andromeda-galaxy',
      sku: 'SAM-SKY-GALAXY-002',
      app_id: 'samscene-studio',
      resource_kind: 'sky_shader',
      pack_slug: 'deep-cosmos-pack',
      pack_title: 'Deep Cosmos & Outer Space Pack',
      category: 'outer-space',
      title: 'Andromeda Spiral Galaxy & H-Alpha Nebula',
      description:
        'Deep outer-space galactic core with logarithmic spiral dust lanes, volumetric cyan-violet nebula clouds, and instanced star clusters.',
      use_case: 'Sci-fi product reveal, interactive scroll-zoom cosmos, spatial audio stage',
      tags: ['galaxy', 'nebula', 'outer-space', 'stars', 'scroll-scene'],
      specs: {
        triggerMode: 'scroll-reactive',
        presetId: 'andromeda-nebula',
        swatchHex: '#8b5cf6',
        celestialBody: 'spiral-galaxy',
      },
      payload: {
        environmentId: 'orbital-lab',
        moodId: 'noir',
        skyPresetId: 'andromeda-nebula',
        triggerMode: 'scroll-reactive',
        immersiveSkyOnly: false,
      },
      renderer_key: 'threejs.samscene.sky-dome.v1',
      status: 'active',
      sort_order: 2,
    });

    this.createTemplate({
      id: 'tpl-sky-polar-aurora',
      sku: 'SAM-SKY-AURORA-003',
      app_id: 'samscene-studio',
      resource_kind: 'hover_scroll_scene',
      pack_slug: 'celestial-sky-horizons',
      pack_title: 'Celestial Sky & Horizon Pack',
      category: 'sky-atmosphere',
      title: 'Geomagnetic Aurora & Comet Shower',
      description:
        'Undulating emerald-violet polar aurora ribbons above a twilight pine clearing with hover-steered geomagnetic curtains.',
      use_case: 'Interactive ambient storytelling, hover-triggered web banner, voice-reactive stage',
      tags: ['aurora', 'borealis', 'comets', 'hover-trigger', 'twilight'],
      specs: {
        triggerMode: 'hover-reactive',
        presetId: 'aurora-borealis',
        swatchHex: '#34d399',
        celestialBody: 'comet-shower',
      },
      payload: {
        environmentId: 'twilight-forest',
        moodId: 'dawn',
        skyPresetId: 'aurora-borealis',
        triggerMode: 'hover-reactive',
        immersiveSkyOnly: false,
      },
      renderer_key: 'threejs.samscene.sky-dome.v1',
      status: 'active',
      sort_order: 3,
    });

    this.createTemplate({
      id: 'tpl-sky-exoplanet-rings',
      sku: 'SAM-SKY-EXOPLANET-004',
      app_id: 'samscene-studio',
      resource_kind: 'sky_shader',
      pack_slug: 'deep-cosmos-pack',
      pack_title: 'Deep Cosmos & Outer Space Pack',
      category: 'outer-space',
      title: 'Ringed Gas Giant & Twin Moons Horizon',
      description:
        'Monumental illuminated planetary ring system arching across an alien golden-cobalt sky with scroll-linked orbital elevation.',
      use_case: 'Scroll-driven scrollytelling chapter, game title screen, XR observatory',
      tags: ['exoplanet', 'rings', 'moons', 'outer-space', 'scroll-trigger'],
      specs: {
        triggerMode: 'scroll-reactive',
        presetId: 'exoplanet-rings',
        swatchHex: '#f59e0b',
        celestialBody: 'ringed-planet',
      },
      payload: {
        environmentId: 'coastal-observatory',
        moodId: 'sunset',
        skyPresetId: 'exoplanet-rings',
        triggerMode: 'scroll-reactive',
        immersiveSkyOnly: false,
      },
      renderer_key: 'threejs.samscene.sky-dome.v1',
      status: 'active',
      sort_order: 4,
    });

    this.createTemplate({
      id: 'tpl-char-astro-pip',
      sku: 'SAM-CHAR-ASTROPIP-005',
      app_id: 'samscene-studio',
      resource_kind: 'character_actor',
      pack_slug: 'starlight-cast-pack',
      pack_title: 'Starlight Animated Character Pack',
      category: 'cartoon-characters',
      title: 'Captain Pip — Starlight Cartographer',
      description:
        'Cinematic 3D cartoon explorer character with glass astronaut visor, flowing starlight cape, cosmic orb prop, and bouncy SamSpeak lip/visor sync.',
      use_case: 'Interactive host character, animated mascot, narrated scene guide',
      tags: ['character', 'cartoon', 'astronaut', 'animated', 'samspeak'],
      specs: {
        stylePreset: 'pixar-cinematic',
        swatchHex: '#38bdf8',
        voiceName: 'Puck',
        animationStyle: 'bouncy-cartoon',
      },
      payload: {
        character: {
          id: 'char-seed-pip',
          name: 'Captain Pip',
          archetype: 'Starlight Cartographer',
          stylePreset: 'pixar-cinematic',
          bio: 'An upbeat celestial scout who maps spiral galaxies and guides visitors through SamScene skies.',
          voiceName: 'Puck',
          voiceStyle: 'Bright, curious animated adventure hero',
          introScript:
            'Whoa, look up at those clouds! <laugh> Move your cursor or scroll to bend the whole galaxy with me!',
          headShape: 'chibi',
          headgear: 'astronaut-helmet',
          outfit: 'cape',
          propItem: 'cosmic-orb',
          animationStyle: 'bouncy-cartoon',
          scaleHeight: 1.0,
          palette: {
            skinHex: '#f6c7a8',
            primaryHex: '#2563eb',
            secondaryHex: '#f8fafc',
            accentHex: '#f59e0b',
            eyeHex: '#0ea5e9',
            hairHex: '#4f46e5',
          },
        },
      },
      renderer_key: 'threejs.samscene.character-rig.v1',
      status: 'active',
      sort_order: 5,
    });
  }
}
