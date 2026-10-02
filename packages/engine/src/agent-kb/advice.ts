/**
 * The command that fixes a gap in what is known, written once. Every message that
 * tells somebody to look at a page again says it the same way, and the narrowest
 * form that will do: a route when one is known, not "survey the app".
 */

/** `cue survey --route /login --base-url <url>`, or the plain form for a page not yet named. */
export function surveyCommand(route?: string): string {
  return route === undefined ? 'cue survey <url>' : `cue survey --route ${route} --base-url <url>`;
}

/** For everything that has gone stale at once, rather than one named route. */
export const SURVEY_STALE_COMMAND = 'cue survey --stale --base-url <url>';
