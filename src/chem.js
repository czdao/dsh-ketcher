// Dependency-free SMILES utilities for the Host half of dsh-ketcher.
//
// Scope: validate that a string is SMILES, count heavy atoms, and compute a
// molecular formula from the graph (bond orders included, implicit hydrogens
// filled to default valence). It does NOT do stereo perception, aromatic
// kekulization for bond-order-sensitive cases, or produce a molfile — those
// need the Indigo engine Ketcher ships in the browser. For SMILES <-> molfile,
// use the drawing panel and insert the result.
//
// Reference: Daylight SMILES grammar (organic subset + bracket atoms + ring
// closures + branches + bond symbols).

const ORGANIC = new Set(['B', 'C', 'N', 'O', 'P', 'S', 'F', 'Cl', 'Br', 'I']);
const AROMATIC_LOWER = new Set(['b', 'c', 'n', 'o', 'p', 's']);

// Default valence for neutral atoms of the organic subset.
const VALENCE = { B: 3, C: 4, N: 3, O: 2, P: 3, S: 2, F: 1, Cl: 1, Br: 1, I: 1 };

// Bond symbol -> order.
const BOND_ORDER = { '-': 1, '=': 2, '#': 3, '$': 4, ':': 1.5, '/': 1, '\\': 1 };

function isOrganicTwo(s, i) {
  if (i + 1 < s.length) {
    const two = s.slice(i, i + 2);
    if (ORGANIC.has(two)) return two;
  }
  return null;
}

/**
 * Parse SMILES into atoms and bonds. Throws on malformed input.
 * Atom: { element, aromatic, charge, explicitHydrogens, bracket, implicitH }
 * Bond: { a, b, order, aromatic }
 */
export function parseSmiles(smiles) {
  if (typeof smiles !== 'string' || smiles.trim() === '') throw new Error('empty SMILES');
  const s = smiles.trim();
  const atoms = [];
  const bonds = [];
  let i = 0;
  let prev = -1;          // index of the previous atom to bond to
  let pendingOrder = 0;   // bond order from an explicit bond symbol (0 = default)
  let pendingAromatic = false;
  const ring = new Map(); // ring number -> { atom, order }
  const branchStack = []; // saved `prev` for each open '('

  const addBond = (a, b, order, aromatic) => {
    if (a < 0 || b < 0 || a === b) return;
    bonds.push({ a, b, order, aromatic });
  };

  while (i < s.length) {
    const ch = s[i];

    if (ch === ' ') { i += 1; continue; }

    // Bond symbols
    if (BOND_ORDER[ch] !== undefined) {
      pendingOrder = BOND_ORDER[ch];
      pendingAromatic = ch === ':';
      i += 1;
      continue;
    }

    // Branch open: remember the atom we branch from; close: restore it.
    if (ch === '(') { branchStack.push(prev); i += 1; continue; }
    if (ch === ')') {
      if (branchStack.length === 0) throw new Error('unbalanced ")" at ' + i);
      prev = branchStack.pop();
      pendingOrder = 0; pendingAromatic = false;
      i += 1; continue;
    }
    if (ch === '.') { prev = -1; pendingOrder = 0; pendingAromatic = false; i += 1; continue; }

    // Ring closure digits (single or %nn)
    if ((ch >= '0' && ch <= '9') || ch === '%') {
      let num;
      if (ch === '%') { num = s.slice(i + 1, i + 3); i += 3; }
      else { num = ch; i += 1; }
      if (prev < 0) throw new Error('ring closure before atom at ' + i);
      if (ring.has(num)) {
        const openEntry = ring.get(num);
        ring.delete(num);
        const order = pendingOrder || openEntry.order || 1;
        addBond(openEntry.atom, prev, order, pendingAromatic || openEntry.aromatic || false);
      } else {
        ring.set(num, { atom: prev, order: pendingOrder || 0, aromatic: pendingAromatic });
      }
      pendingOrder = 0; pendingAromatic = false;
      continue;
    }

    // Bracket atom
    if (ch === '[') {
      const close = s.indexOf(']', i);
      if (close === -1) throw new Error('unclosed bracket atom at ' + i);
      const inner = s.slice(i + 1, close);
      const m = inner.match(/^(\d*)([A-Z][a-z]?|[a-z])(@{1,2}|@(?:TH|AL|SP|TB|OH)\d*|)(H\d*)?([+-]\d*|\++|-+)?/);
      if (!m) throw new Error('bad bracket atom: [' + inner + ']');
      const symbol = m[2];
      const aromatic = symbol === symbol.toLowerCase();
      const element = aromatic ? symbol.toUpperCase() : symbol;
      let charge = 0;
      const cs = m[5] || '';
      if (cs) {
        if (/^\++$/.test(cs)) charge = cs.length;
        else if (/^-+$/.test(cs)) charge = -cs.length;
        else { charge = parseInt(cs, 10); if (Number.isNaN(charge)) charge = 0; }
      }
      let h = 0;
      if (m[4]) h = m[4] === 'H' ? 1 : parseInt(m[4].slice(1), 10);
      const idx = atoms.length;
      atoms.push({ element, aromatic, charge, explicitHydrogens: h, bracket: true, implicitH: 0 });
      if (prev >= 0) addBond(prev, idx, pendingOrder || 1, pendingAromatic);
      pendingOrder = 0; pendingAromatic = false;
      prev = idx;
      i = close + 1;
      continue;
    }

    // Organic atom, possibly two-letter.
    const two = isOrganicTwo(s, i);
    if (two) {
      const idx = atoms.length;
      atoms.push({ element: two, aromatic: false, charge: 0, explicitHydrogens: 0, bracket: false, implicitH: 0 });
      if (prev >= 0) addBond(prev, idx, pendingOrder || 1, pendingAromatic);
      pendingOrder = 0; pendingAromatic = false;
      prev = idx; i += 2;
      continue;
    }
    if (ORGANIC.has(ch)) {
      const idx = atoms.length;
      atoms.push({ element: ch, aromatic: false, charge: 0, explicitHydrogens: 0, bracket: false, implicitH: 0 });
      if (prev >= 0) addBond(prev, idx, pendingOrder || 1, pendingAromatic);
      pendingOrder = 0; pendingAromatic = false;
      prev = idx; i += 1;
      continue;
    }
    if (AROMATIC_LOWER.has(ch)) {
      const idx = atoms.length;
      atoms.push({ element: ch.toUpperCase(), aromatic: true, charge: 0, explicitHydrogens: 0, bracket: false, implicitH: 0 });
      if (prev >= 0) addBond(prev, idx, pendingOrder || 1, true);
      pendingOrder = 0; pendingAromatic = false;
      prev = idx; i += 1;
      continue;
    }

    throw new Error('unexpected character "' + ch + '" at position ' + i);
  }

  if (atoms.length === 0) throw new Error('no atoms parsed');
  if (branchStack.length !== 0) throw new Error('unbalanced "(" in SMILES');

  // Fill implicit hydrogens from bond order sums and default valence.
  // A bond drawn between two aromatic atoms with no explicit order is aromatic
  // (order 1.5), which is how lower-case ring notation is understood.
  const usedValence = new Array(atoms.length).fill(0);
  for (const b of bonds) {
    let order = b.aromatic ? 1.5 : b.order;
    if (atoms[b.a].aromatic && atoms[b.b].aromatic && !b.aromatic && order <= 1) {
      order = 1.5;
    }
    b.effectiveOrder = order;
    usedValence[b.a] += order;
    usedValence[b.b] += order;
  }
  for (let k = 0; k < atoms.length; k++) {
    const atom = atoms[k];
    if (atom.bracket) continue; // explicit H already counted
    const base = VALENCE[atom.element];
    if (base === undefined) continue;
    // Aromatic bonds are counted as 1.5 each; a benzene carbon uses 3 for two
    // ring bonds and leaves 1 for H. No extra "aromatic" bonus is applied.
    const free = Math.round(base - usedValence[k]);
    atom.implicitH = Math.max(0, free);
  }

  return { atoms, bonds, atomCount: atoms.length };
}

/**
 * Molecular formula from the parsed graph, counting element atoms plus implicit
 * and explicit hydrogens. This is a reasonable estimate for neutral organic
 * molecules; charged or unusual-valence species can differ.
 */
export function estimateFormula(smiles) {
  const { atoms } = parseSmiles(smiles);
  const counts = new Map();
  let hydrogen = 0;
  for (const a of atoms) {
    counts.set(a.element, (counts.get(a.element) || 0) + 1);
    hydrogen += a.bracket ? (a.explicitHydrogens || 0) : (a.implicitH || 0);
  }
  if (hydrogen > 0) counts.set('H', (counts.get('H') || 0) + hydrogen);

  const order = ['C', 'H', 'N', 'O', 'P', 'S', 'F', 'Cl', 'Br', 'I'];
  const rank = (el) => { const k = order.indexOf(el); return k === -1 ? 99 : k; };
  const symbols = [...counts.keys()].sort((a, b) => rank(a) - rank(b));
  const parts = [];
  for (const el of symbols) {
    const n = counts.get(el) || 0;
    if (n <= 0) continue;
    parts.push(el + (n > 1 ? n : ''));
  }
  return parts.join('');
}

/** Validate SMILES; returns {valid, atomCount, error?}. */
export function validateSmiles(smiles) {
  try {
    const parsed = parseSmiles(smiles);
    return { valid: true, atomCount: parsed.atomCount };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) };
  }
}
