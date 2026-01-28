import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger.js';

export async function cloneRepository(
  repoUrl: string,
  targetDir: string,
  branch: string = 'main'
): Promise<void> {
  try {
    // Ensure target directory exists and is empty
    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.mkdir(targetDir, { recursive: true });

    const git: SimpleGit = simpleGit();
    await git.clone(repoUrl, targetDir, ['--branch', branch, '--single-branch', '--depth', '1']);

    logger.info({ repoUrl, targetDir, branch }, 'Repository cloned successfully');
  } catch (error) {
    logger.error({ error, repoUrl, targetDir }, 'Failed to clone repository');
    throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function pullRepository(targetDir: string): Promise<void> {
  try {
    const git: SimpleGit = simpleGit(targetDir);

    // Reset any local changes and pull
    await git.reset(['--hard', 'HEAD']);
    await git.pull();

    logger.info({ targetDir }, 'Repository pulled successfully');
  } catch (error) {
    logger.error({ error, targetDir }, 'Failed to pull repository');
    throw new Error(`Failed to pull repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function isGitRepository(targetDir: string): Promise<boolean> {
  try {
    const git: SimpleGit = simpleGit(targetDir);
    return await git.checkIsRepo();
  } catch {
    return false;
  }
}

export async function getRepositoryInfo(targetDir: string): Promise<{
  currentBranch: string;
  lastCommit: string;
  lastCommitDate: string;
} | null> {
  try {
    const git: SimpleGit = simpleGit(targetDir);

    if (!(await git.checkIsRepo())) {
      return null;
    }

    const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
    const log = await git.log({ maxCount: 1 });

    return {
      currentBranch: branch.trim(),
      lastCommit: log.latest?.message || 'No commits',
      lastCommitDate: log.latest?.date || '',
    };
  } catch (error) {
    logger.error({ error, targetDir }, 'Failed to get repository info');
    return null;
  }
}
