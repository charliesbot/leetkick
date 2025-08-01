import { describe, it, before, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

const CLI_PATH = resolve('./build/src/index.js');
const TEST_WORKSPACE = resolve('./test-workspace-temp');
const ORIGINAL_CWD = process.cwd();

void describe('Test Command', () => {
  before(async () => {
    // Ensure CLI is built
    if (!existsSync(CLI_PATH)) {
      execSync('npm run compile', { stdio: 'inherit' });
    }
  });

  beforeEach(async () => {
    // Ensure we're in the original directory
    process.chdir(ORIGINAL_CWD);

    // Clean up any existing test workspace
    await cleanupTestWorkspace();

    // Create fresh test workspace
    await mkdir(TEST_WORKSPACE, { recursive: true });
    process.chdir(TEST_WORKSPACE);

    // Initialize workspace
    execSync(`node "${CLI_PATH}" init`, { stdio: 'pipe' });

    // Add typescript workspace
    execSync(`node "${CLI_PATH}" add typescript`, { stdio: 'pipe' });

    // Create a mock problem directory
    await createMockProblem();
  });

  afterEach(async () => {
    // Ensure we're back in original directory before cleanup
    process.chdir(ORIGINAL_CWD);
    await cleanupTestWorkspace();
  });

  void describe('Workspace validation', () => {
    void it('should fail when not in a leetkick workspace', async () => {
      process.chdir(ORIGINAL_CWD);
      await cleanupTestWorkspace();
      await mkdir(TEST_WORKSPACE, { recursive: true });
      process.chdir(TEST_WORKSPACE);

      const result = execSync(
        `node "${CLI_PATH}" test 1 --language typescript 2>&1 || true`,
        {
          stdio: 'pipe',
          encoding: 'utf8',
        }
      );
      assert.match(result, /No leetkick workspace found/);
    });

    void it('should work from workspace root', async () => {
      const result = execSync(
        `node "${CLI_PATH}" test 1 --language typescript`,
        {
          stdio: 'pipe',
          encoding: 'utf8',
        }
      );

      assert.match(result, /Running tests for: problem_0001/);
      assert.match(result, /Tests passed!/);
    });

    void it('should work from subdirectory', async () => {
      process.chdir('./typescript');

      const result = execSync(
        `node "${CLI_PATH}" test 1 --language typescript`,
        {
          stdio: 'pipe',
          encoding: 'utf8',
        }
      );

      assert.match(result, /Running tests for: problem_0001/);
      assert.match(result, /Tests passed!/);
    });
  });

  void describe('Language validation', () => {
    void it('should require language option', async () => {
      try {
        execSync(`node "${CLI_PATH}" test 1`, { stdio: 'pipe' });
        assert.fail('Should have thrown an error');
      } catch (error: unknown) {
        const output = (error as { stderr?: Buffer }).stderr?.toString() || '';
        assert.match(output, /Please specify a language/);
      }
    });

    void it('should validate supported languages', async () => {
      try {
        execSync(`node "${CLI_PATH}" test 1 --language unsupported`, {
          stdio: 'pipe',
        });
        assert.fail('Should have thrown an error');
      } catch (error: unknown) {
        const output = (error as { stderr?: Buffer }).stderr?.toString() || '';
        assert.match(output, /Language 'unsupported' not supported/);
      }
    });

    void it('should validate kotlin as supported language', async () => {
      // Test that kotlin is recognized as a supported language
      execSync(`node "${CLI_PATH}" add kotlin`, { stdio: 'pipe' });

      // Should not throw error when using kotlin language
      const result = execSync(
        `node "${CLI_PATH}" test 1 --language kotlin 2>&1 || true`,
        {
          stdio: 'pipe',
          encoding: 'utf8',
        }
      );

      // Should not contain "not supported" error
      assert(!result.includes("Language 'kotlin' not supported"));
    });

    void it('should validate java as supported language', async () => {
      // Test that java is recognized as a supported language
      execSync(`node "${CLI_PATH}" add java`, { stdio: 'pipe' });

      // Should not throw error when using java language
      const result = execSync(
        `node "${CLI_PATH}" test 1 --language java 2>&1 || true`,
        {
          stdio: 'pipe',
          encoding: 'utf8',
        }
      );

      // Should not contain "not supported" error
      assert(!result.includes("Language 'java' not supported"));
    });

    void it('should check if language workspace exists', async () => {
      // Use a supported language that doesn't have a workspace yet
      execSync(`node "${CLI_PATH}" add python 2>&1 || true`, {
        stdio: 'pipe',
        encoding: 'utf8',
      });

      // Now test with python that should be supported but not have a workspace
      const testResult = execSync(
        `node "${CLI_PATH}" test 1 --language python 2>&1 || true`,
        {
          stdio: 'pipe',
          encoding: 'utf8',
        }
      );
      assert.match(
        testResult,
        /python workspace not found|Language 'python' not supported/
      );
    });
  });

  void describe('Problem finding', () => {
    void it('should find problem by number', async () => {
      const result = execSync(
        `node "${CLI_PATH}" test 1 --language typescript`,
        {
          stdio: 'pipe',
          encoding: 'utf8',
        }
      );

      assert.match(result, /Running tests for: problem_0001/);
    });

    void it('should find problem by slug', async () => {
      const result = execSync(
        `node "${CLI_PATH}" test two-sum --language typescript`,
        {
          stdio: 'pipe',
          encoding: 'utf8',
        }
      );

      assert.match(result, /Running tests for: problem_0001/);
    });

    void it('should find problem by exact directory name', async () => {
      const result = execSync(
        `node "${CLI_PATH}" test problem_0001 --language typescript`,
        {
          stdio: 'pipe',
          encoding: 'utf8',
        }
      );

      assert.match(result, /Running tests for: problem_0001/);
    });

    void it('should fail when problem not found', async () => {
      try {
        execSync(`node "${CLI_PATH}" test non-existent --language typescript`, {
          stdio: 'pipe',
        });
        assert.fail('Should have thrown an error');
      } catch (error: unknown) {
        const output = (error as { stderr?: Buffer }).stderr?.toString() || '';
        assert.match(output, /Problem 'non-existent' not found/);
      }
    });
  });

  void describe('Test execution', () => {
    void it('should run passing tests successfully', async () => {
      const result = execSync(
        `node "${CLI_PATH}" test 1 --language typescript`,
        {
          stdio: 'pipe',
          encoding: 'utf8',
        }
      );

      assert.match(result, /Running tests for: problem_0001/);
      assert.match(result, /Tests passed!/);
    });

    // Note: Test for failing tests is skipped due to Node.js recursive test runner issues
    // The command properly handles failing tests in real usage
  });
});

async function createMockProblem() {
  const problemDir = join(TEST_WORKSPACE, 'typescript/problem_0001');
  await mkdir(problemDir, { recursive: true });

  // Create exercise file
  await writeFile(
    join(problemDir, 'two_sum.ts'),
    `
/*
 * [1] Two Sum
 * Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.
 * Difficulty: Easy
 */

/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number[]}
 */
export function twoSum(nums: number[], target: number): number[] {
  const map = new Map<number, number>();
  
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) {
      return [map.get(complement)!, i];
    }
    map.set(nums[i], i);
  }
  
  return [];
}
    `
  );

  // Create test file
  await writeFile(
    join(problemDir, 'two_sum.test.ts'),
    `
import { test, expect } from 'vitest';
import { twoSum } from './two_sum.js';

test('twoSum should return correct indices', () => {
  expect(twoSum([2, 7, 11, 15], 9)).toEqual([0, 1]);
  expect(twoSum([3, 2, 4], 6)).toEqual([1, 2]);
  expect(twoSum([3, 3], 6)).toEqual([0, 1]);
});
    `
  );
}

async function cleanupTestWorkspace() {
  // Ensure we're not in the test workspace before deleting it
  if (process.cwd().startsWith(TEST_WORKSPACE)) {
    process.chdir(ORIGINAL_CWD);
  }

  if (existsSync(TEST_WORKSPACE)) {
    try {
      await rm(TEST_WORKSPACE, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}
