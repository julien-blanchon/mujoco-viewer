/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { XmlIndex } from './XmlIndex.js';
import { removeAttr, removeElement, renameElement, setAttr } from './XmlEditOps.js';

const SAMPLE = `<mujoco>
  <option gravity="0 0 -9.81"/>
  <default>
    <joint stiffness="10"/>
  </default>
  <asset>
    <material name="red" rgba="1 0 0 1"/>
    <material name="blue" rgba="0 0 1 1"/>
  </asset>
  <worldbody>
    <body name="torso" pos="0 0 1">
      <geom name="trunk" type="box" size="0.1 0.1 0.2" rgba="0.5 0.5 0.5 1"/>
      <body name="arm" pos="0 0.2 0">
        <joint name="shoulder" type="hinge" axis="0 1 0"/>
        <geom type="capsule" size="0.05" fromto="0 0 0 0 0 -0.3"/>
      </body>
    </body>
  </worldbody>
  <actuator>
    <motor name="shoulder_motor" joint="shoulder" gear="100"/>
  </actuator>
</mujoco>
`;

describe('XmlIndex', () => {
	it('buckets entities by kind in document order', () => {
		const idx = new XmlIndex(SAMPLE, { sourceFile: 'test.xml' });
		// worldbody is body[0]; "torso" body[1]; "arm" body[2].
		expect(idx.entities.body.map((b) => b.name)).toEqual([null, 'torso', 'arm']);
		expect(idx.entities.geom.map((g) => g.name)).toEqual(['trunk', null]);
		expect(idx.entities.joint.map((j) => j.name)).toEqual(['shoulder']);
		expect(idx.entities.material.map((m) => m.name)).toEqual(['red', 'blue']);
		expect(idx.entities.actuator.map((a) => a.name)).toEqual(['shoulder_motor']);
	});

	it('skips entities inside <default>', () => {
		const idx = new XmlIndex(SAMPLE, { sourceFile: 'test.xml' });
		// The <joint stiffness="10"/> inside <default> should NOT be a joint entity.
		expect(idx.entities.joint).toHaveLength(1);
		expect(idx.entities.joint[0].name).toBe('shoulder');
	});

	it('tracks parent body for hierarchical entities', () => {
		const idx = new XmlIndex(SAMPLE, { sourceFile: 'test.xml' });
		const trunk = idx.lookupByName('geom', 'trunk');
		const armCapsule = idx.entities.geom[1];
		expect(trunk?.parentBodyIndex).toBe(1); // torso
		expect(armCapsule.parentBodyIndex).toBe(2); // arm
	});

	it('captures attribute byte ranges (inside the quotes)', () => {
		const idx = new XmlIndex(SAMPLE, { sourceFile: 'test.xml' });
		const torso = idx.lookupByName('body', 'torso')!;
		const pos = torso.attrs.get('pos')!;
		expect(SAMPLE.slice(pos.valueRange.from, pos.valueRange.to)).toBe('0 0 1');
		// Quotes should be just outside the range.
		expect(SAMPLE.charCodeAt(pos.valueRange.from - 1)).toBe(34); // "
		expect(SAMPLE.charCodeAt(pos.valueRange.to)).toBe(34);
	});

	it('reports correct line/col', () => {
		const idx = new XmlIndex(SAMPLE, { sourceFile: 'test.xml' });
		const torso = idx.lookupByName('body', 'torso')!;
		expect(torso.fullRange.line).toBe(11); // 1-indexed
	});

	it('reverse-resolves offset to entity', () => {
		const idx = new XmlIndex(SAMPLE, { sourceFile: 'test.xml' });
		const trunk = idx.lookupByName('geom', 'trunk')!;
		// pick an offset *inside* the trunk geom
		const at = idx.entityAtOffset(trunk.fullRange.from + 5);
		expect(at?.name).toBe('trunk');
	});
});

describe('XmlEditOps.setAttr', () => {
	it('updates existing attribute without touching other bytes', () => {
		const idx = new XmlIndex(SAMPLE, { sourceFile: 'test.xml' });
		const torso = idx.lookupByName('body', 'torso')!;
		const next = setAttr(SAMPLE, torso, 'pos', '0 0 2');
		expect(next).toContain('pos="0 0 2"');
		// Nothing else should have moved.
		expect(next.length).toBe(SAMPLE.length);
		expect(next.replace('pos="0 0 2"', 'pos="0 0 1"')).toBe(SAMPLE);
	});

	it('inserts a new attribute before the closing >', () => {
		const idx = new XmlIndex(SAMPLE, { sourceFile: 'test.xml' });
		const torso = idx.lookupByName('body', 'torso')!;
		const next = setAttr(SAMPLE, torso, 'mocap', 'true');
		expect(next).toContain('<body name="torso" pos="0 0 1" mocap="true">');
	});

	it('escapes XML-special characters in values', () => {
		const idx = new XmlIndex(SAMPLE, { sourceFile: 'test.xml' });
		const torso = idx.lookupByName('body', 'torso')!;
		const next = setAttr(SAMPLE, torso, 'pos', '1 < 2');
		expect(next).toContain('pos="1 &lt; 2"');
		// Round-trip — re-parse and read back.
		const idx2 = new XmlIndex(next, { sourceFile: 'test.xml' });
		expect(idx2.lookupByName('body', 'torso')!.attrs.get('pos')!.value).toBe('1 < 2');
	});

	it('handles self-closing elements', () => {
		const idx = new XmlIndex(SAMPLE, { sourceFile: 'test.xml' });
		const red = idx.lookupByName('material', 'red')!;
		const next = setAttr(SAMPLE, red, 'rgba', '0.9 0.1 0.1 1');
		expect(next).toContain('<material name="red" rgba="0.9 0.1 0.1 1"/>');
	});
});

describe('XmlEditOps.removeAttr', () => {
	it('removes attribute and its leading whitespace', () => {
		const idx = new XmlIndex(SAMPLE, { sourceFile: 'test.xml' });
		const torso = idx.lookupByName('body', 'torso')!;
		const next = removeAttr(SAMPLE, torso, 'pos');
		expect(next).toContain('<body name="torso">');
		// torso lost its pos; arm body still has its own.
		const idx2 = new XmlIndex(next, { sourceFile: 'test.xml' });
		expect(idx2.lookupByName('body', 'torso')!.attrs.has('pos')).toBe(false);
		expect(idx2.lookupByName('body', 'arm')!.attrs.get('pos')!.value).toBe('0 0.2 0');
	});
});

describe('XmlEditOps.renameElement', () => {
	it('updates existing name attribute', () => {
		const idx = new XmlIndex(SAMPLE, { sourceFile: 'test.xml' });
		const torso = idx.lookupByName('body', 'torso')!;
		const next = renameElement(SAMPLE, torso, 'chest');
		expect(next).toContain('<body name="chest"');
	});

	it('inserts name attribute when missing', () => {
		const idx = new XmlIndex(SAMPLE, { sourceFile: 'test.xml' });
		// the second geom (in <body name="arm">) has no name
		const unnamed = idx.entities.geom[1];
		expect(unnamed.name).toBe(null);
		const next = renameElement(SAMPLE, unnamed, 'forearm');
		const idx2 = new XmlIndex(next, { sourceFile: 'test.xml' });
		expect(idx2.lookupByName('geom', 'forearm')).toBeTruthy();
	});
});

describe('XmlEditOps.removeElement', () => {
	it('removes the element and its surrounding whitespace', () => {
		const idx = new XmlIndex(SAMPLE, { sourceFile: 'test.xml' });
		const arm = idx.lookupByName('body', 'arm')!;
		const next = removeElement(SAMPLE, arm);
		const idx2 = new XmlIndex(next, { sourceFile: 'test.xml' });
		expect(idx2.lookupByName('body', 'arm')).toBe(null);
		// shoulder joint and arm capsule went with it
		expect(idx2.lookupByName('joint', 'shoulder')).toBe(null);
	});
});

// Multi-file scenes — e.g. Shadow Hand / Cassie / Skydio where `scene.xml`
// just `<include>`s a component file. The aggregated index keeps records in
// compile order while tagging each with its originating file so edit ops can
// splice the right text.
const SCENE_WITH_INCLUDE = `<mujoco>
  <include file="hand.xml"/>
  <worldbody>
    <geom name="floor" type="plane" size="1 1 0.1"/>
  </worldbody>
</mujoco>
`;
const HAND_XML = `<mujoco>
  <worldbody>
    <body name="palm" pos="0 0 1">
      <joint name="wrist" type="hinge" axis="0 1 0"/>
      <geom name="palm_geom" type="box" size="0.05 0.02 0.05"/>
    </body>
  </worldbody>
  <actuator>
    <motor name="wrist_motor" joint="wrist" gear="50"/>
  </actuator>
</mujoco>
`;

describe('XmlIndex with <include>', () => {
	function makeMultiFileIndex(): XmlIndex {
		return new XmlIndex(SCENE_WITH_INCLUDE, {
			sourceFile: 'scene.xml',
			resolveInclude: (rel) =>
				rel === 'hand.xml' ? { fname: 'hand.xml', text: HAND_XML } : null
		});
	}

	it('expands include bodies into compile order', () => {
		const idx = makeMultiFileIndex();
		// worldbody is body[0]; palm (from include) body[1]. MuJoCo processes
		// <include> in the order it appears, so palm comes before main-file
		// bodies at the same level… but this fixture's main <worldbody> has no
		// child bodies, so body indices are just [worldbody, palm].
		expect(idx.entities.body.map((b) => b.name)).toEqual([null, 'palm']);
	});

	it('tags records with their source file', () => {
		const idx = makeMultiFileIndex();
		const floor = idx.lookupByName('geom', 'floor')!;
		const palmGeom = idx.lookupByName('geom', 'palm_geom')!;
		const wrist = idx.lookupByName('joint', 'wrist')!;
		const motor = idx.lookupByName('actuator', 'wrist_motor')!;
		expect(floor.sourceFile).toBe('scene.xml');
		expect(palmGeom.sourceFile).toBe('hand.xml');
		expect(wrist.sourceFile).toBe('hand.xml');
		expect(motor.sourceFile).toBe('hand.xml');
	});

	it('retains per-file text via textOf()', () => {
		const idx = makeMultiFileIndex();
		expect(idx.textOf('scene.xml')).toBe(SCENE_WITH_INCLUDE);
		expect(idx.textOf('hand.xml')).toBe(HAND_XML);
		expect(idx.textOf('missing.xml')).toBe(null);
	});

	it('edits splice the include file, not the main scene', () => {
		const idx = makeMultiFileIndex();
		const palm = idx.lookupByName('body', 'palm')!;
		const handNext = setAttr(HAND_XML, palm, 'pos', '0 0 2');
		expect(handNext).toContain('pos="0 0 2"');
		// Scene file should be untouched when editing an include entity.
		expect(handNext).not.toBe(SCENE_WITH_INCLUDE);
		// Re-parse the updated hand file and confirm the body moved.
		const idx2 = new XmlIndex(SCENE_WITH_INCLUDE, {
			sourceFile: 'scene.xml',
			resolveInclude: (rel) =>
				rel === 'hand.xml' ? { fname: 'hand.xml', text: handNext } : null
		});
		expect(idx2.lookupByName('body', 'palm')!.attrs.get('pos')!.value).toBe('0 0 2');
	});

	it('skips includes when no resolver is supplied (legacy behavior)', () => {
		const idx = new XmlIndex(SCENE_WITH_INCLUDE, { sourceFile: 'scene.xml' });
		expect(idx.lookupByName('body', 'palm')).toBe(null);
		// Only the main-file floor geom shows up.
		expect(idx.entities.geom.map((g) => g.name)).toEqual(['floor']);
	});
});
