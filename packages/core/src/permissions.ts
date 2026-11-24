import type { CapabilityId } from './capabilities';
import type { Reach } from './reach';
import type { RoleKey } from './roles';

/** Everything the permission check needs to know about the signed-in person. */
export interface Actor {
  userId: string;
  roles: RoleKey[];
  /** Section ids where this person is the class teacher. */
  classTeacherOf: string[];
  /** Section ids this person teaches a subject in. */
  teaches: string[];
  /** Student ids whose guardian record is linked to this login. */
  children: string[];
  /** Set only for student logins (not used in v1). */
  studentId?: string;
}

/** The record an action is aimed at. Always built on the server from stored data. */
export type Target =
  | { kind: 'school' }
  | { kind: 'section'; sectionId: string }
  | { kind: 'student'; studentId: string; sectionId: string }
  | { kind: 'user'; userId: string };

export interface Grant {
  role: RoleKey;
  capability: CapabilityId;
  reach: Reach;
}

/** Does `reach`, held by `actor`, cover `target`? */
export function covers(actor: Actor, reach: Reach, target: Target): boolean {
  switch (reach) {
    case 'SCHOOL':
      return true;
    case 'OWN_CLASS':
      return (
        (target.kind === 'section' || target.kind === 'student') &&
        actor.classTeacherOf.includes(target.sectionId)
      );
    case 'OWN_SECTIONS':
      return (
        (target.kind === 'section' || target.kind === 'student') &&
        (actor.teaches.includes(target.sectionId) || actor.classTeacherOf.includes(target.sectionId))
      );
    case 'OWN_CHILD':
      return target.kind === 'student' && actor.children.includes(target.studentId);
    case 'SELF':
      return (
        (target.kind === 'user' && target.userId === actor.userId) ||
        (target.kind === 'student' && !!actor.studentId && target.studentId === actor.studentId)
      );
    case 'NONE':
      return false;
  }
}

/**
 * May `actor` perform `capability` on `target`?
 *
 * True when ANY of the actor's roles grants the capability at a reach that covers the
 * target. Fails closed: no matching grant means no.
 */
export function can(actor: Actor, capability: CapabilityId, target: Target, grants: Grant[]): boolean {
  return grants.some(
    (g) =>
      g.capability === capability &&
      g.reach !== 'NONE' &&
      actor.roles.includes(g.role) &&
      covers(actor, g.reach, target)
  );
}

/** The reaches at which the actor holds a capability. Empty means not at all. */
export function reachesFor(actor: Actor, capability: CapabilityId, grants: Grant[]): Reach[] {
  const out = new Set<Reach>();
  for (const g of grants) {
    if (g.capability === capability && g.reach !== 'NONE' && actor.roles.includes(g.role)) out.add(g.reach);
  }
  return [...out];
}

/** Holds the capability at any reach. Useful for showing or hiding a menu item. */
export function hasCapability(actor: Actor, capability: CapabilityId, grants: Grant[]): boolean {
  return reachesFor(actor, capability, grants).length > 0;
}
