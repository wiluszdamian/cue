import { AST_NODE_TYPES, parse, type TSESTree } from '@typescript-eslint/typescript-estree';
import { findPageObjectClasses } from '../../discovery/page-objects.js';
import type { TestActionEntry, TestLocatorEntry } from '../../schema/agent-kb.js';
import {
  pathFromTarget,
  routeContextFor,
  scanTestSource,
  type LocatorUse,
} from '../extract-locators.js';
import { reference, type SourceFileRef } from './scan.js';

/**
 * What existing tests and page objects already say about an application: which
 * elements they reach for, on which page, and what the page object's methods do with
 * them. It reads the text; nothing is run, so a test that has been failing for a year
 * is read exactly like one that passes.
 *
 * That is why none of it is trusted. A locator in a test is a claim somebody once
 * made, not something seen on the page; the entries here carry where the claim was made
 * and nothing else, and are loaded as inferred.
 *
 * Only `getByRole` with a plain role and name is read. Those are the locators the
 * knowledge base stores, so an entry can later be confirmed or contradicted by a survey
 * of the same element; a test id, a label or a CSS selector has no counterpart to meet.
 */

export interface ExistingTests {
  readonly locators: readonly TestLocatorEntry[];
  readonly actions: readonly TestActionEntry[];
  readonly gaps: readonly string[];
}

const NOTHING: ExistingTests = { locators: [], actions: [], gaps: [] };

/** `changePassword` → `change password`. */
export function intentOf(methodName: string): string {
  return methodName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .trim();
}

function children(node: TSESTree.Node): TSESTree.Node[] {
  const found: TSESTree.Node[] = [];
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === 'object' && typeof (child as TSESTree.Node).type === 'string') {
        found.push(child as TSESTree.Node);
      }
    }
  }
  return found;
}

interface Member {
  readonly className: string;
  readonly name: string;
  readonly kind: 'method' | 'getter' | 'field';
  readonly start: number;
  readonly end: number;
  readonly node: TSESTree.Node;
  readonly isPrivate: boolean;
}

function membersOf(ast: TSESTree.Program, pageObjects: ReadonlySet<string>): Member[] {
  const members: Member[] = [];
  const visit = (node: TSESTree.Node): void => {
    if (
      (node.type === AST_NODE_TYPES.ClassDeclaration ||
        node.type === AST_NODE_TYPES.ClassExpression) &&
      node.id !== null &&
      pageObjects.has(node.id.name)
    ) {
      for (const member of node.body.body) {
        if (
          (member.type !== AST_NODE_TYPES.MethodDefinition &&
            member.type !== AST_NODE_TYPES.PropertyDefinition) ||
          member.computed
        ) {
          continue;
        }
        const key = member.key;
        const name =
          key.type === AST_NODE_TYPES.Identifier
            ? key.name
            : key.type === AST_NODE_TYPES.PrivateIdentifier
              ? key.name
              : undefined;
        if (
          name === undefined ||
          (member.type === AST_NODE_TYPES.MethodDefinition && member.kind === 'constructor')
        ) {
          continue;
        }
        members.push({
          className: node.id.name,
          name,
          kind:
            member.type === AST_NODE_TYPES.PropertyDefinition
              ? 'field'
              : member.kind === 'get'
                ? 'getter'
                : 'method',
          start: member.range[0],
          end: member.range[1],
          node: member,
          isPrivate:
            key.type === AST_NODE_TYPES.PrivateIdentifier ||
            name.startsWith('_') ||
            member.accessibility === 'private' ||
            member.accessibility === 'protected',
        });
      }
    }
    for (const child of children(node)) visit(child);
  };
  visit(ast);
  return members;
}

/** The names `this.x` that a member's body reaches for. */
function thisReferences(node: TSESTree.Node): Set<string> {
  const names = new Set<string>();
  const visit = (current: TSESTree.Node): void => {
    if (
      current.type === AST_NODE_TYPES.MemberExpression &&
      !current.computed &&
      current.object.type === AST_NODE_TYPES.ThisExpression &&
      current.property.type === AST_NODE_TYPES.Identifier
    ) {
      names.add(current.property.name);
    }
    for (const child of children(current)) visit(child);
  };
  visit(node);
  return names;
}

/** A `getByRole` the knowledge base could hold: plain role, plain name, on the page itself. */
function storable(use: LocatorUse): boolean {
  return use.method === 'getByRole' && use.value !== undefined && !use.dynamic && !use.chained;
}

export function readExistingTests(file: SourceFileRef): ExistingTests {
  // Rejoined with the original separator, so offsets and line numbers match the file.
  const text = file.lines.join('\n');
  const scan = scanTestSource(text);
  if (scan.locators.length === 0) return NOTHING;

  const pageObjects = new Set(findPageObjectClasses(text));
  let members: Member[] = [];
  if (pageObjects.size > 0) {
    try {
      members = membersOf(parse(text, { range: true, loc: true, jsx: false }), pageObjects);
    } catch {
      // `scanTestSource` already read the file; if this cannot, the locators still count, as tests.
    }
  }

  const within = (use: LocatorUse): Member | undefined =>
    members.find((member) => use.offset >= member.start && use.offset < member.end);

  const gaps: string[] = [];
  const locators = new Map<string, TestLocatorEntry>();
  let withoutRoute = 0;

  for (const use of scan.locators.filter(storable)) {
    const route = routeContextFor(use, scan);
    if (route === undefined) {
      withoutRoute += 1;
      continue;
    }
    const role = (use.value ?? '').toLowerCase();
    const owner = within(use);
    const key = `${route}\u0000${role}\u0000${use.name ?? ''}`;
    if (locators.has(key)) continue;
    locators.set(key, {
      route,
      role,
      ...(use.name === undefined ? {} : { name: use.name }),
      expression: use.locator,
      source: reference(file, use.line - 1),
      origin: owner === undefined ? 'existing-test' : 'page-object',
      ...(owner === undefined ? {} : { symbol: `${owner.className}.${owner.name}` }),
    });
  }

  if (withoutRoute > 0) {
    gaps.push(
      `${file.path}: ${String(withoutRoute)} role locator(s) had no page to attach to (no page.goto before them, no understudy-route comment), so they were not recorded`,
    );
  }

  // --- actions: the public methods of a page object that touch the page
  const actions: TestActionEntry[] = [];
  for (const member of members.filter((m) => m.kind === 'method' && !m.isPrivate)) {
    const own = scan.locators.filter(
      (use) => storable(use) && use.offset >= member.start && use.offset < member.end,
    );
    // One level of `this.emailField`: the page objects people write keep the locators in getters.
    const named = thisReferences(member.node);
    const borrowed = members
      .filter((other) => other.className === member.className && named.has(other.name))
      .flatMap((other) =>
        scan.locators.filter(
          (use) => storable(use) && use.offset >= other.start && use.offset < other.end,
        ),
      );
    const used = [...own, ...borrowed];
    if (used.length === 0) continue;

    const navigation = scan.navigations.find(
      (nav) => nav.offset >= member.start && nav.offset < member.end,
    );
    const target = navigation?.target ?? scan.routeAnnotation;
    const route = target === undefined ? undefined : pathFromTarget(target);
    if (route === undefined) {
      gaps.push(
        `${file.path}: ${member.className}.${member.name} uses the page but no route is known for it, so it was not recorded as an action`,
      );
      continue;
    }

    actions.push({
      route,
      intent: intentOf(member.name),
      symbol: `${member.className}.${member.name}`,
      source: reference(file, member.node.loc.start.line - 1),
      locators: [...new Set(used.map((use) => use.locator))],
    });
  }

  return { locators: [...locators.values()], actions, gaps };
}
