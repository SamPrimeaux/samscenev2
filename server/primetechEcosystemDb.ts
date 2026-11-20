import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { PrimeTechEcosystemSnapshot } from '../src/types.ts';

export interface LumberDimensionSpec {
  nominal: string;
  actualThicknessIn: number;
  actualWidthIn: number;
  actualThicknessMm: number;
  actualWidthMm: number;
  source: string;
}

const AWC_LUMBER_SPECS: LumberDimensionSpec[] = [
  { nominal: '2x4', actualThicknessIn: 1.5, actualWidthIn: 3.5, actualThicknessMm: 38.1, actualWidthMm: 88.9, source: 'American Wood Council NDS' },
  { nominal: '2x6', actualThicknessIn: 1.5, actualWidthIn: 5.5, actualThicknessMm: 38.1, actualWidthMm: 139.7, source: 'American Wood Council NDS' },
  { nominal: '2x8', actualThicknessIn: 1.5, actualWidthIn: 7.25, actualThicknessMm: 38.1, actualWidthMm: 184.2, source: 'American Wood Council NDS' },
  { nominal: '2x10', actualThicknessIn: 1.5, actualWidthIn: 9.25, actualThicknessMm: 38.1, actualWidthMm: 235.0, source: 'American Wood Council NDS' },
  { nominal: '2x12', actualThicknessIn: 1.5, actualWidthIn: 11.25, actualThicknessMm: 38.1, actualWidthMm: 285.8, source: 'American Wood Council NDS' },
];

export class PrimeTechEcosystemRepository {
  private db: DatabaseSync;

  constructor(dbFilePath: string) {
    const dir = path.dirname(dbFilePath);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(dbFilePath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.initSchema();
    this.seedDefaults();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agentsam_plugins (
        id TEXT PRIMARY KEY,
        plugin_key TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agentsam_tools (
        id TEXT PRIMARY KEY DEFAULT ('ast_' || lower(hex(randomblob(8)))),
        tool_name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        tool_category TEXT NOT NULL,
        handler_type TEXT NOT NULL DEFAULT 'mcp'
          CHECK (handler_type IN (
            'mcp','r2','github','terminal','http','proxy','ai','d1',
            'hyperdrive','supabase','kv','durable_object','filesystem',
            'browser_agentic','mybrowser','websearch','telemetry','eval',
            'task.planner','task.organizer','task.manager','workspace.reader',
            'cf','deploy','git','memory','notify','workflow','agent',
            'browser','media','canvas','integrations','cms'
          )),
        description TEXT,
        input_schema TEXT,
        output_schema TEXT,
        linked_mcp_tool_id TEXT,
        mcp_service_url TEXT,
        handler_config TEXT DEFAULT '{}',
        intent_tags TEXT DEFAULT '[]',
        intent_category_tags TEXT,
        modes_json TEXT DEFAULT '["agent","plan","debug","multitask","ask"]',
        risk_level TEXT NOT NULL DEFAULT 'low'
          CHECK (risk_level IN ('low','medium','high','critical')),
        requires_approval INTEGER NOT NULL DEFAULT 0,
        requires_confirmation INTEGER NOT NULL DEFAULT 0,
        token_budget_per_call INTEGER DEFAULT NULL,
        max_calls_per_session INTEGER DEFAULT NULL,
        cost_per_call_usd REAL DEFAULT 0.0,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_degraded INTEGER NOT NULL DEFAULT 0,
        failure_rate REAL DEFAULT 0.0,
        avg_latency_ms REAL DEFAULT NULL,
        use_count INTEGER NOT NULL DEFAULT 0,
        last_used_at INTEGER DEFAULT NULL,
        last_health_check INTEGER DEFAULT NULL,
        sort_priority INTEGER DEFAULT 50,
        workspace_scope TEXT NOT NULL DEFAULT '["*"]',
        subagent_profile_id TEXT DEFAULT NULL,
        schema_hint TEXT DEFAULT NULL,
        notes TEXT DEFAULT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        is_global INTEGER DEFAULT 1,
        tool_key TEXT,
        capability_key TEXT,
        handler_key TEXT,
        route_key TEXT,
        workflow_key TEXT,
        task_type TEXT DEFAULT 'tool_use',
        domain TEXT DEFAULT 'general',
        capability_tier TEXT DEFAULT 'common',
        internal_seo TEXT DEFAULT '',
        tool_code TEXT DEFAULT NULL,
        oauth_visible INTEGER NOT NULL DEFAULT 0,
        dispatch_target TEXT NOT NULL DEFAULT 'internal',
        result_policy_json TEXT,
        caller_policy TEXT,
        cache_policy_json TEXT,
        updated_at_unix INTEGER,
        connector_visible INTEGER NOT NULL DEFAULT 0
          CHECK (connector_visible IN (0, 1)),
        connector_priority INTEGER,
        connector_access_class TEXT NOT NULL DEFAULT 'read'
          CHECK (connector_access_class IN ('read', 'write')),
        account_id TEXT,
        plugin_key TEXT,
        plugin_id TEXT REFERENCES agentsam_plugins(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS agentsam_skill (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        name TEXT NOT NULL,
        slash_trigger TEXT NOT NULL
          CHECK (slash_trigger GLOB '/[a-z0-9][a-z0-9-]*'),
        npm_package_name TEXT,
        npm_version TEXT,
        is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0,1)),
        description TEXT NOT NULL DEFAULT '',
        content_markdown TEXT NOT NULL DEFAULT '',
        file_path TEXT NOT NULL DEFAULT '',
        content_checksum TEXT NOT NULL DEFAULT '',
        globs TEXT NOT NULL DEFAULT '[]',
        always_apply INTEGER NOT NULL DEFAULT 0 CHECK (always_apply IN (0,1)),
        task_types_json TEXT NOT NULL DEFAULT '[]',
        route_keys_json TEXT NOT NULL DEFAULT '[]',
        access_mode TEXT NOT NULL DEFAULT 'read_write'
          CHECK (access_mode IN ('read_only','read_write')),
        icon TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        invocation_count INTEGER NOT NULL DEFAULT 0,
        last_invoked_at TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (account_id, slash_trigger),
        UNIQUE (npm_package_name, npm_version)
      );

      CREATE TABLE IF NOT EXISTS agentsam_cad_jobs (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        user_id TEXT NOT NULL,
        engine TEXT NOT NULL,
        prompt TEXT,
        mode TEXT DEFAULT 'text',
        status TEXT DEFAULT 'pending',
        external_task_id TEXT,
        result_url TEXT,
        r2_key TEXT,
        error TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        workspace_id TEXT,
        tenant_id TEXT,
        project_id TEXT,
        scene_snapshot_id TEXT,
        progress_pct REAL DEFAULT 0,
        runner_host TEXT,
        started_at INTEGER,
        finished_at INTEGER,
        error_code TEXT,
        task_type TEXT DEFAULT 'text-to-3d',
        parent_task_id TEXT,
        rig_task_id TEXT,
        credits_consumed INTEGER DEFAULT 0,
        model_formats TEXT,
        texture_data TEXT,
        r2_bucket TEXT CHECK (r2_bucket IS NULL OR length(trim(r2_bucket)) > 0)
      );

      CREATE TABLE IF NOT EXISTS agentsam_workflows (
        id TEXT PRIMARY KEY DEFAULT ('wf_' || lower(hex(randomblob(8)))),
        workflow_key TEXT NOT NULL CHECK(length(trim(workflow_key)) > 0),
        revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
        scope_type TEXT NOT NULL DEFAULT 'platform' CHECK(scope_type IN ('platform','account')),
        account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
        display_name TEXT NOT NULL CHECK(length(trim(display_name)) > 0),
        description TEXT,
        entry_node_key TEXT,
        lifecycle TEXT NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','active','disabled','retired')),
        input_schema_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(input_schema_json)),
        output_schema_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(output_schema_json)),
        metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
        ui_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(ui_json)),
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        CHECK(
          (scope_type='platform' AND account_id IS NULL)
          OR
          (scope_type='account' AND account_id IS NOT NULL)
        )
      );

      CREATE TABLE IF NOT EXISTS agentsam_workflow_nodes (
        workflow_id TEXT NOT NULL REFERENCES agentsam_workflows(id) ON DELETE CASCADE,
        node_key TEXT NOT NULL,
        label TEXT NOT NULL,
        node_type TEXT NOT NULL DEFAULT 'task',
        PRIMARY KEY (workflow_id, node_key)
      );

      CREATE TABLE IF NOT EXISTS agentsam_workflow_edges (
        id TEXT PRIMARY KEY DEFAULT ('wedge_' || lower(hex(randomblob(8)))),
        workflow_id TEXT NOT NULL,
        from_node_key TEXT NOT NULL,
        to_node_key TEXT NOT NULL,
        condition_type TEXT NOT NULL DEFAULT 'always' CHECK(condition_type IN ('always','status','field','branch')),
        condition_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(condition_json)),
        priority INTEGER NOT NULL DEFAULT 0,
        is_fallback INTEGER NOT NULL DEFAULT 0 CHECK(is_fallback IN (0,1)),
        ui_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(ui_json)),
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        CHECK(from_node_key <> to_node_key),
        FOREIGN KEY(workflow_id,from_node_key) REFERENCES agentsam_workflow_nodes(workflow_id,node_key) ON DELETE CASCADE,
        FOREIGN KEY(workflow_id,to_node_key) REFERENCES agentsam_workflow_nodes(workflow_id,node_key) ON DELETE CASCADE,
        UNIQUE(workflow_id,from_node_key,to_node_key,condition_type,priority)
      );
    `);
  }

  private seedDefaults(): void {
    this.db.prepare(
      `INSERT OR IGNORE INTO accounts (id, name) VALUES ('acct-primetech', 'PrimeTech Systems')`
    ).run();

    this.db.prepare(
      `INSERT OR IGNORE INTO agentsam_plugins (id, plugin_key, name)
       VALUES
         ('plg-arch-intel', 'agentsam-architectural-intelligence', 'Architectural Intelligence'),
         ('plg-primetech-proc', 'primetech-procedures', 'PrimeTech Procedures'),
         ('plg-iamscene', 'iamscene', 'IAMScene Spatial Runtime')`
    ).run();

    // 5 Executable MCP Tools (Architectural Intelligence) + 4 PrimeTech Procedure Engine APIs
    const tools: Array<{
      id: string;
      tool_name: string;
      display_name: string;
      tool_category: string;
      handler_type: string;
      description: string;
      domain: string;
      risk_level: 'low' | 'medium';
      requires_approval: number;
      plugin_key: string;
      plugin_id: string;
      sort_priority: number;
    }> = [
      {
        id: 'ast_arch_material_lookup',
        tool_name: 'arch.material.lookup',
        display_name: 'Lumber & Material Lookup',
        tool_category: 'architectural-intelligence',
        handler_type: 'mcp',
        description: 'Looks up actual lumber dimensions (2x4 through 2x12) sourced from American Wood Council NDS.',
        domain: 'architecture',
        risk_level: 'low',
        requires_approval: 0,
        plugin_key: 'agentsam-architectural-intelligence',
        plugin_id: 'plg-arch-intel',
        sort_priority: 10,
      },
      {
        id: 'ast_arch_assembly_thickness',
        tool_name: 'arch.assembly.thickness',
        display_name: 'Assembly Thickness Calculator',
        tool_category: 'architectural-intelligence',
        handler_type: 'mcp',
        description: 'Calculates specified multi-layer wall, floor, and roof assembly thickness.',
        domain: 'architecture',
        risk_level: 'low',
        requires_approval: 0,
        plugin_key: 'agentsam-architectural-intelligence',
        plugin_id: 'plg-arch-intel',
        sort_priority: 20,
      },
      {
        id: 'ast_arch_qa_compare',
        tool_name: 'arch.qa.compare_dimensions',
        display_name: 'QA Dimension Comparator',
        tool_category: 'architectural-intelligence',
        handler_type: 'mcp',
        description: 'Compares CAD/field measurements against engineering tolerance bands.',
        domain: 'architecture',
        risk_level: 'low',
        requires_approval: 0,
        plugin_key: 'agentsam-architectural-intelligence',
        plugin_id: 'plg-arch-intel',
        sort_priority: 30,
      },
      {
        id: 'ast_arch_references_list',
        tool_name: 'arch.references.list',
        display_name: 'Technical Authorities Registry',
        tool_category: 'architectural-intelligence',
        handler_type: 'mcp',
        description: 'Returns curated authorities: AWC, National CAD Standard, IFC 4.3, buildingSMART IDS, CSI MasterFormat, DXF, ICC, US Access Board.',
        domain: 'architecture',
        risk_level: 'low',
        requires_approval: 0,
        plugin_key: 'agentsam-architectural-intelligence',
        plugin_id: 'plg-arch-intel',
        sort_priority: 40,
      },
      {
        id: 'ast_arch_capabilities_status',
        tool_name: 'arch.capabilities.status',
        display_name: 'Capability Boundary Report',
        tool_category: 'architectural-intelligence',
        handler_type: 'mcp',
        description: 'Reports verified Architectural Intelligence MCP capabilities and explicit boundary constraints.',
        domain: 'architecture',
        risk_level: 'low',
        requires_approval: 0,
        plugin_key: 'agentsam-architectural-intelligence',
        plugin_id: 'plg-arch-intel',
        sort_priority: 50,
      },
      {
        id: 'ast_proc_validate_manifest',
        tool_name: 'primetech.validateProcedureManifest',
        display_name: 'validateProcedureManifest()',
        tool_category: 'primetech-procedures',
        handler_type: 'workflow',
        description: 'Validates versioned PrimeTech procedure definitions, schemas, effect classifications, and approval gates.',
        domain: 'engineering',
        risk_level: 'low',
        requires_approval: 0,
        plugin_key: 'primetech-procedures',
        plugin_id: 'plg-primetech-proc',
        sort_priority: 60,
      },
      {
        id: 'ast_proc_create_catalog',
        tool_name: 'primetech.createProcedureCatalog',
        display_name: 'createProcedureCatalog()',
        tool_category: 'primetech-procedures',
        handler_type: 'workflow',
        description: 'Discovers and manages authorized PrimeTech engineering procedures across hosts.',
        domain: 'engineering',
        risk_level: 'low',
        requires_approval: 0,
        plugin_key: 'primetech-procedures',
        plugin_id: 'plg-primetech-proc',
        sort_priority: 70,
      },
      {
        id: 'ast_proc_handler',
        tool_name: 'primetech.createPrimeTechProcedureHandler',
        display_name: 'createPrimeTechProcedureHandler()',
        tool_category: 'primetech-procedures',
        handler_type: 'workflow',
        description: 'Executes authorized procedures using SAM operation routing and SHA-256 verification receipts.',
        domain: 'engineering',
        risk_level: 'medium',
        requires_approval: 1,
        plugin_key: 'primetech-procedures',
        plugin_id: 'plg-primetech-proc',
        sort_priority: 80,
      },
      {
        id: 'ast_proc_summarize',
        tool_name: 'primetech.summarizeProcedureRuns',
        display_name: 'summarizeProcedureRuns()',
        tool_category: 'primetech-procedures',
        handler_type: 'telemetry',
        description: 'Summarizes execution receipts, SHA-256 hashes, and feasibility checks across runs.',
        domain: 'engineering',
        risk_level: 'low',
        requires_approval: 0,
        plugin_key: 'primetech-procedures',
        plugin_id: 'plg-primetech-proc',
        sort_priority: 90,
      },
    ];

    const insertTool = this.db.prepare(`
      INSERT OR IGNORE INTO agentsam_tools (
        id, tool_name, display_name, tool_category, handler_type,
        description, domain, risk_level, requires_approval,
        plugin_key, plugin_id, sort_priority, account_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'acct-primetech')
    `);
    for (const t of tools) {
      insertTool.run(
        t.id,
        t.tool_name,
        t.display_name,
        t.tool_category,
        t.handler_type,
        t.description,
        t.domain,
        t.risk_level,
        t.requires_approval,
        t.plugin_key,
        t.plugin_id,
        t.sort_priority
      );
    }

    // 12 Architectural Skills (skills/agentsam-arch-*)
    const skills: Array<[string, string, string, string]> = [
      ['arch-accessibility', 'Accessibility', '/arch-accessibility', 'Accessibility scoping & US Access Board compliance checks'],
      ['arch-assemblies', 'Assemblies', '/arch-assemblies', 'Walls, floors, roofs, and envelope opening assemblies'],
      ['arch-bim', 'BIM', '/arch-bim', 'Typed building objects, storeys, and IFC 4.3 exchange'],
      ['arch-cad', 'CAD', '/arch-cad', 'National CAD Standard drafting conventions and dimensioning'],
      ['arch-codes', 'Codes', '/arch-codes', 'Adopted building-code research across ICC references'],
      ['arch-coordination', 'Coordination', '/arch-coordination', 'Survey, structural, and MEP discipline coordination'],
      ['arch-documents', 'Documents', '/arch-documents', 'SD/DD/CD architectural documentation structuring'],
      ['arch-geometry', 'Geometry', '/arch-geometry', 'Solid-modeling operations and OCCT BREP/STEP provenance'],
      ['arch-materials', 'Materials', '/arch-materials', 'Manufacturer material specifications & CSI MasterFormat'],
      ['arch-orchestrate', 'Orchestrate', '/arch-orchestrate', 'Coordinating multi-step architectural workflows'],
      ['arch-specifications', 'Specifications', '/arch-specifications', 'Product and specification verification against schedules'],
      ['arch-verify', 'Verify', '/arch-verify', 'Evidence-based acceptance and tolerance verification'],
    ];

    const insertSkill = this.db.prepare(`
      INSERT OR IGNORE INTO agentsam_skill (
        id, account_id, name, slash_trigger, npm_package_name, npm_version,
        description, file_path, access_mode, sort_order
      ) VALUES (?, 'acct-primetech', ?, ?, '@inneranimalmedia/agentsam-architectural-intelligence', ?, ?, ?, 'read_only', ?)
    `);
    skills.forEach(([id, name, trigger, desc], idx) => {
      insertSkill.run(
        id,
        name,
        trigger,
        `2.6.14-skill.${idx + 1}`,
        desc,
        `skills/agentsam-${id}/SKILL.md`,
        idx + 1
      );
    });

    // Seed PrimeTech Procedures CAD Jobs
    const insertJob = this.db.prepare(`
      INSERT OR IGNORE INTO agentsam_cad_jobs (
        id, user_id, engine, prompt, mode, status, project_id, progress_pct, task_type, model_formats
      ) VALUES (?, 'primetech-lead', ?, ?, 'parametric', ?, 'samscene-primetech', ?, ?, ?)
    `);
    insertJob.run(
      'job_repo_asset_inventory',
      'primetech-procedures/repo.asset.inventory@0.1.0',
      'Read-only engineering asset inventory & SHA-256 provenance scan (.FCStd, .IFC, .STEP, .DXF, .SVG, .GLB)',
      'completed',
      100,
      'read-only-inventory',
      'FCStd,IFC,STEP,DXF,SVG,GLB'
    );
    insertJob.run(
      'job_motor_bearing_end_plate',
      'primetech-procedures/cad.motor-bearing-end-plate@0.1.0',
      'Parametric FreeCAD + OpenCASCADE motor/bearing end plate (Candidate B: 150 mm OD clearing 52 mm counterbore + simulation CAM)',
      'review_required',
      100,
      'parametric-manufacturing',
      'FCStd,STEP,STL,SVG,PDF'
    );
    insertJob.run(
      'job_iamscene_cadmesh_world',
      'iamscene@0.1.2/agentsam-occt',
      'PrimeTech CadMesh Terrain Monolith & Wireframe Horizon World (*iamscene.json -> GLTF/STEP/BREP)',
      'completed',
      100,
      'spatial-world',
      'IAMSCENE,GLTF,STEP,BREP'
    );

    // Seed Workflow + Nodes + Edges
    this.db.prepare(`
      INSERT OR IGNORE INTO agentsam_workflows (
        id, workflow_key, revision, scope_type, account_id, display_name, description, entry_node_key, lifecycle
      ) VALUES (
        'wf_primetech_cad_pipeline',
        'primetech.cad-review-pipeline',
        1,
        'platform',
        NULL,
        'PrimeTech Authorized CAD & Scene Pipeline',
        'Connects Architectural Intelligence reference lookups, PrimeTech Procedures execution receipts, and IAMScene 3D scene publishing.',
        'validate_manifest',
        'active'
      )
    `).run();

    const insertNode = this.db.prepare(`
      INSERT OR IGNORE INTO agentsam_workflow_nodes (workflow_id, node_key, label, node_type)
      VALUES ('wf_primetech_cad_pipeline', ?, ?, ?)
    `);
    insertNode.run('validate_manifest', 'validateProcedureManifest()', 'guard');
    insertNode.run('arch_lookup', 'Architectural Intelligence MCP', 'knowledge');
    insertNode.run('occt_generate', 'FreeCAD / OCCT Solid Build', 'compute');
    insertNode.run('iamscene_publish', 'IAMScene 3D Scene Document', 'export');

    const insertEdge = this.db.prepare(`
      INSERT OR IGNORE INTO agentsam_workflow_edges (id, workflow_id, from_node_key, to_node_key, condition_type, priority)
      VALUES (?, 'wf_primetech_cad_pipeline', ?, ?, 'always', ?)
    `);
    insertEdge.run('wedge_1', 'validate_manifest', 'arch_lookup', 1);
    insertEdge.run('wedge_2', 'arch_lookup', 'occt_generate', 2);
    insertEdge.run('wedge_3', 'occt_generate', 'iamscene_publish', 3);
  }

  public lookupLumber(query?: string): LumberDimensionSpec[] {
    if (!query || !query.trim()) return AWC_LUMBER_SPECS;
    const normalized = query.trim().toLowerCase().replace(/[×\s]+/g, 'x');
    const exact = AWC_LUMBER_SPECS.filter((s) => s.nominal === normalized);
    return exact.length > 0 ? exact : AWC_LUMBER_SPECS;
  }

  public getSnapshot(): PrimeTechEcosystemSnapshot {
    const tools = this.db
      .prepare(
        `SELECT id, tool_name, display_name, tool_category, handler_type, description, risk_level
         FROM agentsam_tools ORDER BY sort_priority ASC`
      )
      .all() as PrimeTechEcosystemSnapshot['tools'];

    const skills = this.db
      .prepare(
        `SELECT id, name, slash_trigger, npm_package_name, npm_version, description, access_mode
         FROM agentsam_skill ORDER BY sort_order ASC`
      )
      .all() as PrimeTechEcosystemSnapshot['skills'];

    const cadJobs = this.db
      .prepare(
        `SELECT id, engine, prompt, status, task_type, model_formats, progress_pct
         FROM agentsam_cad_jobs ORDER BY created_at DESC`
      )
      .all() as PrimeTechEcosystemSnapshot['cadJobs'];

    const workflows = this.db
      .prepare(
        `SELECT id, workflow_key, display_name, description, lifecycle, entry_node_key
         FROM agentsam_workflows`
      )
      .all() as PrimeTechEcosystemSnapshot['workflows'];

    const workflowEdges = this.db
      .prepare(
        `SELECT id, workflow_id, from_node_key, to_node_key, condition_type
         FROM agentsam_workflow_edges ORDER BY priority ASC`
      )
      .all() as PrimeTechEcosystemSnapshot['workflowEdges'];

    return {
      tools,
      skills,
      cadJobs,
      workflows,
      workflowEdges,
      packages: [
        {
          name: 'architectural-intelligence',
          version: '2.6.14',
          visibility: 'Private',
          role: '5 executable MCP tools + 9 authority references + 12 AgentSam architectural skills (AWC, NCS, IFC 4.3, IDS).',
          owner: 'PrimeTech Architecture',
        },
        {
          name: 'primetech-procedures',
          version: '2.6.14',
          visibility: 'Private',
          role: 'Controlled workflow execution engine with SHA-256 verification receipts across BIM & manufacturing.',
          owner: 'PrimeTech Engineering',
        },
        {
          name: 'theme-contract',
          version: '2.6.14',
          visibility: 'Private',
          role: 'Shared presentation contract separating customer data from interchangeable CMS theme renderers.',
          owner: 'AgentSam CMS',
        },
        {
          name: 'iamscene',
          version: '0.1.2',
          visibility: 'Public',
          releaseTrain: 'independent',
          role: 'Portable *.iamscene.json 3D scene format with OCCT BREP/STEP/GLTF provenance and hover/scroll circuits.',
          owner: 'PrimeTech Spatial / Creative',
        },
      ],
    };
  }
}
