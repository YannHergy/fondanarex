import { describe, expect, it } from 'vitest';

import {
    analyseInflation,
    classifyLevel,
    classifyTrajectory,
    FLAT_THRESHOLD,
    levelLabel,
    stanceLabel,
    trajectoryLabel,
    type InflationLevel,
    type Trajectory,
} from './inflation-analysis';

describe('classifyLevel', () => {
    it('bands against the 2 % target with a half-point buffer', () => {
        expect(classifyLevel(3.2)).toBe('HIGH');
        expect(classifyLevel(2.0)).toBe('TARGET');
        expect(classifyLevel(1.0)).toBe('LOW');
    });

    it('treats the whole buffer as on-target', () => {
        expect(classifyLevel(2.5)).toBe('TARGET');
        expect(classifyLevel(1.5)).toBe('TARGET');
        expect(classifyLevel(2.51)).toBe('HIGH');
        expect(classifyLevel(1.49)).toBe('LOW');
    });

    it('handles deflation', () => {
        expect(classifyLevel(-0.4)).toBe('LOW');
    });
});

describe('classifyTrajectory', () => {
    it('reads direction', () => {
        expect(classifyTrajectory(0.4)).toBe('rising');
        expect(classifyTrajectory(-0.4)).toBe('falling');
        expect(classifyTrajectory(0)).toBe('flat');
    });

    it('ignores movement inside the noise floor', () => {
        // The legacy version tested `variation > 0`, so a 0.01 revision — well
        // inside the rounding of a published figure — scored as a full
        // acceleration and moved the result by 35 points.
        expect(classifyTrajectory(0.01)).toBe('flat');
        expect(classifyTrajectory(-0.01)).toBe('flat');
        expect(classifyTrajectory(FLAT_THRESHOLD)).toBe('flat');
    });

    it('acts just outside the noise floor', () => {
        expect(classifyTrajectory(FLAT_THRESHOLD + 0.01)).toBe('rising');
    });
});

describe('analyseInflation', () => {
    it('scores the worst case highest: rising while already high', () => {
        const result = analyseInflation(4.2, 3.8);
        expect(result.trajectory).toBe('rising');
        expect(result.level).toBe('HIGH');
        expect(result.score).toBe(35);
        expect(result.stance).toBe('MAX_HAWKISH');
    });

    it('scores falling-below-target as the most dovish', () => {
        // Disinflation heading toward deflation is what a central bank cuts
        // hardest against — it is not a milder version of the same thing.
        const result = analyseInflation(0.8, 1.3);
        expect(result.score).toBe(-35);
        expect(result.stance).toBe('MAX_DOVISH');
    });

    it('is neutral at target and stable', () => {
        const result = analyseInflation(2.0, 2.0);
        expect(result.scenario).toBe('Goldilocks');
        expect(result.score).toBe(0);
        expect(result.stance).toBe('NEUTRAL');
    });

    it('is asymmetric: the same fall reads differently by level', () => {
        // A 0.4 point fall from 3.4 is progress; the same fall from 1.4 is a
        // problem. Symmetric scoring would miss the entire point.
        const fromHigh = analyseInflation(3.0, 3.4);
        const fromLow = analyseInflation(1.0, 1.4);
        expect(fromHigh.score).toBe(10);
        expect(fromLow.score).toBe(-35);
    });

    it('treats a rebound from below target as almost neutral, not hawkish', () => {
        const result = analyseInflation(1.2, 0.9);
        expect(result.score).toBe(5);
        expect(result.level).toBe('LOW');
        expect(result.trajectory).toBe('rising');
    });

    it('penalises inflation that is high and simply not falling', () => {
        const result = analyseInflation(3.5, 3.5);
        expect(result.trajectory).toBe('flat');
        expect(result.score).toBe(20);
    });

    it('assumes flat with no previous reading rather than inventing a direction', () => {
        const result = analyseInflation(2.0);
        expect(result.previous).toBe(2.0);
        expect(result.trajectory).toBe('flat');
        expect(result.variation).toBe(0);
    });

    it('accepts a null previous the same way', () => {
        expect(analyseInflation(3.0, null).trajectory).toBe('flat');
    });

    it('reports the variation it used', () => {
        expect(analyseInflation(2.6, 2.1).variation).toBe(0.5);
        expect(analyseInflation(2.1, 2.6).variation).toBe(-0.5);
    });

    it('covers all nine combinations with distinct scenarios', () => {
        const seen = new Set<string>();

        for (const [current, previous] of [
            [4.0, 3.5], [2.0, 1.7], [1.0, 0.7], // rising: high, target, low
            [4.0, 4.0], [2.0, 2.0], [1.0, 1.0], // flat
            [3.0, 3.5], [2.0, 2.4], [1.0, 1.5], // falling
        ]) {
            seen.add(analyseInflation(current!, previous!).scenario);
        }

        expect(seen.size).toBe(9);
    });

    it('keeps every score inside the documented range', () => {
        for (let current = -1; current <= 8; current += 0.25) {
            for (const delta of [-1, -0.3, 0, 0.3, 1]) {
                const result = analyseInflation(current, current - delta);
                expect(result.score).toBeGreaterThanOrEqual(-35);
                expect(result.score).toBeLessThanOrEqual(35);
            }
        }
    });

    it('always carries a readable explanation', () => {
        const result = analyseInflation(3.4, 3.0);
        expect(result.reading.length).toBeGreaterThan(40);
        expect(result.stanceLabel.length).toBeGreaterThan(0);
    });
});

describe('labels', () => {
    it('names every trajectory and level', () => {
        for (const trajectory of ['rising', 'flat', 'falling'] as Trajectory[]) {
            expect(trajectoryLabel(trajectory).length).toBeGreaterThan(0);
        }
        for (const level of ['HIGH', 'TARGET', 'LOW'] as InflationLevel[]) {
            expect(levelLabel(level).length).toBeGreaterThan(0);
        }
    });

    it('names every stance the matrix can produce', () => {
        for (let current = 0; current <= 5; current += 0.5) {
            for (const delta of [-0.5, 0, 0.5]) {
                const result = analyseInflation(current, current - delta);
                expect(stanceLabel(result.stance)).toBeTruthy();
            }
        }
    });
});
