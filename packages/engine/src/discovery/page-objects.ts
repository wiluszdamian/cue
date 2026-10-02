import { AST_NODE_TYPES, parse, type TSESTree } from '@typescript-eslint/typescript-estree';

/**
 * Classes that wrap a Playwright `Page`: the shape every page object has, whatever
 * the folder or the name. Read from the text; the file is never run.
 */

function isPageType(annotation: TSESTree.TSTypeAnnotation | undefined): boolean {
  const type = annotation?.typeAnnotation;
  return (
    type?.type === AST_NODE_TYPES.TSTypeReference &&
    type.typeName.type === AST_NODE_TYPES.Identifier &&
    type.typeName.name === 'Page'
  );
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

/** Names of the classes in `text` that hold a `Page`, as a field or as a constructor parameter. */
export function findPageObjectClasses(text: string): string[] {
  let ast: TSESTree.Program;
  try {
    ast = parse(text, { range: false, loc: false, jsx: false });
  } catch {
    return [];
  }

  const names: string[] = [];
  const visit = (node: TSESTree.Node): void => {
    if (
      (node.type === AST_NODE_TYPES.ClassDeclaration ||
        node.type === AST_NODE_TYPES.ClassExpression) &&
      node.id !== null &&
      holdsPage(node)
    ) {
      names.push(node.id.name);
    }
    for (const child of children(node)) visit(child);
  };
  visit(ast);
  return names;
}

function holdsPage(node: TSESTree.ClassDeclaration | TSESTree.ClassExpression): boolean {
  for (const member of node.body.body) {
    if (member.type === AST_NODE_TYPES.PropertyDefinition && isPageType(member.typeAnnotation)) {
      return true;
    }
    if (
      member.type === AST_NODE_TYPES.MethodDefinition &&
      member.kind === 'constructor' &&
      member.value.params.some((param) => {
        const target = param.type === AST_NODE_TYPES.TSParameterProperty ? param.parameter : param;
        return (
          (target.type === AST_NODE_TYPES.Identifier ||
            target.type === AST_NODE_TYPES.AssignmentPattern) &&
          isPageType(
            target.type === AST_NODE_TYPES.Identifier
              ? target.typeAnnotation
              : target.left.type === AST_NODE_TYPES.Identifier
                ? target.left.typeAnnotation
                : undefined,
          )
        );
      })
    ) {
      return true;
    }
  }
  return false;
}
