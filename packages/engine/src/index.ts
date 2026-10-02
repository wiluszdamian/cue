/**
 * @understudy/engine — the core the rest of Understudy is generated from.
 *
 * Everything here reads `rules/` and produces diagnostics or documentation from
 * it. Nothing here knows about agents, targets, or the CLI: those layers depend
 * on this one, never the reverse.
 */

export { analyze, docsUrlFor, type AnalyzeOptions, type SourceFile } from './analyze.js';

export { normalizePath, scopeMatcher, type ScopeMatcher } from './scope.js';

export {
  countBySeverity,
  sortDiagnostics,
  type AnalysisResult,
  type AnalysisSkip,
  type NotChecked,
  type Diagnostic,
  type Fix,
} from './diagnostic.js';

export {
  loadConstitution,
  loadOwnership,
  loadRules,
  loadTags,
  RulesLoadError,
  type Rules,
} from './loader.js';

export {
  formatAnswer,
  topicsForSkill,
  whoOwns,
  type OwnedAnswer,
  type OwnershipAnswer,
  type OwnershipMatch,
  type UnownedAnswer,
} from './ownership.js';

export { formatValidationProblems, validateRules, type ValidationProblem } from './validate.js';

export {
  ConstitutionSchema,
  CONSTITUTION_SCHEMA_VERSION,
  DetectorSchema,
  isEnforceable,
  RuleSchema,
  SeveritySchema,
  TierSchema,
  type AstDetector,
  type Constitution,
  type Detector,
  type KnowledgeDetector,
  type EnforceableRule,
  type RegexDetector,
  type Rule,
  type Severity,
  type Tier,
} from './schema/constitution.js';

export {
  ChannelSchema,
  OwnerKindSchema,
  OwnershipSchema,
  OWNERSHIP_SCHEMA_VERSION,
  OwnerSchema,
  PrecedenceSchema,
  TopicSchema,
  type Channel,
  type Owner,
  type OwnerKind,
  type Ownership,
  type Precedence,
  type Topic,
} from './schema/ownership.js';

export { TagSetSchema, TAGS_SCHEMA_VERSION, type Tag, type TagSet } from './schema/tags.js';

export {
  expectedInvocationFlag,
  MODEL_INVOCABLE,
  SkillFrontmatterSchema,
  SkillKindSchema,
  SkillSchema,
  V1_SKILLS,
  type Skill,
  type SkillFrontmatter,
  type SkillKind,
} from './schema/skill.js';

export * from './agent-kb/index.js';

export * from './knowledge/index.js';

export * from './verification/index.js';

export * from './discovery/index.js';

export {
  AGENT_KB_SCHEMA_VERSION,
  ROUTE_MAP_VERSION,
  RouteMapFileV2Schema,
  RouteMapV1Schema,
  SourcesSchema,
  SurfaceSchema,
  VocabularySchema,
  type Sources,
  type Surface,
  type SurfaceEntry,
  type Term,
  type Vocabulary,
  ConfidenceSchema,
  FlowSchema,
  FreshnessSchema,
  KbElementSchema,
  RouteMapSchema,
  TestIdsSchema,
  type Confidence,
  type Flow,
  type Freshness,
  type KbElement,
  type KbLink,
  type RouteMap,
  type TestIds,
} from './schema/agent-kb.js';

export {
  formatSkillProblems,
  loadSkills,
  parseSkill,
  SkillLoadError,
  validateSkills,
  type SkillProblem,
} from './skills.js';

export {
  getRefinement,
  REFINEMENTS,
  type RefineContext,
  type Refinement,
} from './detectors/refinements.js';

export { FIXERS, getFixer, type Fixer } from './detectors/fixers.js';

export {
  getReporter,
  REPORTER_NAMES,
  REPORTERS,
  type Reporter,
  type ReporterName,
  type ReportContext,
} from './reporters/index.js';
