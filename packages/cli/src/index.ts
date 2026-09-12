/**
 * `understudy` — the operational CLI.
 *
 * Exported so the commands can be driven from tests and, later, from the MCP
 * server, without shelling out to the binary.
 */

export {
  AGENT_SIGNATURES,
  detectAgents,
  isTargetId,
  TARGET_IDS,
  type AgentSignature,
  type DetectedAgent,
  type TargetId,
} from './agents.js';

export {
  formatReport,
  installedTargets,
  runChecks,
  summarise,
  type CheckResult,
  type CheckStatus,
  type DoctorContext,
  type DoctorSummary,
} from './doctor.js';

export {
  describePlan,
  planInit,
  resolveRules,
  runInit,
  type InitOptions,
  type InitPlan,
  type InitResult,
} from './init.js';

export {
  apply,
  extractRegion,
  inspect,
  plan,
  planFile,
  removeFiles,
  type ApplyResult,
  type DesiredFile,
  type Plan,
  type PlanAction,
  type PlannedFile,
  type RemovalResult,
} from './install.js';

export {
  emptyManifest,
  filesForTarget,
  forgetFile,
  hashContent,
  MANIFEST_PATH,
  ManifestError,
  readManifest,
  recordFile,
  writeManifest,
  type ManagedFile,
  type Manifest,
} from './manifest.js';

export {
  addDevCommand,
  detectPackageManager,
  execCommand,
  fromLockfile,
  fromUserAgent,
  isPackageManager,
  PACKAGE_MANAGERS,
  runCommand,
  runsPostinstallByDefault,
  type Detection,
  type PackageManager,
} from './package-manager.js';

export { COMMANDS, isCommand, NOT_IMPLEMENTED_MARKER, type Command } from './commands.js';

export {
  checkExitCode,
  formatSyncReport,
  NotInstalledError,
  planSync,
  runSync,
  type SyncChange,
  type SyncOptions,
  type SyncReport,
  type SyncResult,
} from './sync.js';

export { countChanges, diffLines, isDiffable, renderDiff, type DiffLine } from './diff.js';

export {
  getTarget,
  optionalTargets,
  resolveTargets,
  TARGETS,
  type Target,
  type TargetContext,
} from './targets/index.js';
